/**
 * @file router.h
 * @brief Defines the structures and functions for a C-native HTTP router.
 *
 * This module provides the necessary components to define routes, map them to
 * handler functions, and process incoming requests to dispatch them to the
 * appropriate handler.
 */
#ifndef ROUTER_H
#define ROUTER_H

#include "../core/value.h"

// Enum for standard HTTP methods
typedef enum {
  HTTP_GET,
  HTTP_POST,
  HTTP_PUT,
  HTTP_DELETE,
  HTTP_PATCH,
  HTTP_OPTIONS
} HttpMethod;

// Forward declaration for the context and function types
struct RequestContext;
typedef void (*NextFunc)(struct RequestContext *ctx);
typedef void (*MiddlewareFunc)(struct RequestContext *ctx, NextFunc next);
typedef void (*RouteHandler)(struct RequestContext *ctx);

/**
 * @brief Defines a single route, mapping a path and method to a handler.
 * Now includes support for a chain of middleware functions.
 */
typedef struct {
  char *path;
  HttpMethod method;
  MiddlewareFunc *middleware; // Array of middleware function pointers
  int middleware_count;       // Number of middleware functions
  RouteHandler handler;       // The final handler for the route
} RouteDefinition;

/**
 * @brief The main router struct that holds all registered routes.
 */
typedef struct {
  RouteDefinition *routes;
  int count;
  int capacity;
} Router;

/**
 * @brief Holds all relevant information for a single request lifecycle.
 *
 * This context is passed to route handlers and middleware, carrying state
 * like the parsed request, URL parameters, and the client connection.
 * It can be extended by middleware (e.g., to add user or db info).
 */
typedef struct RequestContext {
  Value *request; // The parsed request object from http.c
  Value *params;  // URL parameters extracted from route matching
  int client_fd;  // The client's socket file descriptor for writing responses
  Value *db;      // Database connection handle
  Value *user;    // Authenticated user object

  // --- Internal use for middleware execution ---
  const RouteDefinition *route; // The matched route
  int next_middleware_index;    // The index of the next middleware to run
} RequestContext;

// --- Function Declarations ---

Router *router_create(void);
void router_free(Router *router);

/**
 * @brief Adds a route with an array of middleware functions.
 * @param router The router instance.
 * @param method The HTTP method for this route.
 * @param path The path pattern (e.g., "/users/[id]").
 * @param middleware An array of MiddlewareFunc pointers. Can be NULL.
 * @param middleware_count The number of functions in the middleware array.
 * @param handler The final function pointer to execute when the route matches.
 */
void router_add_route_with_middleware(Router *router, HttpMethod method,
                                      const char *path,
                                      MiddlewareFunc *middleware,
                                      int middleware_count,
                                      RouteHandler handler);

/**
 * @brief Adds a new route definition to the router (without middleware).
 */
void router_add_route(Router *router, HttpMethod method, const char *path,
                      RouteHandler handler);

/**
 * @brief Processes a parsed request, finds a matching route, and invokes its
 * handler.
 */
void router_handle_request(Router *router, int client_fd, Value *request);

/**
 * @brief Sets up all the routes needed for the test suite.
 */
void router_setup_test_routes(Router *router);

#endif // ROUTER_H
