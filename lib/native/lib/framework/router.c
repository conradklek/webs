#include "router.h"
#include "../webs_api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void run_next_middleware_or_handler(RequestContext *ctx);
static void test_handler_root(RequestContext *ctx);
static void test_handler_user(RequestContext *ctx);
static void test_handler_post(RequestContext *ctx);
static void test_handler_posts_by_date(RequestContext *ctx);
static void test_handler_register(RequestContext *ctx);
static void test_handler_login(RequestContext *ctx);
static void test_handler_logout(RequestContext *ctx);
static void test_auth_middleware(RequestContext *ctx, NextFunc next);
static void test_db_middleware(RequestContext *ctx, NextFunc next);
static void send_json_response(int client_fd, int status_code,
                               const char *status_text, Value *payload);
static void send_json_response_with_headers(int client_fd, int status_code,
                                            const char *status_text,
                                            Value *headers, Value *payload);

static HttpMethod method_from_string(const char *method_str) {
  if (strcasecmp(method_str, "GET") == 0)
    return HTTP_GET;
  if (strcasecmp(method_str, "POST") == 0)
    return HTTP_POST;
  if (strcasecmp(method_str, "PUT") == 0)
    return HTTP_PUT;
  if (strcasecmp(method_str, "DELETE") == 0)
    return HTTP_DELETE;
  if (strcasecmp(method_str, "PATCH") == 0)
    return HTTP_PATCH;
  if (strcasecmp(method_str, "OPTIONS") == 0)
    return HTTP_OPTIONS;
  return -1;
}

Router *router_create(void) {
  Router *router = (Router *)calloc(1, sizeof(Router));
  if (!router) {
    W->log->error("Failed to allocate memory for router.");
    return NULL;
  }
  router->capacity = 8;
  router->routes =
      (RouteDefinition *)malloc(sizeof(RouteDefinition) * router->capacity);
  if (!router->routes) {
    W->log->error("Failed to allocate memory for routes.");
    free(router);
    return NULL;
  }
  return router;
}

void router_free(Router *router) {
  if (!router)
    return;
  for (int i = 0; i < router->count; i++) {
    free(router->routes[i].path);
    free(router->routes[i].middleware);
  }
  free(router->routes);
  free(router);
}

void router_add_route_with_middleware(Router *router, HttpMethod method,
                                      const char *path,
                                      MiddlewareFunc *middleware,
                                      int middleware_count,
                                      RouteHandler handler) {
  if (!router || !path || !handler)
    return;
  if (router->count >= router->capacity) {
    router->capacity *= 2;
    router->routes = (RouteDefinition *)realloc(
        router->routes, sizeof(RouteDefinition) * router->capacity);
  }
  router->routes[router->count].method = method;
  router->routes[router->count].path = strdup(path);
  router->routes[router->count].handler = handler;
  router->routes[router->count].middleware_count = middleware_count;

  if (middleware_count > 0 && middleware) {
    router->routes[router->count].middleware =
        (MiddlewareFunc *)malloc(sizeof(MiddlewareFunc) * middleware_count);
    memcpy(router->routes[router->count].middleware, middleware,
           sizeof(MiddlewareFunc) * middleware_count);
  } else {
    router->routes[router->count].middleware = NULL;
  }
  router->count++;
}

void router_add_route(Router *router, HttpMethod method, const char *path,
                      RouteHandler handler) {
  router_add_route_with_middleware(router, method, path, NULL, 0, handler);
}

void router_handle_request(Router *router, int client_fd, Value *request) {
  Value *method_val = W->objectGetRef(request, "method");
  Value *path_val = W->objectGetRef(request, "path");
  const char *method_str = W->valueAsString(method_val);
  const char *path_str = W->valueAsString(path_val);
  HttpMethod request_method = method_from_string(method_str);

  for (int i = 0; i < router->count; i++) {
    RouteDefinition *route = &router->routes[i];
    if (route->method == request_method) {
      Value *params = NULL;
      char *match_error = NULL;
      Status match_status =
          W->url->matchRoute(route->path, path_str, &params, &match_error);
      if (match_error)
        W->freeString(match_error);

      if (match_status == OK && params != NULL) {
        RequestContext ctx = {.request = request,
                              .params = params,
                              .client_fd = client_fd,
                              .db = NULL,
                              .user = NULL,
                              .route = route,
                              .next_middleware_index = 0};
        run_next_middleware_or_handler(&ctx);
        W->freeValue(params);
        if (ctx.db)
          W->db->close(ctx.db, NULL);
        if (ctx.user)
          W->freeValue(ctx.user);
        return;
      }
      if (params)
        W->freeValue(params);
    }
  }
  const char *resp = "HTTP/1.1 404 Not Found\r\n\r\nNot Found";
  W->server->writeResponse(client_fd, resp);
}

