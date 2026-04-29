#include "geo.h"

#include "platform.h"
#include "state.h"

#include <cmath>

double haversine(double la1,double lo1,double la2,double lo2){
    const double R=6371.0, D=M_PI/180.0;
    double dLat=(la2-la1)*D, dLon=(lo2-lo1)*D;
    double a=sin(dLat/2)*sin(dLat/2)
            +cos(la1*D)*cos(la2*D)*sin(dLon/2)*sin(dLon/2);
    return R*2.0*atan2(sqrt(a),sqrt(1-a));
}

int snapToNode(double lat,double lng){
    double best=INF; int id=0;
    for(auto& n : G_nodes){
        double d=haversine(lat,lng,n.lat,n.lng);
        if(d<best){best=d;id=n.id;}
    }
    return id;
}
