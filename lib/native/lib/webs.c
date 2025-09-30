/**
 * @file webs.c
 * @brief FFI entry points for the Webs framework.
 *
 * This file provides the public C functions that are exposed to the Bun FFI.
 * It acts as a bridge between the JavaScript world and the internal C API,
 * which is accessed through the `W` macro (pointing to the `WebsApi` struct).
 *
 * Each function here is a simple wrapper that calls the corresponding
 * function in the internal API, handles basic error conversion (from Status
 * enums to JSON error objects), and manages memory across the FFI boundary.
 */
#include "webs.h"
#include "core/map.h"
#include "framework/router.h"
#include "webs_api.h"
#include <ctype.h>
#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// --- FFI Helper ---
static char *create_json_error(const char *error_type, const char *message) {
  Value *err_obj = W->objectOf("error", W->string(error_type), "message",
                               W->string(message), NULL);
  if (!err_obj)
    return strdup("{\"error\":\"FATAL\", \"message\":\"Memory allocation "
                  "failed while creating error.\"}");
  char *err_json = W->json->encode(err_obj);
  W->freeValue(err_obj);
  return err_json;
}

// --- SSR & Rendering ---
VNode *webs_h(const char *type, Value *props, Value *children) {
  if (!type)
    return NULL;
  return h(type, props, children);
}

void webs_free_vnode(VNode *vnode) {
  if (!vnode)
    return;
  vnode_free(vnode);
}

static VNode *render_template_from_strings(const char *template_string,
                                           const char *context_json,
                                           char **error) {
  *error = NULL;
  Value *context = NULL;
  Value *template_ast = NULL;

  if (!template_string) {
    *error = strdup("Template string is null.");
    return NULL;
  }

  char *parse_error = NULL;
  Status status;
  if (context_json && strlen(context_json) > 0) {
    status = W->json->parse(context_json, &context, &parse_error);
    if (status != OK) {
      asprintf(error, "Failed to parse context JSON: %s", parse_error);
      W->freeString(parse_error);
      return NULL;
    }
  } else {
    context = W->object();
  }

  template_ast = W->parseTemplate(template_string, &status);
  if (status != OK || !template_ast) {
    *error = strdup("Failed to parse template.");
    W->freeValue(context);
    if (template_ast)
      W->freeValue(template_ast);
    return NULL;
  }
  VNode *vnode = render_template(template_ast, context);
  W->freeValue(template_ast);
  W->freeValue(context);
  if (!vnode) {
    *error = strdup("Failed to render template.");
    return NULL;
  }
  return vnode;
}

char *webs_ssr(const char *template_string, const char *context_json) {
  if (!template_string)
    return create_json_error("Invalid Argument",
                             "Template string cannot be null.");
  char *error = NULL;
  VNode *vnode =
      render_template_from_strings(template_string, context_json, &error);
  if (error) {
    char *err_str = create_json_error("RenderError", error);
    free(error);
    if (vnode)
      vnode_free(vnode);
    return err_str;
  }
  char *html = webs_ssr_render_vnode(vnode);
  vnode_free(vnode);
  return html;
}

char *webs_render_vdom(const char *template_string, const char *context_json) {
  if (!template_string)
    return create_json_error("Invalid Argument",
                             "Template string cannot be null.");
  char *error = NULL;
  VNode *vnode =
      render_template_from_strings(template_string, context_json, &error);
  if (error) {
    char *err_str = create_json_error("RenderError", error);
    free(error);
    if (vnode)
      W->freeVNode(vnode);
    return err_str;
  }
  if (!vnode)
    return create_json_error("RenderError", "Failed to render VNode.");

  Value *vdom_value = W->vnodeToValue(vnode);
  W->freeVNode(vnode);
  char *json_string = W->json->encode(vdom_value);
  W->freeValue(vdom_value);
  return json_string;
}