static void run_next_middleware_or_handler(RequestContext *ctx) {
  if (ctx->next_middleware_index < ctx->route->middleware_count) {
    MiddlewareFunc middleware =
        ctx->route->middleware[ctx->next_middleware_index];
    ctx->next_middleware_index++;
    middleware(ctx, run_next_middleware_or_handler);
  } else {
    ctx->route->handler(ctx);
  }
}

static void send_json_response(int client_fd, int status_code,
                               const char *status_text, Value *payload) {
  send_json_response_with_headers(client_fd, status_code, status_text, NULL,
                                  payload);
}

static void send_json_response_with_headers(int client_fd, int status_code,
                                            const char *status_text,
                                            Value *headers, Value *payload) {
  char *json_body = W->json->encode(payload);
  StringBuilder sb;
  W->stringBuilder->init(&sb);

  char status_line[128];
  snprintf(status_line, sizeof(status_line), "HTTP/1.1 %d %s\r\n", status_code,
           status_text);
  W->stringBuilder->appendStr(&sb, status_line);
  W->stringBuilder->appendStr(&sb, "Content-Type: application/json\r\n");
  char content_length_header[64];
  snprintf(content_length_header, sizeof(content_length_header),
           "Content-Length: %zu\r\n", strlen(json_body));
  W->stringBuilder->appendStr(&sb, content_length_header);

  if (headers && W->valueGetType(headers) == VALUE_OBJECT) {
    Value *keys = W->objectKeys(headers);
    for (size_t i = 0; i < W->arrayCount(keys); i++) {
      const char *key = W->valueAsString(W->arrayGetRef(keys, i));
      const char *value = W->valueAsString(W->objectGetRef(headers, key));
      W->stringBuilder->appendStr(&sb, key);
      W->stringBuilder->appendStr(&sb, ": ");
      W->stringBuilder->appendStr(&sb, value);
      W->stringBuilder->appendStr(&sb, "\r\n");
    }
    W->freeValue(keys);
  }
  W->stringBuilder->appendStr(&sb, "\r\n");
  char *header_str = W->stringBuilder->toString(&sb);
  W->server->writeResponse(client_fd, header_str);
  W->server->writeResponse(client_fd, json_body);
  W->freeString(header_str);
  W->freeString(json_body);
}

static void test_db_middleware(RequestContext *ctx, NextFunc next) {
  char *db_error = NULL;
  Status status = W->db->open("./api_test.db", &ctx->db, &db_error);

  if (status != OK) {
    Value *err = W->objectOf(
        "message", W->string(db_error ? db_error : "Could not open database"),
        NULL);
    send_json_response(ctx->client_fd, 500, "Server Error", err);
    W->freeValue(err);
    if (db_error)
      W->freeString(db_error);
    return;
  }
  if (db_error)
    W->freeString(db_error);

  char *exec_error = NULL;
  W->db->exec(ctx->db,
              "CREATE TABLE IF NOT EXISTS users (username TEXT UNIQUE, "
              "password TEXT); CREATE TABLE IF NOT EXISTS sessions "
              "(session_id TEXT PRIMARY KEY, username TEXT, expires_at "
              "INTEGER);",
              &exec_error);
  if (exec_error)
    W->freeString(exec_error);
  next(ctx);
}

