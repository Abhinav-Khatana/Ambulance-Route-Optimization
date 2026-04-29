#pragma once

#include <limits>
#include <string>

inline const double INF = std::numeric_limits<double>::infinity();
inline const int PORT = 8765;
inline const double AMB_KMPH = 60.0;

struct Node {
    int id;
    std::string name;
    double lat, lng;
};

struct EdgeDef {
    int id;
    int u, v;
    double km;
    std::string road;
};

struct Hospital {
    int id;
    std::string name, address, phone, speciality;
    int beds;
    double lat, lng;
    int snap_node;
};
