#include "webs.h"
#include <ctype.h>
#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *create_json_error(const char *error_type, const char *message) {
  Value *err_obj = object_value();
  if (!err_obj)
    return strdup("{\"error\":\"FATAL\", \"message\":\"Memory allocation "
                  "failed while creating error.\"}");

  err_obj->as.object->set(err_obj->as.object, "error",
                          string_value(error_type));
  err_obj->as.object->set(err_obj->as.object, "message", string_value(message));

  char *err_json = json_encode(err_obj);
  value_free(err_obj);
  return err_json;
}

static char *create_ffi_json_error(const char *prefix, const char *path,
                                   Status status) {
  const char *status_str = webs_status_to_string(status);
  const char *errno_str = strerror(errno);
  char message[512];
  snprintf(message, sizeof(message), "%s '%s': %s", prefix, path, errno_str);
  return create_json_error(status_str, message);
}

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
  if (!template_string) {
    *error = strdup("Template string is null.");
    return NULL;
  }

  Value *context = NULL;
  if (context_json && strlen(context_json) > 0) {
    Status status;
    context = webs_json_parse(context_json, &status);
    if (status != OK) {
      *error = strdup("Failed to parse context JSON.");
      return NULL;
    }
  } else {
    context = object_value();
  }

  Value *template_ast = webs_template_parse(template_string);
  if (!template_ast) {
    *error = strdup("Failed to parse template.");
    value_free(context);
    return NULL;
  }

  VNode *vnode = render_template(template_ast, context);
  value_free(template_ast);
  value_free(context);

  if (!vnode) {
    *error = strdup("Failed to render template.");
    return NULL;
  }
  return vnode;
}

char *webs_ssr(const char *template_string, const char *context_json) {
  if (!template_string) {
    return create_json_error("Invalid Argument",
                             "Template string cannot be null.");
  }
  char *error = NULL;
  VNode *vnode =
      render_template_from_strings(template_string, context_json, &error);
  if (error) {
    char *err_str = create_json_error("RenderError", error);
    free(error);
    return err_str;
  }

  if (!vnode) {
    return create_json_error("RenderError", "Failed to render VNode.");
  }

  char *html = webs_ssr_render_vnode(vnode);
  vnode_free(vnode);
  return html;
}

char *webs_render_vdom(const char *template_string, const char *context_json) {
  if (!template_string) {
    return create_json_error("Invalid Argument",
                             "Template string cannot be null.");
  }
  char *error = NULL;
  VNode *vnode =
      render_template_from_strings(template_string, context_json, &error);
  if (error) {
    char *err_str = create_json_error("RenderError", error);
    free(error);
    return err_str;
  }

  if (!vnode) {
    return create_json_error("RenderError", "Failed to render VNode.");
  }

  Value *vdom_value = vnode_to_value(vnode);
  vnode_free(vnode);

  char *json_string = json_encode(vdom_value);
  value_free(vdom_value);

  return json_string;
}

char *webs_render_to_string(Engine *engine, const char *component_name,
                            Value *props) {
  if (!engine || !component_name) {
    return strdup("<!-- Invalid arguments to render_to_string -->");
  }
  Value *comp_def = engine->components->get(engine->components, component_name);
  if (!comp_def) {
    return strdup("<!-- Component not found -->");
  }

  Object *def_obj = comp_def->as.object;
  Value *template_val = def_obj->get(def_obj, "template");
  if (!template_val || template_val->type != VALUE_STRING) {
    return strdup("<!-- Component has no template -->");
  }
  const char *template_str = template_val->as.string->chars;

  Value *template_ast = webs_template_parse(template_str);
  if (!template_ast) {
    return strdup("<!-- Template parse error -->");
  }

  VNode *vnode = render_template(template_ast, props);
  value_free(template_ast);
  if (!vnode) {
    return strdup("<!-- Template render error -->");
  }

  char *html = webs_ssr_render_vnode(vnode);
  vnode_free(vnode);

  return html;
}

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
Value *webs_array_get(const Value *array_val, size_t index) {
  if (!array_val || array_val->type != VALUE_ARRAY)
    return NULL;
  return array_get(array_val->as.array, index);
}

