#include "routing.h"

#include "geo.h"
#include "state.h"

#include <algorithm>
#include <functional>
#include <queue>
#include <utility>
#include <vector>

using PQ = std::priority_queue<
    std::pair<double,int>,
    std::vector<std::pair<double,int>>,
    std::greater<std::pair<double,int>>>;

struct DijkstraResult {
    std::vector<double> dist;
    std::vector<int>    prev;
    int                 explored;
    int                 relaxed;
};

struct BFSResult {
    std::vector<int> prev;
    int                 explored;
    int                 relaxed;
};

DijkstraResult runDijkstra(int src,
                            const std::vector<double>& edgeMult)
{
    int N = (int)G_nodes.size();
    DijkstraResult R;
    R.dist.assign(N, INF);
    R.prev.assign(N, -1);
    R.explored = 0;
    R.relaxed  = 0;

    PQ pq;
    R.dist[src] = 0.0;
    pq.push({0.0, src});

    while (!pq.empty()) {

        double d = pq.top().first;
        int    u = pq.top().second;
        pq.pop();

        if (d > R.dist[u] + 1e-9) continue;
        ++R.explored;


        for (int ai = 0; ai < (int)G_adj[u].size(); ++ai) {
            int v   = G_adj[u][ai].first;
            int eid = G_adj[u][ai].second;

            double w  = G_edges[eid].km * edgeMult[eid];
            double nd = R.dist[u] + w;
            ++R.relaxed;
            if (nd < R.dist[v] - 1e-9) {
                R.dist[v] = nd;
                R.prev[v] = u;
                pq.push({nd, v});
            }
        }
    }
    return R;
}

struct AStarResult {
    std::vector<double> g;
    std::vector<int>    prev;
    int                 explored;
    int                 relaxed;
    int                 pruned;
};

AStarResult runAStar(int src, int dst,
                     const std::vector<double>& edgeMult,
                     double upperBound)
{
    int N = (int)G_nodes.size();
    AStarResult R;
    R.g.assign(N, INF);
    R.prev.assign(N, -1);
    R.explored = 0;
    R.relaxed  = 0;
    R.pruned   = 0;


    auto h = [&](int n) -> double {
        return haversine(G_nodes[n].lat, G_nodes[n].lng,
                         G_nodes[dst].lat, G_nodes[dst].lng);
    };

    PQ open;
    std::vector<bool> closed(N, false);

    R.g[src] = 0.0;
    open.push({h(src), src});

    while (!open.empty()) {


        double fval = open.top().first;
        int    u    = open.top().second;
        open.pop();

        (void)fval;

        if (closed[u]) continue;
        closed[u] = true;
        ++R.explored;

        if (u == dst) break;


        for (int ai = 0; ai < (int)G_adj[u].size(); ++ai) {
            int v   = G_adj[u][ai].first;
            int eid = G_adj[u][ai].second;

            if (closed[v]) continue;
            double w  = G_edges[eid].km * edgeMult[eid];
            double ng = R.g[u] + w;
            double fv = ng + h(v);
            ++R.relaxed;


            if (fv > upperBound + 1e-9) {
                ++R.pruned;
                continue;
            }

            if (ng < R.g[v] - 1e-9) {
                R.g[v]    = ng;
                R.prev[v] = u;
                open.push({fv, v});
            }
        }
    }
    return R;
}

BFSResult runBFS(int src, int dst){
    BFSResult R;
    R.prev.assign(G_nodes.size(), -1);

    std::vector<char> vis(G_nodes.size(), false);
    std::queue<int> q;
    q.push(src);
    vis[src] = true;

    while(!q.empty()){
        int u = q.front();
        q.pop();
        ++R.explored;

        if(u == dst) break;

        for (int ai = 0; ai < (int)G_adj[u].size(); ++ai) {
            int v   = G_adj[u][ai].first;
            int eid = G_adj[u][ai].second;
            (void)eid;
            ++R.relaxed;
            if(vis[v]) continue;
            vis[v] = true;
            R.prev[v] = u;
            q.push(v);
        }
    }
    return R;
}

std::vector<int> reconstructPath(const std::vector<int>& prev, int src, int dst){
    std::vector<int> path;
    for (int c = dst; c != -1; c = prev[c]){
        path.push_back(c);
        if (c == src) break;
        if (path.size() > G_nodes.size() + 1) return {};
    }
    if (path.empty() || path.back() != src) return {};
    std::reverse(path.begin(), path.end());
    return path;
}

RouteOut computeRoute(int src, int dst,
                      const std::vector<double>& edgeMult)
{
    RouteOut out;
    if (src == dst){
        out.found = true;
        out.path  = {src};
        return out;
    }


    BFSResult bfs = runBFS(src, dst);
    out.bfs_explored  = bfs.explored;
    out.bfs_relaxed   = bfs.relaxed;


    DijkstraResult dij = runDijkstra(src, edgeMult);
    out.dij_explored   = dij.explored;
    out.dij_relaxed    = dij.relaxed;

    if (dij.dist[dst] >= INF){
        out.error = "No path exists between source and destination.";
        return out;
    }
    double D_star = dij.dist[dst];


    AStarResult ast = runAStar(src, dst, edgeMult, D_star);
    out.ast_explored  = ast.explored;
    out.ast_relaxed   = ast.relaxed;
    out.ast_pruned    = ast.pruned;

    std::vector<int> path;
    double cost;

    if (ast.g[dst] < INF){
        path = reconstructPath(ast.prev, src, dst);
        cost = ast.g[dst];
    }
    if (path.empty()){
        path = reconstructPath(dij.prev, src, dst);
        cost = dij.dist[dst];
    }

    if (path.empty()){
        out.error = "Path reconstruction failed.";
        return out;
    }

    double avgMult = 1.0;
    if (path.size() > 1){
        double sumMult = 0; int cnt = 0;
        for (int i = 0; i+1 < (int)path.size(); i++){

            for (int ai = 0; ai < (int)G_adj[path[i]].size(); ++ai) {
                int v   = G_adj[path[i]][ai].first;
                int eid = G_adj[path[i]][ai].second;
                if (v == path[i+1]){ sumMult += edgeMult[eid]; cnt++; break; }
            }
        }
        if (cnt > 0) avgMult = sumMult / cnt;
    }
    double real_km   = cost / avgMult;
    double speed_kmh = AMB_KMPH / avgMult;
    out.time_min     = (real_km / speed_kmh) * 60.0;
    out.dist_km      = real_km;
    out.path         = path;
    out.found        = true;
    return out;
}
