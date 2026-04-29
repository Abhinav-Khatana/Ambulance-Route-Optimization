#pragma once

#ifdef _WIN32
#define _USE_MATH_DEFINES
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib,"ws2_32.lib")
typedef int socklen_t;
#define CLOSESOCK closesocket
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#define SOCKET int
#define INVALID_SOCKET (-1)
#define CLOSESOCK close
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
