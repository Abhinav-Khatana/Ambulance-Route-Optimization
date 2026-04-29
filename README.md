# SAROS Dispatch Console

Ambulance route optimization project with a C++ backend, MySQL authentication, and a browser-based frontend.

## Structure

- `index.html` loads the frontend shell.
- `frontend/styles.css` contains the UI styling.
- `frontend/app.js` contains the map, traffic, hospital, and route UI logic.
- `frontend/auth_ui.js` contains login, signup, session, and logout UI logic.
- `server.cpp` contains backend startup.
- `backend/` contains backend modules for graph data, routing, HTTP, JSON, platform sockets, shared state, and models.
- `auth_db.cpp` and `auth_db.h` contain MySQL authentication storage.

## Run

```powershell
cd C:\Users\abhin\Desktop\whatproj
$env:PATH="C:\Program Files\MySQL\MySQL Server 8.0\lib;$env:PATH"
$env:SAROS_DB_HOST="127.0.0.1"
$env:SAROS_DB_PORT="3306"
$env:SAROS_DB_USER="root"
$env:SAROS_DB_PASS="lmnqazytashb"
$env:SAROS_DB_NAME="saros_db"
.\server.exe
```

Then open `index.html` in the browser.

## Build

```powershell
g++ -std=c++17 -O2 -o server.exe server.cpp backend\geo.cpp backend\graph_data.cpp backend\http_server.cpp backend\json_utils.cpp backend\routing.cpp backend\state.cpp auth_db.cpp -I"C:\Program Files\MySQL\MySQL Server 8.0\include" -L"C:\Program Files\MySQL\MySQL Server 8.0\lib" -lmysql -lws2_32
```
