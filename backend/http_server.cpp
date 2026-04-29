#include "http_server.h"

#include "geo.h"
#include "json_utils.h"
#include "platform.h"
#include "routing.h"
#include "state.h"

#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

struct Req { std::string method, path, body; };
struct Res { int code=200; std::string body, ct="application/json"; };

static Req parseReq(const std::string& raw){
    Req r;
    std::istringstream ss(raw);
    std::string line;
    if(!std::getline(ss,line)) return r;
    std::istringstream ls(line); ls>>r.method>>r.path;
    while(std::getline(ss,line)&&line!="\r"&&!line.empty()){}
    std::string rest,tmp;
    while(std::getline(ss,tmp)) rest+=tmp+"\n";
    r.body=rest;
    return r;
}

static void sendRes(SOCKET c, const Res& res){
    std::ostringstream m;
    m<<"HTTP/1.1 "<<res.code<<" OK\r\n"
     <<"Content-Type: "<<res.ct<<"; charset=utf-8\r\n"
     <<"Content-Length: "<<res.body.size()<<"\r\n"
     <<"Access-Control-Allow-Origin: *\r\n"
     <<"Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n"
     <<"Access-Control-Allow-Headers: Content-Type\r\n"
     <<"Connection: close\r\n\r\n"
     <<res.body;
    auto s=m.str();
    send(c,s.c_str(),(int)s.size(),0);
}

static Res dispatch(const Req& req){
    Res r;

    if(req.method=="GET"&&req.path=="/api/health"){
        int edgeCnt=0;
        for(int i=0;i<(int)G_adj.size();i++) edgeCnt+=(int)G_adj[i].size();
        r.body="{\"status\":\"ok\","
               "\"nodes\":"   +std::to_string(G_nodes.size())+","
               "\"edges\":"   +std::to_string(edgeCnt/2)+","
               "\"hospitals\":"+std::to_string(G_hosp.size())+"}";
        return r;
    }

    if(req.method=="GET"&&req.path=="/api/graph"){
        std::ostringstream o;
        o<<"{\"nodes\":[";
        for(size_t i=0;i<G_nodes.size();i++){ if(i)o<<","; o<<nodeJ(G_nodes[i]); }
        o<<"],\"edges\":[";
        for(size_t i=0;i<G_edges.size();i++){ if(i)o<<","; o<<edgeJ(G_edges[i]); }
        o<<"]}";
        r.body=o.str(); return r;
    }

    if(req.method=="GET"&&req.path=="/api/hospitals"){
        std::ostringstream o; o<<"[";
        for(size_t i=0;i<G_hosp.size();i++){ if(i)o<<","; o<<hospJ(G_hosp[i]); }
        o<<"]"; r.body=o.str(); return r;
    }

    if(req.method=="POST"&&req.path=="/api/signup"){
        if(!gAuth.ready()) { r.code=503; r.body="{\"ok\":false,\"message\":\"Authentication database is unavailable.\"}"; return r; }
        const std::string username = jStr(req.body, "username");
        const std::string email    = jStr(req.body, "email");
        const std::string password = jStr(req.body, "password");
        std::string msg;
        bool ok = gAuth.signup(username, email, password, msg);
        r.code = ok ? 200 : 400;
        std::ostringstream o;
        o<<"{\"ok\":"<<(ok?"true":"false")<<",\"message\":\""<<jEsc(msg)<<"\"}";
        r.body = o.str();
        return r;
    }

    if(req.method=="POST"&&req.path=="/api/login"){
        if(!gAuth.ready()) { r.code=503; r.body="{\"ok\":false,\"message\":\"Authentication database is unavailable.\"}"; return r; }
        const std::string identifier = jStr(req.body, "identifier");
        const std::string password   = jStr(req.body, "password");
        AuthUser user;
        std::string token, msg;
        bool ok = gAuth.login(identifier, password, user, token, msg);
        r.code = ok ? 200 : 401;
        std::ostringstream o;
        o<<"{\"ok\":"<<(ok?"true":"false")<<",\"message\":\""<<jEsc(msg)<<"\"";
        if(ok){
            o<<",\"token\":\""<<jEsc(token)<<"\""
             <<",\"user\":{"
             <<"\"id\":"<<user.id<<","
             <<"\"username\":\""<<jEsc(user.username)<<"\","
             <<"\"email\":\""<<jEsc(user.email)<<"\"}";
        }
        o<<"}";
        r.body = o.str();
        return r;
    }

    if(req.method=="POST"&&req.path=="/api/me"){
        if(!gAuth.ready()) { r.code=503; r.body="{\"ok\":false,\"message\":\"Authentication database is unavailable.\"}"; return r; }
        const std::string token = jStr(req.body, "token");
        AuthUser user;
        if(!gAuth.validateToken(token, user)) {
            r.code = 401;
            r.body = "{\"ok\":false,\"message\":\"Invalid session.\"}";
            return r;
        }
        std::ostringstream o;
        o<<"{\"ok\":true,\"user\":{"
         <<"\"id\":"<<user.id<<","
         <<"\"username\":\""<<jEsc(user.username)<<"\","
         <<"\"email\":\""<<jEsc(user.email)<<"\"}}";
        r.body = o.str();
        return r;
    }

    if(req.method=="POST"&&req.path=="/api/logout"){
        if(!gAuth.ready()) { r.code=503; r.body="{\"ok\":false,\"message\":\"Authentication database is unavailable.\"}"; return r; }
        const std::string token = jStr(req.body, "token");
        bool ok = gAuth.logout(token);
        r.code = ok ? 200 : 400;
        r.body = ok ? "{\"ok\":true,\"message\":\"Logged out.\"}" : "{\"ok\":false,\"message\":\"Logout failed.\"}";
        return r;
    }

    if(req.method=="POST"&&req.path=="/api/route"){

        double srcLat  = jDbl(req.body,"src_lat",  30.31654);
        double srcLng  = jDbl(req.body,"src_lng",  77.99128);
        int    hospId  = jInt(req.body,"hospital_id", 0);

        std::vector<double> emult = jDblArray(req.body,"edge_mult");
        if((int)emult.size() < (int)G_edges.size())
            emult.assign(G_edges.size(), 1.0);

        int src = snapToNode(srcLat, srcLng);
        int dst;
        if(hospId>=0&&hospId<(int)G_hosp.size())
            dst = G_hosp[hospId].snap_node;
        else
            dst = snapToNode(jDbl(req.body,"dst_lat",srcLat),
                             jDbl(req.body,"dst_lng",srcLng));

        RouteOut ro = computeRoute(src, dst, emult);

        std::ostringstream o;
        if(!ro.found){
            o<<"{\"found\":false,\"error\":\""<<jEsc(ro.error)<<"\"}";
        } else {
            o<<"{\"found\":true"
             <<",\"distance_km\":"   <<ro.dist_km
             <<",\"time_min\":"      <<ro.time_min
             <<",\"bfs_explored\":"   <<ro.bfs_explored
             <<",\"bfs_relaxed\":"    <<ro.bfs_relaxed
             <<",\"dij_explored\":"  <<ro.dij_explored
             <<",\"dij_relaxed\":"   <<ro.dij_relaxed
             <<",\"ast_explored\":"  <<ro.ast_explored
             <<",\"ast_relaxed\":"   <<ro.ast_relaxed
             <<",\"ast_pruned\":"    <<ro.ast_pruned
             <<",\"path_ids\":[";
            for(size_t i=0;i<ro.path.size();i++){
                if(i)o<<","; o<<ro.path[i];
            }
            o<<"],\"path_nodes\":[";
            for(size_t i=0;i<ro.path.size();i++){
                if(i)o<<",";
                int id=ro.path[i];
                o<<"{\"id\":"<<id
                 <<",\"name\":\""<<jEsc(G_nodes[id].name)<<"\""
                 <<",\"lat\":"<<G_nodes[id].lat
                 <<",\"lng\":"<<G_nodes[id].lng<<"}";
            }
            o<<"]";
            o<<",\"src_node\":"<<nodeJ(G_nodes[src]);
            o<<",\"dst_node\":"<<nodeJ(G_nodes[dst]);
            if(hospId>=0&&hospId<(int)G_hosp.size())
                o<<",\"hospital\":"<<hospJ(G_hosp[hospId]);
            o<<"}";
        }
        r.body=o.str(); return r;
    }

    r.code=404; r.body="{\"error\":\"Not found\"}"; return r;
}

