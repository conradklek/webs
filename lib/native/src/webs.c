#include "webs.h"
#include <ctype.h>
#include <errno.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// --- FFI Helper Functions ---
static char *create_json_error(const char *error_type, const char *message) {
  Value *err_obj = object_value();
  if (!err_obj)
    return strdup("{\"error\":\"FATAL\", \"message\":\"Memory allocation "
                  "failed while creating error.\"}");

  err_obj->as.object_val->set(err_obj->as.object_val, "error",
                              string_value(error_type));
  err_obj->as.object_val->set(err_obj->as.object_val, "message",
                              string_value(message));

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

// --- VDOM & Rendering Wrappers ---
VNode *webs_h(const char *type, Value *props, Value *children) {
  return h(type, props, children);
}

void webs_free_vnode(VNode *vnode) { vnode_free(vnode); }

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
    context = webs_parse_json(context_json, &status);
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
  Value *comp_def = engine->components->get(engine->components, component_name);
  if (!comp_def) {
    return strdup("<!-- Component not found -->");
  }

  Object *def_obj = comp_def->as.object_val;
  Value *template_val = def_obj->get(def_obj, "template");
  if (!template_val || template_val->type != VALUE_STRING) {
    return strdup("<!-- Component has no template -->");
  }
  const char *template_str = template_val->as.string_val->chars;

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

// --- Core Value Constructors & Manipulators ---
Value *webs_number(double n) { return number(n); }
Value *webs_boolean(bool b) { return boolean(b); }
Value *webs_null(void) { return null(); }
Value *webs_undefined(void) { return undefined(); }
Value *webs_pointer(void *p) { return pointer(p); }
Value *webs_string(const char *s) { return string_value(s); }
Value *webs_array(void) { return array_value(); }
Status webs_array_push(Value *array_val, Value *element) {
  if (!array_val || array_val->type != VALUE_ARRAY)
    return ERROR_INVALID_ARG;
  return array_val->as.array_val->push(array_val->as.array_val, element);
}
Value *webs_object(void) { return object_value(); }
Status webs_object_set(Value *object_val, const char *key, Value *value) {
  if (!object_val || object_val->type != VALUE_OBJECT)
    return ERROR_INVALID_ARG;
  return object_val->as.object_val->set(object_val->as.object_val, key, value);
}

char *webs_string_trim_start(const char *s) {
  if (!s)
    return NULL;
  const char *start = s;
  while (*start && isspace((unsigned char)*start)) {
    start++;
  }
  return strdup(start);
}

char *webs_string_trim_end(const char *s) {
  if (!s)
    return NULL;
  char *s_copy = strdup(s);
  if (!s_copy)
    return NULL;
  char *end = s_copy + strlen(s_copy) - 1;
  while (end >= s_copy && isspace((unsigned char)*end)) {
    end--;
  }
  *(end + 1) = '\0';
  return s_copy;
}

char *webs_string_trim(const char *s) {
  if (!s)
    return NULL;
  const char *start = s;
  while (*start && isspace((unsigned char)*start)) {
    start++;
  }
  char *new_str = strdup(start);
  if (!new_str)
    return NULL;
  char *end = new_str + strlen(new_str) - 1;
  while (end >= new_str && isspace((unsigned char)*end)) {
    end--;
  }
  *(end + 1) = '\0';
  return new_str;
}

Value *webs_regex_parse(const char *pattern) { return regex_parse(pattern); }

// --- DOM API ---
DomNode *webs_dom_create_element(const char *tag_name) {
  return dom_create_element(tag_name);
}
void webs_dom_free_node(DomNode *node) { dom_free_node(node); }
void webs_dom_append_child(DomNode *parent, DomNode *child) {
  dom_append_child(parent, child);
}
void webs_dom_set_attribute(DomNode *node, const char *key, Value *value) {
  dom_set_attribute(node, key, value);
}
void webs_dom_add_event_listener(DomNode *node, const char *event_type,
                                 Value *listener) {
  dom_add_event_listener(node, event_type, listener);
}
void webs_event_dispatch_click(DomNode *node) {
  Event event = {.type = "click", .target = node, .detail = NULL};
  event_dispatch(&event);
}

// --- Scheduler API ---
void webs_scheduler_flush_jobs(Engine *engine) {
  scheduler_flush_jobs(engine, engine->scheduler);
}

// --- Engine and Component Management ---
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
  if (instance->on_mount && instance->on_mount->type == VALUE_POINTER) {
    EffectCallback fn = (EffectCallback)instance->on_mount->as.pointer_val;
    if (fn) {
      fn(instance); // Pass instance for context, if needed
    }
  }
  instance->is_mounted = true;
}

