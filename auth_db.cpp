#include "auth_db.h"

#if __has_include(<mysql/mysql.h>)
#include <mysql/mysql.h>
#else
#include <mysql.h>
#endif

#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <cstdlib>
#include <iomanip>
#include <random>
#include <sstream>
#include <utility>

namespace {
MYSQL* asMySQL(void* p) {
    return reinterpret_cast<MYSQL*>(p);
}

const char* safeStr(const std::string& s) {
    return s.c_str();
}

std::string envOr(const char* key, const std::string& fallback) {
    const char* v = std::getenv(key);
    return (v && *v) ? std::string(v) : fallback;
}

bool fetchSingleUser(MYSQL* conn, AuthUser& user) {
    MYSQL_RES* res = mysql_store_result(conn);
    if (!res) return false;

    MYSQL_ROW row = mysql_fetch_row(res);
    if (!row) {
        mysql_free_result(res);
        return false;
    }

    user.id       = row[0] ? std::stoi(row[0]) : -1;
    user.username = row[1] ? row[1] : "";
    user.email    = row[2] ? row[2] : "";

    mysql_free_result(res);
    return true;
}

}

AuthDB::AuthDB() : AuthDB(Config{}) {}

AuthDB::AuthDB(Config cfg) : cfg_(std::move(cfg)) {
    cfg_.host     = envOr("SAROS_DB_HOST", cfg_.host);
    cfg_.user     = envOr("SAROS_DB_USER", cfg_.user);
    cfg_.password = envOr("SAROS_DB_PASS", cfg_.password);
    cfg_.database = safeDatabaseName(envOr("SAROS_DB_NAME", cfg_.database));

    if (const char* p = std::getenv("SAROS_DB_PORT")) {
        try { cfg_.port = static_cast<unsigned>(std::stoul(p)); } catch (...) {}
    }
}

AuthDB::~AuthDB() {
    close();
}

void AuthDB::close() {
    if (conn_) {
        mysql_close(asMySQL(conn_));
        conn_ = nullptr;
    }
    ready_ = false;
}

std::string AuthDB::safeDatabaseName(const std::string& input) {
    std::string out;
    out.reserve(input.size());
    for (unsigned char c : input) {
        if (std::isalnum(c) || c == '_') out.push_back(static_cast<char>(c));
    }
    return out.empty() ? std::string("saros_db") : out;
}

std::string AuthDB::quoteIdent(const std::string& ident) const {
    std::string out = "`";
    for (char c : ident) {
        if (c == '`') out += "``";
        else out.push_back(c);
    }
    out.push_back('`');
    return out;
}

std::string AuthDB::escape(const std::string& input) const {
    MYSQL* conn = asMySQL(conn_);
    if (!conn) return input;
    std::string out;
    out.resize(input.size() * 2 + 1);
    unsigned long len = mysql_real_escape_string(conn, out.data(), input.c_str(), static_cast<unsigned long>(input.size()));
    out.resize(len);
    return out;
}

unsigned long long AuthDB::unixNow() {
    using namespace std::chrono;
    return static_cast<unsigned long long>(duration_cast<seconds>(system_clock::now().time_since_epoch()).count());
}

std::string AuthDB::randomTokenHex(std::size_t bytes) {
    static thread_local std::mt19937_64 rng{std::random_device{}()};
    std::uniform_int_distribution<unsigned long long> dist(0, 255);
    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (std::size_t i = 0; i < bytes; ++i) {
        oss << std::setw(2) << static_cast<unsigned>(dist(rng));
    }
    return oss.str();
}

bool AuthDB::connectTo(const std::string& database, std::string* error) {
    close();

    MYSQL* conn = mysql_init(nullptr);
    if (!conn) {
        if (error) *error = "mysql_init failed";
        return false;
    }

    unsigned int timeoutSec = 5;
    mysql_options(conn, MYSQL_OPT_CONNECT_TIMEOUT, &timeoutSec);
    const char* charset = "utf8mb4";
    mysql_options(conn, MYSQL_SET_CHARSET_NAME, charset);

    MYSQL* rc = mysql_real_connect(
        conn,
        cfg_.host.c_str(),
        cfg_.user.c_str(),
        cfg_.password.empty() ? nullptr : cfg_.password.c_str(),
        database.empty() ? nullptr : database.c_str(),
        cfg_.port,
        nullptr,
        0
    );

    if (!rc) {
        if (error) *error = mysql_error(conn);
        mysql_close(conn);
        return false;
    }

    conn_ = conn;
    return true;
}

bool AuthDB::ensureSchema(std::string* error) {
    MYSQL* conn = asMySQL(conn_);
    if (!conn) {
        if (error) *error = "database connection is not open";
        return false;
    }

    const std::string usersSql =
        "CREATE TABLE IF NOT EXISTS users ("
        "id INT AUTO_INCREMENT PRIMARY KEY,"
        "username VARCHAR(64) NOT NULL UNIQUE,"
        "email VARCHAR(190) NOT NULL UNIQUE,"
        "password_hash CHAR(64) NOT NULL,"
        "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    const std::string sessionsSql =
        "CREATE TABLE IF NOT EXISTS sessions ("
        "token CHAR(64) PRIMARY KEY,"
        "user_id INT NOT NULL,"
        "expires_at BIGINT UNSIGNED NOT NULL,"
        "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"
        "INDEX(user_id),"
        "CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    if (mysql_query(conn, usersSql.c_str()) != 0) {
        if (error) *error = mysql_error(conn);
        return false;
    }

    if (mysql_query(conn, sessionsSql.c_str()) != 0) {
        if (error) *error = mysql_error(conn);
        return false;
    }

    return true;
}

