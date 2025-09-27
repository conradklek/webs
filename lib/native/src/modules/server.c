#include "server.h"
#include "../core/console.h"
#include "http_stream.h"
#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <poll.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#define INITIAL_CLIENTS 10
#define MAX_REQUEST_SIZE 8192

static int server_listen_method(Server *self, RequestHandler handler);
static void server_stop_method(Server *self);

Server *server(const char *host, int port) {
  Server *server = calloc(1, sizeof(Server));
  if (!server) {
    console()->error(console(), "calloc for Server: %s", strerror(errno));
    return NULL;
  }

  server->host = strdup(host);
  if (!server->host) {
    console()->error(console(), "strdup for host: %s", strerror(errno));
    free(server);
    return NULL;
  }
  server->port = port;
  server->listen_fd = -1;
  server->running = false;

  server->listen = server_listen_method;
  server->stop = server_stop_method;

  return server;
}

static void server_stop_method(Server *self) {
  if (self) {
    self->running = false;
  }
}

void server_destroy(Server *server) {
  if (server) {
    if (server->listen_fd != -1) {
      close(server->listen_fd);
    }
    free(server->host);
    free(server);
  }
}

static int setup_listen_socket(Server *server) {
  server->listen_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (server->listen_fd < 0) {
    console()->error(console(), "socket: %s", strerror(errno));
    return -1;
  }

  int optval = 1;
  if (setsockopt(server->listen_fd, SOL_SOCKET, SO_REUSEADDR, &optval,
                 sizeof(optval)) < 0) {
    console()->error(console(), "setsockopt(SO_REUSEADDR): %s",
                     strerror(errno));
    close(server->listen_fd);
    return -1;
  }

  struct sockaddr_in server_addr;
  memset(&server_addr, 0, sizeof(server_addr));
  server_addr.sin_family = AF_INET;
  server_addr.sin_port = htons(server->port);
  server_addr.sin_addr.s_addr = inet_addr(server->host);

  if (bind(server->listen_fd, (struct sockaddr *)&server_addr,
           sizeof(server_addr)) < 0) {
    console()->error(console(), "bind: %s", strerror(errno));
    close(server->listen_fd);
    return -1;
  }

  if (listen(server->listen_fd, SOMAXCONN) < 0) {
    console()->error(console(), "listen: %s", strerror(errno));
    close(server->listen_fd);
    return -1;
  }

  return 0;
}

static int server_listen_method(Server *self, RequestHandler handler) {
  if (setup_listen_socket(self) != 0) {
    return -1;
  }

  nfds_t nfds = 1;
  size_t poll_capacity = INITIAL_CLIENTS + 1;
  struct pollfd *fds = calloc(poll_capacity, sizeof(struct pollfd));
  if (!fds) {
    console()->error(console(), "calloc for pollfd: %s", strerror(errno));
    return -1;
  }

  fds[0].fd = self->listen_fd;
  fds[0].events = POLLIN;
  self->running = true;

  console()->info(console(), "Server listening on %s:%d", self->host,
                  self->port);

  while (self->running) {
    int poll_count = poll(fds, nfds, 250);

    if (poll_count < 0) {
      if (errno == EINTR)
        continue;
      console()->error(console(), "poll: %s", strerror(errno));
      break;
    }

    if (poll_count == 0)
      continue;

    if (fds[0].revents & POLLIN) {
      int client_fd = accept(self->listen_fd, NULL, NULL);
      if (client_fd >= 0) {
        if (nfds == poll_capacity) {
          poll_capacity *= 2;
          struct pollfd *new_fds =
              realloc(fds, poll_capacity * sizeof(struct pollfd));
          if (!new_fds) {
            console()->error(console(), "realloc pollfd array: %s",
                             strerror(errno));
            close(client_fd);
          } else {
            fds = new_fds;
          }
        }
        if (nfds < poll_capacity) {
          fds[nfds].fd = client_fd;
          fds[nfds].events = POLLIN;
          nfds++;
        }
      }
    }

    for (nfds_t i = 1; i < nfds; i++) {
      if (fds[i].revents & POLLIN) {
        char *request_buffer = malloc(MAX_REQUEST_SIZE);
        if (!request_buffer) {
          close(fds[i].fd);
          continue;
        }

        ssize_t bytes_read =
            read(fds[i].fd, request_buffer, MAX_REQUEST_SIZE - 1);

        if (bytes_read > 0) {
          request_buffer[bytes_read] = '\0';
          char *response = handler(request_buffer);

          if (response && strcmp(response, "STREAM_START") == 0) {
            HttpStream stream;
            http_stream_begin(&stream, fds[i].fd, 200, "text/plain");

            while (self->running) {
              snprintf(request_buffer, MAX_REQUEST_SIZE, "STREAM_CHUNK");
              char *chunk = handler(request_buffer);

              if (chunk && strcmp(chunk, "STREAM_END") != 0) {
                http_stream_write_chunk(&stream, chunk, strlen(chunk));
                free(chunk);
              } else {
                if (chunk)
                  free(chunk);
                break;
              }
            }
            http_stream_end(&stream);
            if (response)
              free(response);
          } else if (response) {
            write(fds[i].fd, response, strlen(response));
            free(response);
          }
        }

        close(fds[i].fd);
        free(request_buffer);

        fds[i] = fds[nfds - 1];
        nfds--;
        i--;
      }
    }
  }

  for (nfds_t i = 1; i < nfds; i++) {
    close(fds[i].fd);
  }
  free(fds);
  close(self->listen_fd);
  self->listen_fd = -1;

  console()->info(console(), "Server shut down.");
  return 0;
}