Status webs_object_set(Value *object_val, const char *key, Value *value) {
  if (!object_val || object_val->type != VALUE_OBJECT || !key || !value)
    return ERROR_INVALID_ARG;
  return object_val->as.object->set(object_val->as.object, key, value);
}
Value *webs_object_get(const Value *object_val, const char *key) {
  if (!object_val || object_val->type != VALUE_OBJECT || !key)
    return NULL;
  return object_val->as.object->get(object_val->as.object, key);
}
Value *webs_object_keys(const Value *object_val) {
  if (!object_val || object_val->type != VALUE_OBJECT)
    return NULL;
  Value *keys = array_value();
  if (!keys)
    return NULL;
  Map *map = object_val->as.object->map;
  for (size_t i = 0; i < map->capacity; i++) {
    for (MapEntry *entry = map->entries[i]; entry; entry = entry->next) {
      webs_array_push(keys, string_value(entry->key));
    }
  }
  return keys;
}

char *webs_string_trim_start(const char *s) { return string_trim_start(s); }
char *webs_string_trim_end(const char *s) { return string_trim_end(s); }
char *webs_string_trim(const char *s) { return string_trim(s); }
Value *webs_regex_parse(const char *pattern, Status *status) {
  if (!pattern || !status) {
    if (status)
      *status = ERROR_INVALID_ARG;
    return NULL;
  }
  return regex_parse(pattern, status);
}
DomNode *webs_dom_create_element(const char *tag_name) {
  if (!tag_name)
    return NULL;
  return dom_create_element(tag_name);
}
void webs_dom_free_node(DomNode *node) {
  if (!node)
    return;
  dom_free_node(node);
}
void webs_dom_append_child(DomNode *parent, DomNode *child) {
  if (!parent || !child)
    return;
  dom_append_child(parent, child);
}
void webs_dom_set_attribute(DomNode *node, const char *key, Value *value) {
  if (!node || !key || !value)
    return;
  dom_set_attribute(node, key, value);
}
void webs_dom_add_event_listener(DomNode *node, const char *event_type,
                                 Value *listener) {
  if (!node || !event_type || !listener)
    return;
  dom_add_event_listener(node, event_type, listener);
}
void webs_event_dispatch_click(DomNode *node) {
  if (!node)
    return;
  Event event = {.type = "click", .target = node, .detail = NULL};
  event_dispatch(&event);
}
void webs_scheduler_flush_jobs(Engine *engine) {
  if (!engine)
    return;
  scheduler_flush_jobs(engine, engine->scheduler);
}
Engine *webs_engine_api() { return engine(); }
void webs_engine_destroy_api(Engine *engine) {
  if (!engine)
    return;
  engine_destroy(engine);
}
void webs_engine_register_component(Engine *engine, const char *name,
                                    Value *definition) {
  if (!engine || !name || !definition)
    return;
  engine_register_component(engine, name, definition);
}
ComponentInstance *webs_create_instance(Engine *engine, VNode *vnode,
                                        ComponentInstance *parent) {
  if (!engine || !vnode)
    return NULL;
  return component(engine, vnode, parent);
}
void webs_destroy_instance(ComponentInstance *instance) {
  if (!instance)
    return;
  component_destroy(instance);
}
void webs_mount_component(ComponentInstance *instance) {
  if (!instance || instance->is_mounted)
    return;
  if (instance->on_mount && instance->on_mount->type == VALUE_POINTER) {
    EffectCallback fn = (EffectCallback)instance->on_mount->as.pointer;
    if (fn) {
      fn(instance);
    }
  }
  instance->is_mounted = true;
}
void webs_unmount_component(ComponentInstance *instance) {
  if (!instance || !instance->is_mounted)
    return;
  if (instance->on_before_unmount &&
      instance->on_before_unmount->type == VALUE_POINTER) {
    EffectCallback fn = (EffectCallback)instance->on_before_unmount->as.pointer;
    if (fn) {
      fn(instance);
    }
  }
  instance->is_mounted = false;
}
void webs_set_log_level(int level) {
  if (level >= LOG_LEVEL_DEBUG && level <= LOG_LEVEL_NONE) {
    console()->set_level(console(), (LogLevel)level);
  }
}

