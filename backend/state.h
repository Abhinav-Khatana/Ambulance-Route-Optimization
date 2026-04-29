#pragma once

#include "models.h"
#include "../auth_db.h"

#include <utility>
#include <vector>

extern std::vector<Node> G_nodes;
extern std::vector<EdgeDef> G_edges;
extern std::vector<std::vector<std::pair<int,int>>> G_adj;
extern std::vector<Hospital> G_hosp;
extern AuthDB gAuth;
