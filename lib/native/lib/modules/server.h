#ifndef SERVER_H
#define SERVER_H

#include <stdbool.h>

typedef struct Server Server;

typedef void (*RequestHandler)(int client_fd, const char *request);

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
void webs_server_write_response(int client_fd, const char *response);

int webs_static_server_run(const char *host, int port, const char *public_dir);

#endif
