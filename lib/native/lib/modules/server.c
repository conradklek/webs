#include "server.h"
#include "../webs_api.h"
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
static int setup_listen_socket(Server *self);

void server_write_response(int client_fd, const char *response) {
  if (response) {
    write(client_fd, response, strlen(response));
  }
}

Server *server(const char *host, int port) {
  Server *s = calloc(1, sizeof(Server));
  if (!s) {
    perror("calloc for Server");
    return NULL;
  }

  s->host = strdup(host);
  if (!s->host) {
    perror("strdup for host");
    free(s);
    return NULL;
  }
  s->port = port;
  s->listen_fd = -1;
  s->running = false;
  s->listen = server_listen_method;
  s->stop = server_stop_method;

  return s;
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

static int setup_listen_socket(Server *self) {
  self->listen_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (self->listen_fd < 0) {
    perror("socket");
    return -1;
  }

  int optval = 1;
  setsockopt(self->listen_fd, SOL_SOCKET, SO_REUSEADDR, &optval,
             sizeof(optval));

  struct sockaddr_in server_addr;
  memset(&server_addr, 0, sizeof(server_addr));
  server_addr.sin_family = AF_INET;
  server_addr.sin_port = htons(self->port);
  server_addr.sin_addr.s_addr = inet_addr(self->host);

  if (bind(self->listen_fd, (struct sockaddr *)&server_addr,
           sizeof(server_addr)) < 0) {
    perror("bind");
    close(self->listen_fd);
    return -1;
  }

  if (self->port == 0) {
    socklen_t len = sizeof(server_addr);
    if (getsockname(self->listen_fd, (struct sockaddr *)&server_addr, &len) ==
        -1) {
      perror("getsockname");
    } else {
      self->port = ntohs(server_addr.sin_port);
    }
  }

  if (listen(self->listen_fd, SOMAXCONN) < 0) {
    perror("listen");
    close(self->listen_fd);
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
    perror("calloc for pollfd");
    return -1;
  }

  fds[0].fd = self->listen_fd;
  fds[0].events = POLLIN;
  self->running = true;

  printf("Listening on http://%s:%d\n", self->host, self->port);
  fflush(stdout);

  while (self->running) {
    int poll_count = poll(fds, nfds, 100);
    if (poll_count < 0) {
      if (errno == EINTR)
        continue;
      perror("poll");
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
            perror("realloc for pollfd");
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
        char *buffer = malloc(MAX_REQUEST_SIZE + 1);
        if (!buffer) {
          close(fds[i].fd);
          fds[i] = fds[nfds - 1];
          nfds--;
          i--;
          continue;
        }

        ssize_t bytes_read = read(fds[i].fd, buffer, MAX_REQUEST_SIZE);

        if (bytes_read > 0) {
          buffer[bytes_read] = '\0';
          handler(fds[i].fd, buffer);
        }

        free(buffer);
        close(fds[i].fd);
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
  return 0;
}

static const char *get_mime_type(const char *path) {
  const char *dot = strrchr(path, '.');
  if (!dot || dot == path)
    return "application/octet-stream";
  if (strcmp(dot, ".html") == 0)
    return "text/html";
  if (strcmp(dot, ".css") == 0)
    return "text/css";
  if (strcmp(dot, ".js") == 0)
    return "application/javascript";
  return "application/octet-stream";
}

int static_server_run(const char *host, int port, const char *public_dir) {
  Server *s = server(host, port);
  if (!s)
    return 1;

  if (setup_listen_socket(s) != 0) {
    server_destroy(s);
    return 1;
  }

  printf("Listening on http://%s:%d\n", s->host, s->port);
  fflush(stdout);

  s->running = true;
  while (s->running) {
    int client_fd = accept(s->listen_fd, NULL, NULL);
    if (client_fd < 0) {
      if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK)
        continue;
      perror("accept");
      break;
    }

    char buffer[MAX_REQUEST_SIZE];
    ssize_t bytes_read = read(client_fd, buffer, sizeof(buffer) - 1);

    if (bytes_read > 0) {
      buffer[bytes_read] = '\0';

      char *line_saveptr;
      char *line = strtok_r(buffer, "\r\n", &line_saveptr);
      if (line) {
        char *method = line;
        char *req_path = strchr(method, ' ');
        if (req_path) {
          *req_path = '\0';
          req_path++;
          char *version = strchr(req_path, ' ');
          if (version)
            *version = '\0';

          if (strstr(req_path, "..")) {
            const char *resp = "HTTP/1.1 400 Bad Request\r\n\r\nInvalid Path";
            write(client_fd, resp, strlen(resp));
          } else {
            char file_path[1024];
            const char *req_file =
                (strcmp(req_path, "/") == 0) ? "/index.html" : req_path;
            snprintf(file_path, sizeof(file_path), "%s%s", public_dir,
                     req_file);

            char *content = NULL;
            char *read_error = NULL;
            Status status = W->fs->readFile(file_path, &content, &read_error);

            if (status == OK && content) {
              const char *mime = get_mime_type(file_path);
              char header[512];
              int header_len = snprintf(
                  header, sizeof(header),
                  "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: "
                  "%zu\r\nConnection: close\r\n\r\n",
                  mime, strlen(content));
              write(client_fd, header, header_len);
              write(client_fd, content, strlen(content));
              W->freeString(content);
            } else {
              const char *resp = "HTTP/1.1 404 Not Found\r\n\r\nNot Found";
              write(client_fd, resp, strlen(resp));
              if (content) {
                W->freeString(content);
              }
              if (read_error) {
                W->freeString(read_error);
              }
            }
          }
        }
      }
    }
    close(client_fd);
  }

  server_destroy(s);
  return 0;
}
