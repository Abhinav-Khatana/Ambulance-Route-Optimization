#pragma once

#include <string>

struct AuthUser {
    int id = -1;
    std::string username;
    std::string email;
};

class AuthDB {
public:
    struct Config {
        std::string host    = "127.0.0.1";
        unsigned    port    = 3306;
        std::string user    = "root";
        std::string password;
        std::string database = "saros_db";
    };

    AuthDB();
    explicit AuthDB(Config cfg);
    ~AuthDB();

    bool init(std::string* error = nullptr);
    void close();
    bool ready() const { return ready_; }

    bool signup(const std::string& username,
                const std::string& email,
                const std::string& password,
                std::string& message);

    bool login(const std::string& identifier,
               const std::string& password,
               AuthUser& user,
               std::string& token,
               std::string& message);

    bool validateToken(const std::string& token, AuthUser& user);
    bool logout(const std::string& token);

private:
    Config cfg_;
    void*  conn_ = nullptr;
    bool   ready_ = false;

    bool connectTo(const std::string& database, std::string* error);
    bool ensureSchema(std::string* error);
    std::string escape(const std::string& input) const;
    std::string quoteIdent(const std::string& ident) const;
    static std::string randomTokenHex(std::size_t bytes = 32);
    static std::string safeDatabaseName(const std::string& input);
    static unsigned long long unixNow();
};
