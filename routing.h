#pragma once

#include "models.h"

#include <string>
#include <vector>

struct RouteOut {
    bool   found        = false;
    double dist_km      = INF;
    double time_min     = 0;
    int    dij_explored = 0, dij_relaxed = 0;
    int    ast_explored = 0, ast_relaxed = 0, ast_pruned = 0;
    int    bfs_explored = 0, bfs_relaxed = 0;
    std::string error;
    std::vector<int> path;
};

RouteOut computeRoute(int src, int dst, const std::vector<double>& edgeMult);
