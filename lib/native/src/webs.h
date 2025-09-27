#ifndef WEBS_H
#define WEBS_H

// --- Core ---
#include "core/array.h"
#include "core/boolean.h"
#include "core/console.h"
#include "core/dom.h"
#include "core/error.h"
#include "core/event.h"
#include "core/memory.h"
#include "core/null.h"
#include "core/number.h"
#include "core/object.h"
#include "core/pointer.h"
#include "core/regex.h"
#include "core/string.h"
#include "core/string_builder.h"
#include "core/undefined.h"
#include "core/value.h"

// --- Framework ---
#include "framework/component.h"
#include "framework/engine.h"
#include "framework/evaluate.h"
#include "framework/expression.h"
#include "framework/patch.h"
#include "framework/reactivity.h"
#include "framework/renderer.h"
#include "framework/scheduler.h"
#include "framework/ssr.h"
#include "framework/template.h"
#include "framework/vdom.h"

// --- Modules ---
#include "modules/fetch.h"
#include "modules/fs.h"
#include "modules/http.h"
#include "modules/json.h"
#include "modules/server.h"
#include "modules/url.h"
#include "modules/wson.h"

// --- Public API ---

// --- Core Value Constructors & Manipulators ---
Value *webs_number(double n);
Value *webs_boolean(bool b);
Value *webs_null(void);
Value *webs_undefined(void);
Value *webs_pointer(void *p);
Value *webs_string(const char *s);
char *webs_string_trim_start(const char *s);
char *webs_string_trim_end(const char *s);
char *webs_string_trim(const char *s);
Value *webs_array(void);
Status webs_array_push(Value *array_val, Value *element);
Value *webs_object(void);
Status webs_object_set(Value *object_val, const char *key, Value *value);
Value *webs_regex_parse(const char *pattern);

// --- DOM API ---
DomNode *webs_dom_create_element(const char *tag_name);
void webs_dom_free_node(DomNode *node);
void webs_dom_append_child(DomNode *parent, DomNode *child);
void webs_dom_set_attribute(DomNode *node, const char *key, Value *value);
void webs_dom_add_event_listener(DomNode *node, const char *event_type,
                                 Value *listener);
void webs_event_dispatch_click(DomNode *node);

// --- Reactivity API ---
Value *ref(Value *initial_value);
Value *ref_get_value(Engine *engine, Value *ref_value);
void ref_set_value(Engine *engine, Value *ref_value, Value *new_value);
Value *reactive(Value *target);
Value *reactive_get(Engine *engine, const Value *proxy, const char *key);
void reactive_set(Engine *engine, Value *proxy, const char *key, Value *value);
ReactiveEffect *effect(EffectCallback fn, void *user_data);
void effect_run(Engine *engine, ReactiveEffect *effect);
void effect_free(ReactiveEffect *effect);

// --- Scheduler API ---
void webs_scheduler_flush_jobs(Engine *engine);

// --- WSON API ---
char *webs_wson_encode(const Value *value);
Value *webs_wson_decode(Engine *engine, const char *wson_string, char **error);

// JSON and WSON
char *webs_query_json(const char *json_string, const char *path);
Value *webs_parse_json(const char *json_string, Status *status);
char *webs_json_encode(const Value *value);

// Utilities
char *webs_url_decode(const char *url_string);
char *webs_match_route(const char *pattern, const char *path);
char *webs_parse_http_request(const char *raw_request);
void webs_free_string(char *str);
void webs_free_value(Value *value);
Value *webs_parse_template(const char *template_string);
Value *webs_parse_expression(const char *expression_string);

// Filesystem
char *webs_read_file(const char *path);
char *webs_write_file(const char *path, const char *content);
bool webs_file_exists(const char *path);
char *webs_delete_file(const char *path);
char *webs_dir(const char *path);
char *webs_delete_dir(const char *path);
char *webs_list_dir(const char *path);
char *webs_rename_path(const char *old_path, const char *new_path);
char *webs_stat_path(const char *path);
char *webs_glob(const char *pattern);

// Engine
Engine *webs_engine_api();
void webs_engine_destroy_api(Engine *engine);
void webs_engine_register_component(Engine *engine, const char *name,
                                    Value *definition);
ComponentInstance *webs_create_instance(Engine *engine, VNode *vnode,
                                        ComponentInstance *parent);
void webs_destroy_instance(ComponentInstance *instance);
void webs_mount_component(ComponentInstance *instance);
void webs_unmount_component(ComponentInstance *instance);

// VDOM & Rendering
VNode *webs_h(const char *type, Value *props, Value *children);
void webs_free_vnode(VNode *vnode);
char *webs_render_to_string(Engine *engine, const char *component_name,
                            Value *props);
char *webs_ssr(const char *template_string, const char *context_json);
char *webs_render_vdom(const char *template_string, const char *context_json);

// Server
Server *webs_server(const char *host, int port);
int webs_server_listen(Server *server, RequestHandler handler);
void webs_server_stop(Server *server);
void webs_server_destroy(Server *server);

// Networking
char *webs_fetch(const char *url, const char *options_json);

// Logging
void webs_set_log_level(int level);

#endif