void webs_unmount_component(ComponentInstance *instance) {
  if (!instance || !instance->is_mounted)
    return;
  if (instance->on_before_unmount &&
      instance->on_before_unmount->type == VALUE_POINTER) {
    EffectCallback fn =
        (EffectCallback)instance->on_before_unmount->as.pointer_val;
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

// --- Utility and Module APIs ---
char *webs_query_json(const char *json_string, const char *path) {
  Status status;
  Value *root = json_decode(json_string, &status);
  if (status != OK) {
    if (root)
      value_free(root);
    char message[256];
    snprintf(message, sizeof(message),
             "Failed to parse JSON for query. Status: %s",
             webs_status_to_string(status));
    return create_json_error("JSONParseError", message);
  }

  char *result_str = value_query(root, path, &status);
  value_free(root);

  if (status != OK) {
    if (result_str)
      free(result_str);
    char message[256];
    snprintf(message, sizeof(message), "Failed to query path '%s'. Status: %s",
             path, webs_status_to_string(status));
    return create_json_error("JSONQueryError", message);
  }
  return result_str;
}

Value *webs_parse_json(const char *json_string, Status *status) {
  Value *value = json_decode(json_string, status);
  if (*status != OK) {
    if (value)
      value_free(value);
    return NULL;
  }
  return value;
}

char *webs_json_encode(const Value *value) { return json_encode(value); }

char *webs_url_decode(const char *url_string) {
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
  Status status;
  Value *request_obj = webs_http_parse_request(raw_request, &status);

  if (status != OK) {
    if (request_obj)
      value_free(request_obj);
    char message[256];
    snprintf(message, sizeof(message),
             "Failed to parse HTTP request. Status: %s",
             webs_status_to_string(status));
    return create_json_error("HTTPRequestParseError", message);
  }

  char *json_string = json_encode(request_obj);
  value_free(request_obj);
  return json_string;
}

char *webs_fetch(const char *url, const char *options_json) {
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

void webs_free_value(Value *value) { value_free(value); }

Value *webs_parse_template(const char *template_string) {
  return webs_template_parse(template_string);
}

Value *webs_parse_expression(const char *expression_string) {
  return parse_expression(expression_string);
}

// --- Filesystem ---
char *webs_read_file(const char *path) {
  Status status;
  char *content = read_file_sync(path, &status);
  return (status != OK)
             ? create_ffi_json_error("Could not read file", path, status)
             : content;
}

char *webs_write_file(const char *path, const char *content) {
  Status status = write_file_sync(path, content);
  return (status != OK)
             ? create_ffi_json_error("Could not write to file", path, status)
             : NULL;
}

bool webs_file_exists(const char *path) { return file_exists_sync(path); }

char *webs_delete_file(const char *path) {
  Status status = delete_file_sync(path);
  return (status != OK)
             ? create_ffi_json_error("Could not delete file", path, status)
             : NULL;
}

char *webs_dir(const char *path) {
  Status status = create_dir_sync(path);
  return (status != OK)
             ? create_ffi_json_error("Could not create directory", path, status)
             : NULL;
}

char *webs_delete_dir(const char *path) {
  Status status = delete_dir_sync(path);
  return (status != OK)
             ? create_ffi_json_error("Could not delete directory", path, status)
             : NULL;
}

char *webs_list_dir(const char *path) {
  Status status;
  char *content = list_dir_sync(path, &status);
  return (status != OK)
             ? create_ffi_json_error("Could not list directory", path, status)
             : content;
}

char *webs_rename_path(const char *old_path, const char *new_path) {
  Status status = rename_sync(old_path, new_path);
  return (status != OK)
             ? create_ffi_json_error("Could not rename path", old_path, status)
             : NULL;
}

char *webs_stat_path(const char *path) {
  Status status;
  char *content = stat_sync(path, &status);
  return (status != OK)
             ? create_ffi_json_error("Could not stat path", path, status)
             : content;
}

char *webs_glob(const char *pattern) {
  Status status;
  char *content = glob_sync(pattern, &status);
  if (status != OK) {
    if (content)
      free(content);
    return create_ffi_json_error("Glob failed", pattern, status);
  }
  return content;
}

// --- Server ---
Server *webs_server(const char *host, int port) { return server(host, port); }
int webs_server_listen(Server *server, RequestHandler handler) {
  return server->listen(server, handler);
}
void webs_server_stop(Server *server) { server->stop(server); }
void webs_server_destroy(Server *server) { server_destroy(server); }
