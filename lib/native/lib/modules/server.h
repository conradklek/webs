/**
 * @file server.h
 * @brief Defines the core HTTP server implementation.
 *
 * This module provides the structures and functions needed to create, run,
 * and manage a simple, multi-client HTTP server.
 */

#ifndef SERVER_H
#define SERVER_H

#include <stdbool.h>

typedef struct Server Server;

/**
 * @brief A function pointer type for handling incoming HTTP requests.
 * @param client_fd The socket file descriptor for the connected client.
 * @param request The raw HTTP request string received from the client.
 */
typedef void (*RequestHandler)(int client_fd, const char *request);

/**
 * @struct Server
 * @brief Represents an instance of the HTTP server.
 */
struct Server {
  int listen_fd;
  int port;
  char *host;
  volatile bool running;
  int (*listen)(Server *self, RequestHandler handler);
  void (*stop)(Server *self);
};

/**
 * @brief Creates a new, un-started server instance.
 * @param host The host address to bind to (e.g., "127.0.0.1").
 * @param port The port to listen on. Use 0 to let the OS choose a port.
 * @return A pointer to a new `Server` struct, or NULL on failure.
 */
Server *server(const char *host, int port);

/**
 * @brief Frees all resources associated with a server instance.
 * @param server The server to destroy.
 */
void server_destroy(Server *server);

/**
 * @brief Writes a complete HTTP response back to a client.
 * @param client_fd The client's socket file descriptor.
 * @param response The full HTTP response string, including headers and body.
 */
void server_write_response(int client_fd, const char *response);

/**
 * @brief Starts a simple static file server.
 *
 * This is a blocking convenience function that runs a server to serve files
 * from a specified directory.
 * @param host The host address to bind to.
 * @param port The port to listen on.
 * @param public_dir The root directory from which to serve files.
 * @return An exit code (0 for success, 1 for failure).
 */
int static_server_run(const char *host, int port, const char *public_dir);

#endif // SERVER_H