bool AuthDB::init(std::string* error) {
    const std::string dbName = cfg_.database;

    if (!connectTo("", error)) return false;

    {
        const std::string createDb = "CREATE DATABASE IF NOT EXISTS " + quoteIdent(dbName) +
            " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci";
        if (mysql_query(asMySQL(conn_), createDb.c_str()) != 0) {
            if (error) *error = mysql_error(asMySQL(conn_));
            close();
            return false;
        }
    }

    if (!connectTo(dbName, error)) return false;
    if (!ensureSchema(error)) {
        close();
        return false;
    }

    ready_ = true;
    return true;
}

bool AuthDB::signup(const std::string& username,
                    const std::string& email,
                    const std::string& password,
                    std::string& message) {
    MYSQL* conn = asMySQL(conn_);
    if (!ready_ || !conn) {
        message = "database is not ready";
        return false;
    }

    if (username.empty() || email.empty() || password.empty()) {
        message = "Username, email and password are required.";
        return false;
    }

    const std::string qUser = escape(username);
    const std::string qEmail = escape(email);
    const std::string qPass = escape(password);

    const std::string sql =
        "INSERT INTO users (username, email, password_hash) VALUES ('" + qUser + "', '" + qEmail + "', SHA2('" + qPass + "', 256))";

    if (mysql_query(conn, sql.c_str()) != 0) {
        const unsigned err = mysql_errno(conn);
        if (err == 1062) {
            message = "Username or email already exists.";
        } else {
            message = mysql_error(conn);
        }
        return false;
    }

    message = "Signup successful.";
    return true;
}

bool AuthDB::login(const std::string& identifier,
                   const std::string& password,
                   AuthUser& user,
                   std::string& token,
                   std::string& message) {
    MYSQL* conn = asMySQL(conn_);
    if (!ready_ || !conn) {
        message = "database is not ready";
        return false;
    }

    if (identifier.empty() || password.empty()) {
        message = "Identifier and password are required.";
        return false;
    }

    const std::string qId = escape(identifier);
    const std::string qPass = escape(password);

    const std::string sql =
        "SELECT id, username, email FROM users "
        "WHERE (username='" + qId + "' OR email='" + qId + "') "
        "AND password_hash = SHA2('" + qPass + "', 256) LIMIT 1";

    if (mysql_query(conn, sql.c_str()) != 0) {
        message = mysql_error(conn);
        return false;
    }

    MYSQL_RES* res = mysql_store_result(conn);
    if (!res) {
        message = mysql_error(conn);
        return false;
    }

    MYSQL_ROW row = mysql_fetch_row(res);
    if (!row) {
        mysql_free_result(res);
        message = "Invalid credentials.";
        return false;
    }

    user.id = row[0] ? std::stoi(row[0]) : -1;
    user.username = row[1] ? row[1] : "";
    user.email = row[2] ? row[2] : "";
    mysql_free_result(res);

    token = randomTokenHex(32);
    const unsigned long long expires = unixNow() + 7ULL * 24ULL * 60ULL * 60ULL;
    const std::string qToken = escape(token);

    const std::string ins =
        "INSERT INTO sessions (token, user_id, expires_at) VALUES ('" + qToken + "', " +
        std::to_string(user.id) + ", " + std::to_string(expires) + ")";

    if (mysql_query(conn, ins.c_str()) != 0) {
        message = mysql_error(conn);
        return false;
    }

    message = "Login successful.";
    return true;
}

bool AuthDB::validateToken(const std::string& token, AuthUser& user) {
    MYSQL* conn = asMySQL(conn_);
    if (!ready_ || !conn || token.empty()) return false;

    const std::string qToken = escape(token);
    const std::string sql =
        "SELECT u.id, u.username, u.email FROM sessions s "
        "JOIN users u ON u.id = s.user_id "
        "WHERE s.token='" + qToken + "' AND s.expires_at > UNIX_TIMESTAMP() LIMIT 1";

    if (mysql_query(conn, sql.c_str()) != 0) return false;

    MYSQL_RES* res = mysql_store_result(conn);
    if (!res) return false;

    MYSQL_ROW row = mysql_fetch_row(res);
    if (!row) {
        mysql_free_result(res);
        return false;
    }

    user.id = row[0] ? std::stoi(row[0]) : -1;
    user.username = row[1] ? row[1] : "";
    user.email = row[2] ? row[2] : "";
    mysql_free_result(res);
    return true;
}

bool AuthDB::logout(const std::string& token) {
    MYSQL* conn = asMySQL(conn_);
    if (!ready_ || !conn || token.empty()) return false;

    const std::string qToken = escape(token);
    const std::string sql = "DELETE FROM sessions WHERE token='" + qToken + "'";
    return mysql_query(conn, sql.c_str()) == 0;
}