char *webs_query_json(const char *json_string, const char *path) {
  if (!json_string || !path) {
    return create_json_error("Invalid Argument",
                             "JSON string and path cannot be null.");
  }

  Status status;
  Value *root = webs_json_parse(json_string, &status);

  if (status != OK) {
    if (root)
      value_free(root);
    char message[256];
    snprintf(message, sizeof(message),
             "Failed to parse JSON for query. Status: %s",
             webs_status_to_string(status));
    return create_json_error("JSONParseError", message);
  }

  Value *result_val = value_query(root, path, &status);
  value_free(root);

  if (status != OK) {
    if (result_val)
      value_free(result_val);
    const char *error_type =
        (status == ERROR_NOT_FOUND) ? "JSONQueryError" : "InternalError";
    char message[256];
    snprintf(message, sizeof(message), "Failed to query path '%s'. Status: %s",
             path, webs_status_to_string(status));
    return create_json_error(error_type, message);
  }

  if (!result_val) {
    return strdup("null");
  }

  char *result_str = webs_json_encode(result_val);
  value_free(result_val);

  return result_str;
}

Value *webs_json_parse(const char *json_string, Status *status) {
  if (!json_string || !status) {
    if (status)
      *status = ERROR_INVALID_ARG;
    return NULL;
  }
  Value *value = json_decode(json_string, status);
  if (*status != OK) {
    if (value)
      value_free(value);
    return NULL;
  }
  return value;
}
char *webs_json_encode(const Value *value) {
  if (!value)
    return strdup("null");
  return json_encode(value);
}
char *webs_json_pretty_print(const Value *value) {
  if (!value)
    return strdup("null");
  return json_pretty_print(value);
}
char *webs_url_decode(const char *url_string) {
  if (!url_string) {
    return create_json_error("Invalid Argument", "URL string cannot be null.");
  }
  Status status;
  Value *value = url_decode(url_string, &status);
  if (status != OK) {
    if (value)
      value_free(value);
    char message[256];
    snprintf(message, sizeof(message), "Failed to parse URL. Status: %s",
             webs_status_to_string(status));
    return create_json_error("URLParseError", message);
  }
  char *json_string = json_encode(value);
  value_free(value);
  return json_string;
}
char *webs_match_route(const char *pattern, const char *path) {
  if (!pattern || !path) {
    return create_json_error("Invalid Argument",
                             "Pattern and path cannot be null.");
  }
  Status status;
  Value *params = url_match_route(pattern, path, &status);
  if (status != OK) {
    if (params)
      value_free(params);
    return create_json_error("RouteMatchError", "Error during route matching.");
  }
  if (!params) {
    return strdup("null");
  }
  char *json_string = json_encode(params);
  value_free(params);
  return json_string;
}
char *webs_parse_http_request(const char *raw_request) {
  if (!raw_request) {
    return create_json_error("Invalid Argument",
                             "Request string cannot be null.");
  }
  char *error = NULL;
  Value *request_obj = webs_http_parse_request(raw_request, &error);
  if (error) {
    if (request_obj)
      value_free(request_obj);
    char *json_error = create_json_error("HTTPRequestParseError", error);
    free(error);
    return json_error;
  }
  if (!request_obj) {
    return create_json_error("HTTPRequestParseError",
                             "Parser returned NULL without an error message.");
  }
  char *json_string = json_encode(request_obj);
  value_free(request_obj);
  return json_string;
}
char *webs_fetch(const char *url, const char *options_json) {
  if (!url) {
    return create_json_error("Invalid Argument", "URL cannot be null.");
  }
  char *error = NULL;
  char *result = webs_fetch_sync(url, options_json, &error);
  if (error) {
    if (result)
      free(result);
    result = create_json_error("FetchError", error);
    free(error);
  }
  return result;
}
void webs_free_string(char *str) {
  if (str)
    free(str);
}
void webs_free_value(Value *value) {
  if (value)
    value_free(value);
}
Value *webs_parse_template(const char *template_string) {
  if (!template_string)
    return NULL;
  return webs_template_parse(template_string);
}
Value *webs_parse_expression(const char *expression_string) {
  if (!expression_string)
    return NULL;
  return parse_expression(expression_string);
}
char *webs_read_file(const char *path) {
  if (!path) {
    return create_json_error("Invalid Argument", "File path cannot be null.");
  }
  Status status;
  char *content = read_file_sync(path, &status);
  return (status != OK)
             ? create_ffi_json_error("Could not read file", path, status)
             : content;
}
char *webs_write_file(const char *path, const char *content) {
  if (!path || !content) {
    return create_json_error("Invalid Argument",
                             "Path and content cannot be null.");
  }
  Status status = write_file_sync(path, content);
  return (status != OK)
             ? create_ffi_json_error("Could not write to file", path, status)
             : NULL;
}
bool webs_file_exists(const char *path) {
  if (!path)
    return false;
  return file_exists_sync(path);
}
char *webs_delete_file(const char *path) {
  if (!path) {
    return create_json_error("Invalid Argument", "File path cannot be null.");
  }
  Status status = delete_file_sync(path);
  return (status != OK)
             ? create_ffi_json_error("Could not delete file", path, status)
             : NULL;
}
char *webs_dir(const char *path) {
  if (!path) {
    return create_json_error("Invalid Argument",
                             "Directory path cannot be null.");
  }
  Status status = create_dir_sync(path);
  return (status != OK)
             ? create_ffi_json_error("Could not create directory", path, status)
             : NULL;
}
char *webs_delete_dir(const char *path) {
  if (!path) {
    return create_json_error("Invalid Argument",
                             "Directory path cannot be null.");
  }
  Status status = delete_dir_sync(path);
  return (status != OK)
             ? create_ffi_json_error("Could not delete directory", path, status)
             : NULL;
}
char *webs_list_dir(const char *path) {
  if (!path) {
    return create_json_error("Invalid Argument",
                             "Directory path cannot be null.");
  }
  Status status;
  char *content = list_dir_sync(path, &status);
  return (status != OK)
             ? create_ffi_json_error("Could not list directory", path, status)
             : content;
}
char *webs_rename_path(const char *old_path, const char *new_path) {
  if (!old_path || !new_path) {
    return create_json_error("Invalid Argument",
                             "Old and new paths cannot be null.");
  }
  Status status = rename_sync(old_path, new_path);
  return (status != OK)
             ? create_ffi_json_error("Could not rename path", old_path, status)
             : NULL;
}
char *webs_stat_path(const char *path) {
  if (!path) {
    return create_json_error("Invalid Argument", "File path cannot be null.");
  }
  Status status;
  char *content = stat_sync(path, &status);
  return (status != OK)
             ? create_ffi_json_error("Could not stat path", path, status)
             : content;
}
char *webs_glob(const char *pattern) {
  if (!pattern) {
    return create_json_error("Invalid Argument",
                             "Glob pattern cannot be null.");
  }
  Status status;
  char *content = glob_sync(pattern, &status);
  if (status != OK) {
    if (content)
      free(content);
    return create_ffi_json_error("Glob failed", pattern, status);
  }
  return content;
}
char *webs_bundle(const char *input_dir, const char *output_dir) {
  if (!input_dir || !output_dir) {
    return create_json_error("Invalid Argument",
                             "Input and output directories cannot be null.");
  }
  char *error = NULL;
  Status status = webs_bundle_directory(input_dir, output_dir, &error);
  if (status != OK) {
    char *json_error =
        create_json_error(webs_status_to_string(status),
                          error ? error : "Unknown bundling error");
    free(error);
    return json_error;
  }
  return NULL;
}
Server *webs_server(const char *host, int port) {
  if (!host)
    return NULL;
  return server(host, port);
}
int webs_server_listen(Server *server, RequestHandler handler) {
  if (!server || !handler)
    return -1;
  return server->listen(server, handler);
}
void webs_server_stop(Server *server) {
  if (!server)
    return;
  server->stop(server);
}
void webs_server_destroy(Server *server) {
  if (!server)
    return;
  server_destroy(server);
}
int webs_static_server(const char *host, int port, const char *public_dir) {
  if (!host || !public_dir) {
    fprintf(stderr, "ERROR: Host and public_dir cannot be null.\n");
    return 1;
  }
  return webs_static_server_run(host, port, public_dir);
}
void webs_http_stream_begin(int client_fd, int status_code,
                            const char *content_type) {
  if (client_fd < 0 || !content_type)
    return;
  http_stream_begin(client_fd, status_code, content_type);
}
void webs_http_stream_write_chunk(int client_fd, const char *data, size_t len) {
  if (client_fd < 0 || !data)
    return;
  http_stream_write_chunk(client_fd, data, len);
}
void webs_http_stream_end(int client_fd) {
  if (client_fd < 0)
    return;
  http_stream_end(client_fd);
}
