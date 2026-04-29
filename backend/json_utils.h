#pragma once

#include "models.h"

#include <string>
#include <vector>

std::string jEsc(const std::string& s);
double jDbl(const std::string& s, const std::string& k, double def=0);
int jInt(const std::string& s, const std::string& k, int def=-1);
std::vector<double> jDblArray(const std::string& s, const std::string& k);
std::string jStr(const std::string& s, const std::string& k, const std::string& def="");
std::string nodeJ(const Node& n);
std::string edgeJ(const EdgeDef& e);
std::string hospJ(const Hospital& h);
