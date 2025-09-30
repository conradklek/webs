#ifndef WEBS_API_H
#define WEBS_API_H

#include "core/string_builder.h"
#include "core/types.h"
#include "framework/router.h"
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>

// Forward declarations to keep this header self-contained
typedef struct Value Value;
typedef struct VNode VNode;
typedef struct Engine Engine;
typedef struct Server Server;
typedef struct ComponentInstance ComponentInstance;
typedef struct Map Map;
typedef void (*RequestHandler)(int client_fd, const char *request);
typedef void (*LifecycleHookFunc)(void);

// --- API Struct Definitions ---
typedef struct WebsFsApi WebsFsApi;
typedef struct WebsDbApi WebsDbApi;
typedef struct WebsJsonApi WebsJsonApi;
typedef struct WebsUrlApi WebsUrlApi;
typedef struct WebsHttpApi WebsHttpApi;
typedef struct WebsServerApi WebsServerApi;
typedef struct WebsConsoleApi WebsConsoleApi;
typedef struct WebsAssetApi WebsAssetApi;
typedef struct WebsRouterApi WebsRouterApi;
typedef struct WebsAuthApi WebsAuthApi;
typedef struct WebsCookieApi WebsCookieApi;
typedef struct WebsPathApi WebsPathApi;
typedef struct WebsStringBuilderApi WebsStringBuilderApi;

/**
 * @struct WebsApi
 * @brief The main, unified API for the Webs framework.
 */
typedef struct {
  // --- Core Value Creation ---
  Value *(*string)(const char *s);
  Value *(*number)(double n);
  Value *(*boolean)(bool b);
  Value *(*object)(void);
  Value *(*array)(void);
  Value *(*null)(void);
  Value *(*undefined)(void);
  Value *(*pointer)(void *p);

  // --- Core Value Helpers ---
  Value *(*objectOf)(const char *key, ...);
  Value *(*arrayOf)(int count, ...);

  // --- Core Value Introspection & Comparison ---
  ValueType (*valueGetType)(const Value *value);
  bool (*valueAsBool)(const Value *value);
  double (*valueAsNumber)(const Value *value);
  const char *(*valueAsString)(const Value *value);
  bool (*valueEquals)(const Value *a, const Value *b);
  int (*valueCompare)(const Value *a, const Value *b);
  Value *(*valueClone)(const Value *original);

  // --- String Utilities ---
  char *(*stringTrim)(const char *s);
  char *(*stringTrimStart)(const char *s);
  char *(*stringTrimEnd)(const char *s);
  char **(*stringSplit)(const char *str, const char *delimiter, int *count);
  bool (*stringStartsWith)(const char *str, const char *prefix);
  int (*stringIndexOf)(const char *str, const char *substring);
  char *(*stringSlice)(const char *str, int start, int end);
  char *(*stringReplace)(const char *str, const char *search,
                         const char *replace);
  int (*stringCompare)(const char *s1, const char *s2);

  // --- Array Methods ---
  Status (*arrayPush)(Value *array_val, Value *element);
  size_t (*arrayCount)(const Value *array_val);
  Value *(*arrayGetRef)(const Value *array_val, size_t index);
  Value *(*arrayGetClone)(const Value *array_val, size_t index);

  // --- Object Methods ---
  Status (*objectSet)(Value *object_val, const char *key, Value *value);
  Value *(*objectGetRef)(const Value *object_val, const char *key);
  Value *(*objectGetClone)(const Value *object_val, const char *key);
  Value *(*objectKeys)(const Value *object_val);

  // --- Component Lifecycle & Composition API ---
  void (*provide)(Engine *engine, const char *key, Value *value);
  Value *(*inject)(Engine *engine, const char *key);
  ComponentInstance *(*createInstance)(Engine *engine, VNode *vnode,
                                       ComponentInstance *parent);
  void (*destroyInstance)(ComponentInstance *instance);
  void (*onMounted)(Engine *engine, LifecycleHookFunc hook);
  void (*onBeforeUnmount)(Engine *engine, LifecycleHookFunc hook);

  // --- VDOM & Rendering ---
  VNode *(*h)(const char *type, Value *props, Value *children);
  Value *(*diff)(VNode *old_vnode, VNode *new_vnode);
  Value *(*vnodeToValue)(const VNode *vnode);
  char *(*ssr)(const char *template_string, const char *context_json);
  char *(*renderToString)(Engine *engine, const char *component_name,
                          Value *props_and_initial_state);

  // --- Parsing & Serialization ---
  Status (*bundle)(const char *input_dir, const char *output_dir,
                   char **error_out);
  Value *(*parseTemplate)(const char *template_string, Status *status);
  Value *(*parseExpression)(const char *expression_string, Status *status);
  Value *(*regexParse)(const char *pattern, Status *status);
  char *(*wsonEncode)(const Value *value);
  Value *(*wsonDecode)(Engine *engine, const char *wson_string, char **error);

  // --- Framework Engine ---
  Engine *(*createEngine)();
  void (*destroyEngine)(Engine *engine);
  void (*registerComponent)(Engine *engine, const char *name,
                            Value *definition);

  // --- Memory Management ---
  void (*freeString)(char *str);
  void (*freeStringArray)(char **arr, int count);
  void (*freeValue)(Value *value);
  void (*freeVNode)(VNode *vnode);

  // --- Utility ---
  const char *(*statusToString)(Status status);

  // --- Sub-APIs ---
  const WebsFsApi *const fs;
  const WebsDbApi *const db;
  const WebsJsonApi *const json;
  const WebsUrlApi *const url;
  const WebsHttpApi *const http;
  const WebsServerApi *const server;
  const WebsAssetApi *const asset;
  const WebsConsoleApi *const log;
  const WebsRouterApi *const router;
  const WebsAuthApi *const auth;
  const WebsCookieApi *const cookie;
  const WebsPathApi *const path;
  const WebsStringBuilderApi *const stringBuilder;
} WebsApi;

