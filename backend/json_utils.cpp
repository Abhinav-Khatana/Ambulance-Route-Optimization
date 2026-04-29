#include "json_utils.h"

#include <sstream>

std::string jEsc(const std::string& s){
    std::string r;
    for(char c : s){
        if(c=='"')  r += "\\\"";
        else if(c=='\\') r += "\\\\";
        else r += c;
    }
    return r;
}

double jDbl(const std::string& s, const std::string& k, double def){
    auto p=s.find("\""+k+"\""); if(p==std::string::npos) return def;
    p=s.find(':',p)+1;
    while(p<s.size()&&(s[p]==' '||s[p]=='\n'||s[p]=='\r')) p++;
    try{ return std::stod(s.substr(p)); } catch(...){ return def; }
}
int jInt(const std::string& s, const std::string& k, int def){
    return (int)jDbl(s,k,(double)def);
}

std::vector<double> jDblArray(const std::string& s, const std::string& k){
    std::vector<double> v;
    auto p=s.find("\""+k+"\""); if(p==std::string::npos) return v;
    p=s.find('[',p); if(p==std::string::npos) return v;
    ++p;
    while(p<s.size()&&s[p]!=']'){
        while(p<s.size()&&(s[p]==' '||s[p]=='\n'||s[p]=='\r'||s[p]==',')) p++;
        if(s[p]==']') break;
        try{ size_t used; v.push_back(std::stod(s.substr(p),&used)); p+=used; }
        catch(...){ break; }
    }
    return v;
}

std::string jStr(const std::string& s, const std::string& k, const std::string& def){
    auto p=s.find("\""+k+"\""); if(p==std::string::npos) return def;
    p=s.find(':',p); if(p==std::string::npos) return def;
    ++p;
    while(p<s.size()&&(s[p]==' '||s[p]=='\n'||s[p]=='\r'||s[p]=='\t')) p++;
    if(p>=s.size() || s[p]!='\"') return def;
    ++p;
    std::string out;
    while(p<s.size()){
        char c=s[p++];
        if(c=='\\' && p<s.size()){
            char n=s[p++];
            switch(n){
                case 'n': out+='\n'; break;
                case 'r': out+='\r'; break;
                case 't': out+='\t'; break;
                case '\\': out+='\\'; break;
                case '"': out+='"'; break;
                default: out+=n; break;
            }
        } else if(c=='\"') {
            break;
        } else {
            out+=c;
        }
    }
    return out;
}

std::string nodeJ(const Node& n){
    std::ostringstream o;
    o<<"{\"id\":"<<n.id<<",\"name\":\""<<jEsc(n.name)<<"\""
     <<",\"lat\":"<<n.lat<<",\"lng\":"<<n.lng<<"}";
    return o.str();
}

std::string edgeJ(const EdgeDef& e){
    std::ostringstream o;
    o<<"{\"id\":"<<e.id<<",\"u\":"<<e.u<<",\"v\":"<<e.v
     <<",\"km\":"<<e.km<<",\"road\":\""<<jEsc(e.road)<<"\"}";
    return o.str();
}

std::string hospJ(const Hospital& h){
    std::ostringstream o;
    o<<"{\"id\":"<<h.id<<",\"name\":\""<<jEsc(h.name)<<"\""
     <<",\"address\":\""<<jEsc(h.address)<<"\""
     <<",\"phone\":\""<<jEsc(h.phone)<<"\""
     <<",\"speciality\":\""<<jEsc(h.speciality)<<"\""
     <<",\"beds\":"<<h.beds
     <<",\"lat\":"<<h.lat<<",\"lng\":"<<h.lng
     <<",\"snap_node\":"<<h.snap_node<<"}";
    return o.str();
}