static void test_handler_register(RequestContext *ctx) {
  const char *body = W->valueAsString(W->objectGetRef(ctx->request, "body"));
  Value *body_json = NULL;
  char *parse_error = NULL;
  Status status = W->json->parse(body, &body_json, &parse_error);

  if (status != OK) {
    Value *err = W->objectOf(
        "message", W->string(parse_error ? parse_error : "Invalid JSON"), NULL);
    send_json_response(ctx->client_fd, 400, "Bad Request", err);
    W->freeValue(err);
    if (parse_error)
      W->freeString(parse_error);
    if (body_json)
      W->freeValue(body_json);
    return;
  }
  if (parse_error)
    W->freeString(parse_error);

  Value *username_val = W->objectGetRef(body_json, "username");
  Value *password_val = W->objectGetRef(body_json, "password");
  const char *username = W->valueAsString(username_val);
  char *hashed_password = W->auth->hashPassword(W->valueAsString(password_val));
  char sql[256];
  snprintf(sql, sizeof(sql),
           "INSERT INTO users (username, password) VALUES ('%s', '%s');",
           username, hashed_password);

  char *exec_error = NULL;
  status = W->db->exec(ctx->db, sql, &exec_error);

  if (status != OK) {
    Value *err;
    if (exec_error && strstr(exec_error, "UNIQUE constraint failed")) {
      err = W->objectOf("message", W->string("User already exists"), NULL);
      send_json_response(ctx->client_fd, 409, "Conflict", err);
    } else {
      err = W->objectOf("message",
                        W->string(exec_error ? exec_error : "Database error"),
                        NULL);
      send_json_response(ctx->client_fd, 500, "Server Error", err);
    }
    W->freeValue(err);
    if (exec_error)
      W->freeString(exec_error);
  } else {
    Value *ok =
        W->objectOf("message", W->string("User registered successfully"),
                    "username", W->string(username), NULL);
    send_json_response(ctx->client_fd, 201, "Created", ok);
    W->freeValue(ok);
  }
  W->freeString(hashed_password);
  W->freeValue(body_json);
}

static void test_handler_login(RequestContext *ctx) {
  const char *body = W->valueAsString(W->objectGetRef(ctx->request, "body"));
  Value *body_json = NULL;
  char *parse_error = NULL;
  Status status = W->json->parse(body, &body_json, &parse_error);

  if (status != OK || !body_json) {
    if (parse_error)
      W->freeString(parse_error);
    if (body_json)
      W->freeValue(body_json);
    return;
  }
  if (parse_error)
    W->freeString(parse_error);

  const char *username =
      W->valueAsString(W->objectGetRef(body_json, "username"));
  const char *password =
      W->valueAsString(W->objectGetRef(body_json, "password"));
  char sql[256];
  snprintf(sql, sizeof(sql), "SELECT password FROM users WHERE username = '%s'",
           username);

  Value *query_result = NULL;
  char *query_error = NULL;
  status = W->db->query(ctx->db, sql, &query_result, &query_error);

  if (status == OK && query_result &&
      W->valueGetType(query_result) == VALUE_ARRAY &&
      W->arrayCount(query_result) == 1) {
    Value *row = W->arrayGetRef(query_result, 0);
    const char *hash = W->valueAsString(W->objectGetRef(row, "password"));
    if (W->auth->verifyPassword(password, hash)) {
      char *session_id = NULL;
      char *session_error = NULL;
      W->auth->createSession(ctx->db, username, &session_id, &session_error);
      if (session_id) {
        char *cookie_str = W->cookie->serialize("session_id", session_id, NULL);
        Value *headers = W->objectOf("Set-Cookie", W->string(cookie_str), NULL);
        Value *ok = W->objectOf("message", W->string("Login successful"), NULL);
        send_json_response_with_headers(ctx->client_fd, 200, "OK", headers, ok);
        W->freeValue(ok);
        W->freeValue(headers);
        W->freeString(cookie_str);
        W->freeString(session_id);
      } else {
        Value *err =
            W->objectOf("message",
                        W->string(session_error ? session_error
                                                : "Failed to create session"),
                        NULL);
        send_json_response(ctx->client_fd, 500, "Server Error", err);
        W->freeValue(err);
      }
      if (session_error)
        W->freeString(session_error);
    } else {
      Value *err =
          W->objectOf("message", W->string("Invalid credentials"), NULL);
      send_json_response(ctx->client_fd, 401, "Unauthorized", err);
      W->freeValue(err);
    }
  } else {
    Value *err = W->objectOf("message", W->string("Invalid credentials"), NULL);
    send_json_response(ctx->client_fd, 401, "Unauthorized", err);
    W->freeValue(err);
  }
  if (query_error)
    W->freeString(query_error);
  if (query_result)
    W->freeValue(query_result);
  W->freeValue(body_json);
}

