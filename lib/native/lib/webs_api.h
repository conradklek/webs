#ifndef WEBS_API_H
#define WEBS_API_H

#include "core/types.h"
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>

typedef struct Value Value;
typedef struct VNode VNode;
typedef struct Engine Engine;
typedef struct Server Server;
typedef void (*RequestHandler)(int client_fd, const char *request);

typedef struct WebsFsApi WebsFsApi;
typedef struct WebsDbApi WebsDbApi;
typedef struct WebsJsonApi WebsJsonApi;
typedef struct WebsUrlApi WebsUrlApi;
typedef struct WebsHttpApi WebsHttpApi;
typedef struct WebsServerApi WebsServerApi;
typedef struct WebsConsoleApi WebsConsoleApi;

typedef struct {
  Value *(*string)(const char *s);
  Value *(*number)(double n);
  Value *(*boolean)(bool b);
  Value *(*object)(void);
  Value *(*array)(void);
  Value *(*null)(void);
  Value *(*pointer)(void *p);

  ValueType (*valueGetType)(const Value *value);
  bool (*valueAsBool)(const Value *value);
  double (*valueAsNumber)(const Value *value);
  const char *(*valueAsString)(const Value *value);
  bool (*valueEquals)(const Value *a, const Value *b);
  char *(*stringTrim)(const char *s);

  Status (*arrayPush)(Value *array_val, Value *element);
  size_t (*arrayCount)(const Value *array_val);
  Value *(*arrayGet)(const Value *array_val, size_t index);

  Status (*objectSet)(Value *object_val, const char *key, Value *value);
  Value *(*objectGet)(const Value *object_val, const char *key);
  Value *(*objectKeys)(const Value *object_val);

  VNode *(*h)(const char *type, Value *props, Value *children);
  Value *(*diff)(VNode *old_vnode, VNode *new_vnode);
  Value *(*vnodeToValue)(const VNode *vnode);

  char *(*bundle)(const char *input_dir, const char *output_dir);
  Value *(*parseTemplate)(const char *template_string);
  Value *(*parseExpression)(const char *expression_string);
  char *(*ssr)(const char *template_string, const char *context_json);
  Engine *(*createEngine)();
  void (*destroyEngine)(Engine *engine);

  void (*freeString)(char *str);
  void (*freeValue)(Value *value);
  void (*freeVNode)(VNode *vnode);
  Value *(*valueClone)(const Value *original);

  const WebsFsApi *const fs;
  const WebsDbApi *const db;
  const WebsJsonApi *const json;
  const WebsUrlApi *const url;
  const WebsHttpApi *const http;
  const WebsServerApi *const server;
  const WebsConsoleApi *const log;

} WebsApi;

struct WebsConsoleApi {
  void (*info)(const char *format, ...);
  void (*warn)(const char *format, ...);
  void (*error)(const char *format, ...);
  void (*debug)(const char *format, ...);
};

struct WebsFsApi {
  char *(*readFile)(const char *path);
  char *(*writeFile)(const char *path, const char *content);
  bool (*exists)(const char *path);
  char *(*deleteFile)(const char *path);
  char *(*createDir)(const char *path);
  char *(*deleteDir)(const char *path);
  char *(*listDir)(const char *path);
  char *(*rename)(const char *old_path, const char *new_path);
  char *(*stat)(const char *path);
  char *(*glob)(const char *pattern);
};

struct WebsDbApi {
  Value *(*open)(const char *filename);
  Value *(*close)(Value *db_handle_val);
  Value *(*exec)(Value *db_handle_val, const char *sql);
  Value *(*query)(Value *db_handle_val, const char *sql);
};

struct WebsJsonApi {
  Value *(*parse)(const char *json_string, Status *status);
  char *(*encode)(const Value *value);
  char *(*query)(const char *json_string, const char *path);
  char *(*prettyPrint)(const Value *value);
};

struct WebsUrlApi {
  char *(*decode)(const char *url_string);
  char *(*matchRoute)(const char *pattern, const char *path);
};

struct WebsHttpApi {
  char *(*parseRequest)(const char *raw_request);
  char *(*fetch)(const char *url, const char *options_json);
};

struct WebsServerApi {
  Server *(*start)(const char *host, int port);
  int (*listen)(Server *server, RequestHandler handler);
  void (*stop)(Server *server);
  void (*destroy)(Server *server);
  void (*writeResponse)(int client_fd, const char *response);
  int (*serveStatic)(const char *host, int port, const char *public_dir);
  void (*streamBegin)(int client_fd, int status_code, const char *content_type);
  void (*streamWrite)(int client_fd, const char *data, size_t len);
  void (*streamEnd)(int client_fd);
};

const WebsApi *webs();

#endif