struct WebsConsoleApi {
  void (*info)(const char *format, ...);
  void (*warn)(const char *format, ...);
  void (*error)(const char *format, ...);
  void (*debug)(const char *format, ...);
};

struct WebsFsApi {
  Status (*readFile)(const char *path, char **out_content, char **out_error);
  Status (*writeFile)(const char *path, const char *content, char **out_error);
  bool (*exists)(const char *path);
  Status (*deleteFile)(const char *path, char **out_error);
  Status (*createDir)(const char *path, char **out_error);
  Status (*deleteDir)(const char *path, char **out_error);
  Status (*listDir)(const char *path, char **out_json_array, char **out_error);
  Status (*rename)(const char *old_path, const char *new_path,
                   char **out_error);
  Status (*stat)(const char *path, char **out_json_object, char **out_error);
  Status (*glob)(const char *pattern, char **out_json_array, char **out_error);
};

struct WebsDbApi {
  Status (*open)(const char *filename, Value **out_db_handle, char **out_error);
  Status (*close)(Value *db_handle_val, char **out_error);
  Status (*exec)(Value *db_handle_val, const char *sql, char **out_error);
  Status (*query)(Value *db_handle_val, const char *sql,
                  Value **out_results_array, char **out_error);
};

struct WebsJsonApi {
  Status (*parse)(const char *json_string, Value **out_value, char **out_error);
  char *(*encode)(const Value *value);
  Status (*query)(const char *json_string, const char *path, Value **out_value,
                  char **out_error);
  char *(*prettyPrint)(const Value *value);
};

struct WebsUrlApi {
  Status (*decode)(const char *url_string, Value **out_value, char **out_error);
  Status (*matchRoute)(const char *pattern, const char *path,
                       Value **out_params, char **out_error);
};

struct WebsHttpApi {
  Status (*parseRequest)(const char *raw_request, Value **out_value,
                         char **out_error);
  Status (*fetch)(const char *url, const char *options_json,
                  char **out_json_response, char **out_error);
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

struct WebsAssetApi {
  Status (*walk)(const char *file_path, char **out_json, char **out_error);
};

struct WebsRouterApi {
  Router *(*create)(void);
  void (*free)(Router *router);
  void (*addRoute)(Router *router, HttpMethod method, const char *path,
                   RouteHandler handler);
  void (*addRouteWithMiddleware)(Router *router, HttpMethod method,
                                 const char *path, MiddlewareFunc *middleware,
                                 int middleware_count, RouteHandler handler);
  void (*handleRequest)(Router *router, int client_fd, Value *request);
};

struct WebsAuthApi {
  char *(*hashPassword)(const char *password);
  bool (*verifyPassword)(const char *password, const char *hash);
  Status (*createSession)(Value *db_handle_val, const char *username,
                          char **out_session_id, char **out_error);
  Status (*getUserFromSession)(Value *db_handle_val, const char *session_id,
                               Value **out_user, char **out_error);
  Status (*deleteSession)(Value *db_handle_val, const char *session_id,
                          char **out_error);
};

struct WebsCookieApi {
  Value *(*parse)(const char *cookie_header);
  char *(*serialize)(const char *name, const char *value, Value *options);
};

struct WebsPathApi {
  char *(*resolve)(const char *base_path, const char *relative_path);
  char *(*dirname)(const char *path);
};

struct WebsStringBuilderApi {
  void (*init)(StringBuilder *sb);
  void (*appendStr)(StringBuilder *sb, const char *str);
  void (*appendChar)(StringBuilder *sb, char c);
  void (*appendHtmlEscaped)(StringBuilder *sb, const char *text);
  char *(*toString)(StringBuilder *sb);
  void (*free)(StringBuilder *sb);
};

const WebsApi *webs();

#define W webs()

#endif // WEBS_API_H