char *webs_render_to_string(Engine *engine, const char *component_name,
                            Value *props_and_initial_state) {
  if (!engine || !component_name) {
    if (props_and_initial_state)
      W->freeValue(props_and_initial_state);
    return strdup("<!-- Invalid arguments to render_to_string -->");
  }
  VNode *vnode_for_instance =
      W->h(component_name, W->valueClone(props_and_initial_state), NULL);
  if (!vnode_for_instance) {
    W->freeValue(props_and_initial_state);
    return strdup("<!-- Failed to create VNode stub for component -->");
  }
  ComponentInstance *instance = component(engine, vnode_for_instance, NULL);
  if (!instance) {
    W->freeVNode(vnode_for_instance);
    W->freeValue(props_and_initial_state);
    return strdup("<!-- Component not found or failed to instantiate -->");
  }
  W->freeValue(props_and_initial_state);
  effect_run(engine, instance->effect);
  if (!instance->sub_tree) {
    component_destroy(instance);
    return strdup("<!-- Template render error: produced null VNode -->");
  }
  char *html = webs_ssr_render_vnode(instance->sub_tree);
  component_destroy(instance);
  return html;
}

// --- Core Value Wrappers ---
Value *webs_number(double n) { return number(n); }
Value *webs_boolean(bool b) { return boolean(b); }
Value *webs_null(void) { return null(); }
Value *webs_undefined(void) { return undefined(); }
Value *webs_pointer(void *p) { return pointer(p); }
Value *webs_string(const char *s) { return string_value(s); }
Value *webs_array(void) { return array_value(); }
Value *webs_object(void) { return object_value(); }
ValueType webs_value_get_type(const Value *v) {
  return v ? v->type : VALUE_NULL;
}
bool webs_value_as_bool(const Value *v) {
  return (v && v->type == VALUE_BOOL) ? v->as.boolean : false;
}
double webs_value_as_number(const Value *v) {
  return (v && v->type == VALUE_NUMBER) ? v->as.number : 0.0;
}
const char *webs_value_as_string(const Value *v) {
  return (v && v->type == VALUE_STRING) ? v->as.string->chars : "";
}
Status webs_array_push(Value *array_val, Value *element) {
  if (!array_val || array_val->type != VALUE_ARRAY || !element)
    return ERROR_INVALID_ARG;
  return array_val->as.array->push(array_val->as.array, element);
}
size_t webs_array_count(const Value *array_val) {
  if (!array_val || array_val->type != VALUE_ARRAY)
    return 0;
  return array_val->as.array->count;
}
Value *webs_array_get_ref(const Value *array_val, size_t index) {
  if (!array_val || array_val->type != VALUE_ARRAY)
    return NULL;
  return array_get_ref(array_val->as.array, index);
}
Value *webs_array_get_clone(const Value *array_val, size_t index) {
  Value *internal_ref = webs_array_get_ref(array_val, index);
  if (!internal_ref)
    return NULL;
  return W->valueClone(internal_ref);
}
Status webs_object_set(Value *object_val, const char *key, Value *value) {
  if (!object_val || object_val->type != VALUE_OBJECT || !key || !value)
    return ERROR_INVALID_ARG;
  return object_val->as.object->set(object_val->as.object, key, value);
}
Value *webs_object_get_ref(const Value *object_val, const char *key) {
  if (!object_val || object_val->type != VALUE_OBJECT || !key)
    return NULL;
  return object_get_ref(object_val->as.object, key);
}
Value *webs_object_get_clone(const Value *object_val, const char *key) {
  Value *internal_ref = webs_object_get_ref(object_val, key);
  if (!internal_ref)
    return NULL;
  return W->valueClone(internal_ref);
}
Value *webs_object_keys(const Value *object_val) {
  if (!object_val || object_val->type != VALUE_OBJECT)
    return W->array();
  Value *keys = W->array();
  if (!keys)
    return NULL;
  Map *map = object_val->as.object->map;
  for (size_t i = 0; i < map->capacity; i++) {
    for (MapEntry *entry = map->entries[i]; entry; entry = entry->next) {
      W->arrayPush(keys, W->string(entry->key));
    }
  }
  return keys;
}

