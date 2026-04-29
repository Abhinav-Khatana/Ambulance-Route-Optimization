#include "backend/graph_data.h"
#include "backend/http_server.h"
#include "backend/platform.h"
#include "backend/state.h"

#include <iostream>
#include <string>

int main(){
#ifdef _WIN32
    WSADATA w; WSAStartup(MAKEWORD(2,2),&w);
#endif
    buildGraph();
    buildHospitals();

    std::string authErr;
    if(!gAuth.init(&authErr)) {
        std::cerr << "[auth] database disabled: " << authErr << "\n";
    } else {
        std::cout << "  Auth DB : ready (users + sessions)\n";
    }

    int edgeCnt=0;
    for(int i=0;i<(int)G_adj.size();i++) edgeCnt+=(int)G_adj[i].size();

    std::cout
      <<"\nSAROS Backend | Dehradun Road Network\n"
      <<"Nodes     : "<<G_nodes.size()<<"\n"
      <<"Edges     : "<<edgeCnt/2<<"\n"
      <<"Hospitals : "<<G_hosp.size()<<"\n"
      <<"Algorithm : Dijkstra -> A*\n"
      <<"Port      : "<<PORT<<"\n"
      <<"URL       : http://localhost:"<<PORT<<"\n\n"
      <<"Endpoints:\n"
      <<"GET  /api/health\n"
      <<"GET  /api/graph\n"
      <<"GET  /api/hospitals\n"
      <<"POST /api/signup\n"
      <<"POST /api/login\n"
      <<"POST /api/me\n"
      <<"POST /api/logout\n"
      <<"POST /api/route\n\n"
      <<"Listening...\n\n";

    startServer();
#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
