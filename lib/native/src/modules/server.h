#ifndef SERVER_H
#define SERVER_H

#include <stdbool.h>

typedef struct Server Server;

typedef char *(*RequestHandler)(const char *request);

struct Server {
  int listen_fd;
  int port;
  char *host;
  volatile bool running;
  int (*listen)(Server *self, RequestHandler handler);
  void (*stop)(Server *self);
};

Server *server(const char *host, int port);
void server_destroy(Server *server);

#endif