// --- Core Utility Wrappers ---
char *webs_string_trim(const char *s) { return string_trim(s); }
char *webs_string_trim_start(const char *s) { return string_trim_start(s); }
char *webs_string_trim_end(const char *s) { return string_trim_end(s); }
char **webs_string_split(const char *str, const char *delimiter, int *count) {
  return string_split(str, delimiter, count);
}
bool webs_string_starts_with(const char *str, const char *prefix) {
  return string_starts_with(str, prefix);
}
int webs_string_index_of(const char *str, const char *substring) {
  return string_index_of(str, substring);
}
char *webs_string_slice(const char *str, int start, int end) {
  return string_slice(str, start, end);
}
char *webs_string_replace(const char *str, const char *search,
                          const char *replace) {
  return string_replace(str, search, replace);
}
int webs_string_compare(const char *s1, const char *s2) {
  return string_compare(s1, s2);
}
Value *webs_regex_parse(const char *pattern, Status *status) {
  return W->regexParse(pattern, status);
}

// --- Reactivity Wrappers ---
Value *webs_ref(Value *initial_value) { return ref(initial_value); }
Value *webs_ref_get_value(Engine *engine, Value *ref_value) {
  return ref_get_value(engine, ref_value);
}
void webs_ref_set_value(Engine *engine, Value *ref_value, Value *new_value) {
  ref_set_value(engine, ref_value, new_value);
}
Value *webs_reactive(Value *target) { return reactive(target); }
Value *webs_reactive_get(Engine *engine, const Value *proxy, const char *key) {
  return reactive_get(engine, proxy, key);
}
void webs_reactive_set(Engine *engine, Value *proxy, const char *key,
                       Value *value) {
  reactive_set(engine, proxy, key, value);
}
ReactiveEffect *webs_effect(EffectCallback fn, void *user_data) {
  return effect(fn, user_data);
}
void webs_effect_run(Engine *engine, ReactiveEffect *effect) {
  effect_run(engine, effect);
}
void webs_effect_stop(ReactiveEffect *effect) { effect_stop(effect); }
void webs_effect_free(ReactiveEffect *effect) { effect_free(effect); }
void webs_scheduler_flush_jobs(Engine *engine) {
  scheduler_flush_jobs(engine, engine->scheduler);
}
char *webs_wson_encode(const Value *value) { return W->wsonEncode(value); }
Value *webs_wson_decode(Engine *engine, const char *wson_string, char **error) {
  return W->wsonDecode(engine, wson_string, error);
}

// --- Framework Engine ---
Engine *webs_engine_api() { return engine(); }
void webs_engine_destroy_api(Engine *engine) { engine_destroy(engine); }
void webs_engine_register_component(Engine *engine, const char *name,
                                    Value *definition) {
  engine_register_component(engine, name, definition);
}
ComponentInstance *webs_create_instance(Engine *engine, VNode *vnode,
                                        ComponentInstance *parent) {
  return component(engine, vnode, parent);
}
void webs_destroy_instance(ComponentInstance *instance) {
  component_destroy(instance);
}
void webs_mount_component(ComponentInstance *instance) {
  if (!instance || instance->is_mounted)
    return;
  instance->is_mounted = true;
}
void webs_unmount_component(ComponentInstance *instance) {
  if (!instance || !instance->is_mounted)
    return;
  instance->is_mounted = false;
}
void webs_on_mounted(Engine *engine, LifecycleHookFunc hook) {
  W->onMounted(engine, hook);
}
void webs_on_before_unmount(Engine *engine, LifecycleHookFunc hook) {
  W->onBeforeUnmount(engine, hook);
}
void webs_provide(Engine *engine, const char *key, Value *value) {
  W->provide(engine, key, value);
}
Value *webs_inject(Engine *engine, const char *key) {
  return W->inject(engine, key);
}