static void test_handler_logout(RequestContext *ctx) {
  Value *headers = W->objectGetRef(ctx->request, "headers");
  if (headers) {
    Value *cookie_header = W->objectGetRef(headers, "cookie");
    if (cookie_header && W->valueGetType(cookie_header) == VALUE_STRING) {
      Value *cookies = W->cookie->parse(W->valueAsString(cookie_header));
      Value *session_id_val = W->objectGetRef(cookies, "session_id");
      if (session_id_val && W->valueGetType(session_id_val) == VALUE_STRING) {
        const char *session_id = W->valueAsString(session_id_val);
        W->auth->deleteSession(ctx->db, session_id, NULL);
      }
      W->freeValue(cookies);
    }
  }
  char *cookie_str = "session_id=; HttpOnly; Path=/; Max-Age=0";
  Value *response_headers =
      W->objectOf("Set-Cookie", W->string(cookie_str), NULL);
  Value *ok = W->objectOf("message", W->string("Logout successful"), NULL);
  send_json_response_with_headers(ctx->client_fd, 200, "OK", response_headers,
                                  ok);
  W->freeValue(response_headers);
  W->freeValue(ok);
}

static void test_handler_root(RequestContext *ctx) {
  const char *resp = "HTTP/1.1 200 OK\r\n\r\nRoot Handler Called";
  W->server->writeResponse(ctx->client_fd, resp);
}

static void test_auth_middleware(RequestContext *ctx, NextFunc next) {
  Value *headers = W->objectGetRef(ctx->request, "headers");
  if (headers) {
    Value *cookie_header = W->objectGetRef(headers, "cookie");
    if (cookie_header && W->valueGetType(cookie_header) == VALUE_STRING) {
      Value *cookies = W->cookie->parse(W->valueAsString(cookie_header));
      Value *session_id_val = W->objectGetRef(cookies, "session_id");
      if (session_id_val && W->valueGetType(session_id_val) == VALUE_STRING) {
        const char *session_id = W->valueAsString(session_id_val);
        Value *user = NULL;
        char *error = NULL;
        W->auth->getUserFromSession(ctx->db, session_id, &user, &error);
        if (user) {
          ctx->user = user;
        }
        if (error)
          W->freeString(error);
      }
      W->freeValue(cookies);
    }
  }
  next(ctx);
}

static void test_handler_user(RequestContext *ctx) {
  const char *id = W->valueAsString(W->objectGetRef(ctx->params, "id"));
  char buffer[256];
  if (ctx->user) {
    const char *user_name =
        W->valueAsString(W->objectGetRef(ctx->user, "username"));
    snprintf(buffer, sizeof(buffer),
             "HTTP/1.1 200 OK\r\n\r\nUser Handler Called for ID: %s "
             "(Authenticated as %s)",
             id, user_name);
  } else {
    snprintf(buffer, sizeof(buffer),
             "HTTP/1.1 200 OK\r\n\r\nUser Handler Called for ID: %s "
             "(Unauthenticated)",
             id);
  }
  W->server->writeResponse(ctx->client_fd, buffer);
}

static void test_handler_post(RequestContext *ctx) {
  const char *body = W->valueAsString(W->objectGetRef(ctx->request, "body"));
  char buffer[1024];
  snprintf(buffer, sizeof(buffer), "HTTP/1.1 200 OK\r\n\r\nPOST Handled: %s",
           body);
  W->server->writeResponse(ctx->client_fd, buffer);
}

static void test_handler_posts_by_date(RequestContext *ctx) {
  const char *year = W->valueAsString(W->objectGetRef(ctx->params, "year"));
  const char *month = W->valueAsString(W->objectGetRef(ctx->params, "month"));
  char buffer[256];
  snprintf(buffer, sizeof(buffer), "HTTP/1.1 200 OK\r\n\r\nPosts for %s/%s",
           month, year);
  W->server->writeResponse(ctx->client_fd, buffer);
}

void router_setup_test_routes(Router *router) {
  MiddlewareFunc user_middleware[] = {test_db_middleware, test_auth_middleware};
  MiddlewareFunc db_middleware[] = {test_db_middleware};
  W->router->addRoute(router, HTTP_GET, "/", test_handler_root);
  W->router->addRouteWithMiddleware(router, HTTP_GET, "/users/[id]",
                                    user_middleware, 2, test_handler_user);
  W->router->addRoute(router, HTTP_POST, "/data", test_handler_post);
  W->router->addRoute(router, HTTP_GET, "/posts/[year]/[month]",
                      test_handler_posts_by_date);
  W->router->addRouteWithMiddleware(router, HTTP_POST, "/register",
                                    db_middleware, 1, test_handler_register);
  W->router->addRouteWithMiddleware(router, HTTP_POST, "/login", db_middleware,
                                    1, test_handler_login);
  W->router->addRouteWithMiddleware(router, HTTP_POST, "/logout", db_middleware,
                                    1, test_handler_logout);
}