static void handleClient(SOCKET c){
    char buf[32768]={};
    int n=recv(c,buf,(int)sizeof(buf)-1,0);
    if(n<=0){ CLOSESOCK(c); return; }
    std::string raw(buf,n);
    Req req=parseReq(raw);
    if(req.method=="OPTIONS"){
        Res pre; pre.code=204; pre.body=""; sendRes(c,pre);
    } else {
        sendRes(c,dispatch(req));
    }
    CLOSESOCK(c);
}


void startServer(){
    SOCKET srv=socket(AF_INET,SOCK_STREAM,0);
    if(srv==INVALID_SOCKET){ std::cerr<<"socket() failed\n"; return; }
    int opt=1;
    setsockopt(srv,SOL_SOCKET,SO_REUSEADDR,(char*)&opt,sizeof(opt));
    sockaddr_in addr{};
    addr.sin_family=AF_INET;
    addr.sin_addr.s_addr=INADDR_ANY;
    addr.sin_port=htons(PORT);
    if(bind(srv,(sockaddr*)&addr,sizeof(addr))<0){
        std::cerr<<"bind() failed - port "<<PORT<<" busy?\n"; return;
    }
    listen(srv,64);
    while(true){
        SOCKET c=accept(srv,nullptr,nullptr);
        if(c==INVALID_SOCKET) continue;
        std::thread(handleClient,c).detach();
    }
}