// --- FFI Boundary Wrappers ---
char *webs_query_json(const char *json_string, const char *path) {
  Status parse_status;
  Value *root = webs_json_parse(json_string, &parse_status);
  if (parse_status != OK) {
    if (root)
      W->freeValue(root);
    return create_json_error("JSONParseError", "Invalid JSON input.");
  }

  char *error = NULL;
  Value *result_val = NULL;
  Status query_status = W->json->query(json_string, path, &result_val, &error);
  W->freeValue(root);

  if (query_status != OK) {
    char *json_err = create_json_error("JSONQueryError",
                                       error ? error : "Unknown query error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  if (!result_val)
    return strdup("null");
  char *result_str = W->json->encode(result_val);
  W->freeValue(result_val);
  return result_str;
}

Value *webs_json_parse(const char *json_string, Status *status) {
  char *error = NULL;
  Value *value = NULL;
  *status = W->json->parse(json_string, &value, &error);
  if (error)
    W->freeString(error);
  return value;
}

char *webs_json_encode(const Value *value) { return W->json->encode(value); }

char *webs_json_pretty_print(const Value *value) {
  return W->json->prettyPrint(value);
}

char *webs_url_decode(const char *url_string) {
  Value *value = NULL;
  char *error = NULL;
  Status status = W->url->decode(url_string, &value, &error);
  if (status != OK) {
    char *json_err = create_json_error(
        "URLParseError", error ? error : "Unknown URL parse error");
    if (error)
      W->freeString(error);
    if (value)
      W->freeValue(value);
    return json_err;
  }
  char *json_string = W->json->encode(value);
  W->freeValue(value);
  return json_string;
}

char *webs_match_route(const char *pattern, const char *path) {
  Value *params = NULL;
  char *error = NULL;
  Status status = W->url->matchRoute(pattern, path, &params, &error);
  if (status != OK) {
    char *err = create_json_error("RouteMatchError",
                                  error ? error : "Unknown match error");
    if (error)
      W->freeString(error);
    if (params)
      W->freeValue(params);
    return err;
  }
  if (!params)
    return strdup("null");
  char *json_string = W->json->encode(params);
  W->freeValue(params);
  return json_string;
}

char *webs_parse_http_request(const char *raw_request) {
  Value *req_obj = NULL;
  char *error = NULL;
  Status status = W->http->parseRequest(raw_request, &req_obj, &error);
  if (status != OK) {
    char *err = create_json_error(
        "HTTPRequestParseError", error ? error : "Unknown request parse error");
    if (error)
      W->freeString(error);
    if (req_obj)
      W->freeValue(req_obj);
    return err;
  }
  char *json_string = W->json->encode(req_obj);
  W->freeValue(req_obj);
  return json_string;
}

char *webs_read_file(const char *path) {
  char *content = NULL;
  char *error = NULL;
  Status status = W->fs->readFile(path, &content, &error);
  if (status != OK) {
    char *json_err = create_json_error("FS_READ_ERROR",
                                       error ? error : "Unknown read error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return content;
}

char *webs_write_file(const char *path, const char *content) {
  char *error = NULL;
  Status status = W->fs->writeFile(path, content, &error);
  if (status != OK) {
    char *json_err = create_json_error("FS_WRITE_ERROR",
                                       error ? error : "Unknown write error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return create_json_error("OK", "File written successfully");
}

bool webs_file_exists(const char *path) { return W->fs->exists(path); }

char *webs_delete_file(const char *path) {
  char *error = NULL;
  Status status = W->fs->deleteFile(path, &error);
  if (status != OK) {
    char *json_err = create_json_error("FS_DELETE_ERROR",
                                       error ? error : "Unknown delete error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return create_json_error("OK", "File deleted successfully");
}

char *webs_dir(const char *path) {
  char *error = NULL;
  Status status = W->fs->createDir(path, &error);
  if (status != OK) {
    char *json_err = create_json_error(
        "FS_DIR_ERROR", error ? error : "Unknown directory creation error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return create_json_error("OK", "Directory created successfully");
}

char *webs_delete_dir(const char *path) {
  char *error = NULL;
  Status status = W->fs->deleteDir(path, &error);
  if (status != OK) {
    char *json_err =
        create_json_error("FS_DELETE_DIR_ERROR",
                          error ? error : "Unknown directory deletion error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return create_json_error("OK", "Directory deleted successfully");
}

char *webs_list_dir(const char *path) {
  char *json_array = NULL;
  char *error = NULL;
  Status status = W->fs->listDir(path, &json_array, &error);
  if (status != OK) {
    char *json_err = create_json_error(
        "FS_LIST_DIR_ERROR", error ? error : "Unknown list directory error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return json_array;
}

char *webs_rename_path(const char *old_path, const char *new_path) {
  char *error = NULL;
  Status status = W->fs->rename(old_path, new_path, &error);
  if (status != OK) {
    char *json_err = create_json_error("FS_RENAME_ERROR",
                                       error ? error : "Unknown rename error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return create_json_error("OK", "Path renamed successfully");
}

char *webs_stat_path(const char *path) {
  char *json_object = NULL;
  char *error = NULL;
  Status status = W->fs->stat(path, &json_object, &error);
  if (status != OK) {
    char *json_err = create_json_error("FS_STAT_ERROR",
                                       error ? error : "Unknown stat error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return json_object;
}

char *webs_glob(const char *pattern) {
  char *json_array = NULL;
  char *error = NULL;
  Status status = W->fs->glob(pattern, &json_array, &error);
  if (status != OK) {
    char *json_err = create_json_error("FS_GLOB_ERROR",
                                       error ? error : "Unknown glob error");
    if (error)
      W->freeString(error);
    return json_err;
  }
  return json_array;
}

char *webs_fetch(const char *url, const char *options_json) {
  char *response = NULL;
  char *error = NULL;
  Status status = W->http->fetch(url, options_json, &response, &error);
  if (status != OK) {
    char *err =
        create_json_error("FetchError", error ? error : "Unknown fetch error");
    if (error)
      W->freeString(error);
    if (response)
      W->freeString(response);
    return err;
  }
  return response;
}

// --- Memory Management ---
void webs_free_string(char *str) {
  if (str)
    free(str);
}
void webs_free_value(Value *value) {
  if (value)
    value_free(value);
}
Value *webs_parse_template(const char *template_string, Status *status) {
  return W->parseTemplate(template_string, status);
}
Value *webs_parse_expression(const char *expression_string, Status *status) {
  return W->parseExpression(expression_string, status);
}

// --- Auth & Cookie ---
char *webs_auth_hash_password(const char *password) {
  return W->auth->hashPassword(password);
}
bool webs_auth_verify_password(const char *password, const char *hash) {
  return W->auth->verifyPassword(password, hash);
}
char *webs_auth_create_session(Value *db_handle_val, const char *username) {
  char *session_id = NULL;
  char *error = NULL;
  W->auth->createSession(db_handle_val, username, &session_id, &error);
  if (error)
    W->freeString(error);
  return session_id;
}
Value *webs_auth_get_user_from_session(Value *db_handle_val,
                                       const char *session_id) {
  Value *user = NULL;
  char *error = NULL;
  W->auth->getUserFromSession(db_handle_val, session_id, &user, &error);
  if (error)
    W->freeString(error);
  return user;
}
void webs_auth_delete_session(Value *db_handle_val, const char *session_id) {
  char *error = NULL;
  W->auth->deleteSession(db_handle_val, session_id, &error);
  if (error)
    W->freeString(error);
}
Value *webs_cookie_parse(const char *cookie_header) {
  return W->cookie->parse(cookie_header);
}
char *webs_cookie_serialize(const char *name, const char *value,
                            Value *options) {
  return W->cookie->serialize(name, value, options);
}

// --- DB ---
Value *webs_db_open(const char *filename) {
  Value *db_handle = NULL;
  char *error = NULL;
  W->db->open(filename, &db_handle, &error);
  if (error)
    W->freeString(error);
  return db_handle;
}
Value *webs_db_close(Value *db_handle_val) {
  char *error = NULL;
  W->db->close(db_handle_val, &error);
  if (error) {
    Value *err_val = W->string(error);
    W->freeString(error);
    return err_val;
  }
  return W->boolean(true);
}
Value *webs_db_exec(Value *db_handle_val, const char *sql) {
  char *error = NULL;
  W->db->exec(db_handle_val, sql, &error);
  if (error) {
    Value *err_val = W->string(error);
    W->freeString(error);
    return err_val;
  }
  return W->boolean(true);
}
Value *webs_db_query(Value *db_handle_val, const char *sql) {
  Value *results = NULL;
  char *error = NULL;
  W->db->query(db_handle_val, sql, &results, &error);
  if (error) {
    Value *err_val = W->string(error);
    W->freeString(error);
    if (results)
      W->freeValue(results);
    return err_val;
  }
  return results;
}

// --- Server ---
Server *webs_server(const char *host, int port) {
  return W->server->start(host, port);
}
int webs_server_listen(Server *server, RequestHandler handler) {
  if (!server || !server->listen)
    return -1;
  return server->listen(server, handler);
}
void webs_server_stop(Server *server) {
  if (!server || !server->stop)
    return;
  server->stop(server);
}
void webs_server_destroy(Server *server) { W->server->destroy(server); }
void webs_server_write_response(int client_fd, const char *response) {
  W->server->writeResponse(client_fd, response);
}
void webs_http_stream_begin(int client_fd, int status_code,
                            const char *content_type) {
  W->server->streamBegin(client_fd, status_code, content_type);
}
void webs_http_stream_write_chunk(int client_fd, const char *data, size_t len) {
  W->server->streamWrite(client_fd, data, len);
}
void webs_http_stream_end(int client_fd) { W->server->streamEnd(client_fd); }
int webs_static_server(const char *host, int port, const char *public_dir) {
  return W->server->serveStatic(host, port, public_dir);
}

// --- Router ---
Value *webs_router_create(void) {
  Router *router = W->router->create();
  if (!router)
    return NULL;
  router_setup_test_routes(router);
  return W->pointer(router);
}
void webs_router_free(Value *router_ptr_val) {
  if (router_ptr_val && W->valueGetType(router_ptr_val) == VALUE_POINTER) {
    W->router->free((Router *)router_ptr_val->as.pointer);
  }
}
char *webs_test_run_router_logic(Value *router_obj_val,
                                 const char *request_json) {
  // This is a complex test-specific function, keeping its original shape.
  // A full refactor would require a different testing strategy.
  if (!router_obj_val || !request_json) {
    return create_json_error("TestError", "Invalid arguments for router test.");
  }
  Router *router = (Router *)((Value *)router_obj_val)->as.pointer;
  int pipe_fds[2];
  if (pipe(pipe_fds) == -1)
    return create_json_error("TestError", "Failed to create pipe.");
  Status status;
  Value *request = webs_json_parse(request_json, &status);
  if (status != OK) {
    close(pipe_fds[0]);
    close(pipe_fds[1]);
    if (request)
      W->freeValue(request);
    return create_json_error("TestError", "Failed to parse request JSON.");
  }
  W->router->handleRequest(router, pipe_fds[1], request);
  W->freeValue(request);
  close(pipe_fds[1]);
  char buffer[4096] = {0};
  read(pipe_fds[0], buffer, sizeof(buffer) - 1);
  close(pipe_fds[0]);
  return strdup(buffer);
}

// --- Bundler ---
Status webs_bundle(const char *entry_file, const char *output_dir,
                   char **error_out) {
  return W->bundle(entry_file, output_dir, error_out);
}

char *webs_asset_walk(const char *file_path) {
  char *result_json = NULL;
  char *error = NULL;
  Status status = W->asset->walk(file_path, &result_json, &error);
  if (status != OK) {
    char *err_json = create_json_error("AssetWalkError",
                                       error ? error : "Unknown asset error");
    if (error)
      W->freeString(error);
    if (result_json)
      W->freeString(result_json);
    return err_json;
  }
  return result_json;
}

void webs_set_log_level(int level) {
  console()->set_level(console(), (LogLevel)level);
}
