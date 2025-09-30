/**
 * @file webs.h
 * @brief Main public C API header for the Webs framework.
 */

#ifndef WEBS_H
#define WEBS_H

#include "core/array.h"
#include "core/boolean.h"
#include "core/console.h"
#include "core/error.h"
#include "core/fetch.h"
#include "core/json.h"
#include "core/memory.h"
#include "core/null.h"
#include "core/number.h"
#include "core/object.h"
#include "core/pointer.h"
#include "core/regex.h"
#include "core/string.h"
#include "core/string_builder.h"
#include "core/undefined.h"
#include "core/url.h"
#include "core/value.h"

#include "framework/asset.h"
#include "framework/bundler.h"
#include "framework/component.h"
#include "framework/engine.h"
#include "framework/evaluate.h"
#include "framework/expression.h"
#include "framework/patch.h"
#include "framework/reactivity.h"
#include "framework/renderer.h"
#include "framework/router.h"
#include "framework/scheduler.h"
#include "framework/ssr.h"
#include "framework/template.h"
#include "framework/vdom.h"
#include "framework/wson.h"

#include "modules/auth.h"
#include "modules/cookie.h"
#include "modules/db.h"
#include "modules/fs.h"
#include "modules/http.h"
#include "modules/http_stream.h"
#include "modules/repl.h"
#include "modules/server.h"

typedef void (*LifecycleHookFunc)(void);

// --- Core Value API ---
Value *webs_number(double n);
Value *webs_boolean(bool b);
Value *webs_null(void);
Value *webs_undefined(void);
Value *webs_pointer(void *p);
Value *webs_string(const char *s);
Value *webs_array(void);
Value *webs_object(void);

ValueType webs_value_get_type(const Value *v);
bool webs_value_as_bool(const Value *v);
double webs_value_as_number(const Value *v);
const char *webs_value_as_string(const Value *v);

Status webs_array_push(Value *array_val, Value *element);
size_t webs_array_count(const Value *array_val);
Value *webs_array_get_ref(const Value *array_val, size_t index);
Value *webs_array_get_clone(const Value *array_val, size_t index);

Status webs_object_set(Value *object_val, const char *key, Value *value);
Value *webs_object_get_ref(const Value *object_val, const char *key);
Value *webs_object_get_clone(const Value *object_val, const char *key);
Value *webs_object_keys(const Value *object_val);

// --- Core Utilities ---
char *webs_string_trim(const char *s);
char *webs_string_trim_start(const char *s);
char *webs_string_trim_end(const char *s);
char **webs_string_split(const char *str, const char *delimiter, int *count);
bool webs_string_starts_with(const char *str, const char *prefix);
int webs_string_index_of(const char *str, const char *substring);
char *webs_string_slice(const char *str, int start, int end);
char *webs_string_replace(const char *str, const char *search,
                          const char *replace);
int webs_string_compare(const char *s1, const char *s2);
Value *webs_regex_parse(const char *pattern, Status *status);

// --- Reactivity API ---
Value *webs_ref(Value *initial_value);
Value *webs_ref_get_value(Engine *engine, Value *ref_value);
void webs_ref_set_value(Engine *engine, Value *ref_value, Value *new_value);
Value *webs_reactive(Value *target);
Value *webs_reactive_get(Engine *engine, const Value *proxy, const char *key);
void webs_reactive_set(Engine *engine, Value *proxy, const char *key,
                       Value *value);
ReactiveEffect *webs_effect(EffectCallback fn, void *user_data);
void webs_effect_run(Engine *engine, ReactiveEffect *effect);
void webs_effect_stop(ReactiveEffect *effect);
void webs_effect_free(ReactiveEffect *effect);
void webs_scheduler_flush_jobs(Engine *engine);
char *webs_wson_encode(const Value *value);
Value *webs_wson_decode(Engine *engine, const char *wson_string, char **error);

// --- Module APIs ---
char *webs_query_json(const char *json_string, const char *path);
Value *webs_json_parse(const char *json_string, Status *status);
char *webs_json_encode(const Value *value);
char *webs_json_pretty_print(const Value *value);
char *webs_url_decode(const char *url_string);
char *webs_match_route(const char *pattern, const char *path);
char *webs_parse_http_request(const char *raw_request);
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
char *webs_fetch(const char *url, const char *options_json);

// --- Auth & Cookie API ---
char *webs_auth_hash_password(const char *password);
bool webs_auth_verify_password(const char *password, const char *hash);
char *webs_auth_create_session(Value *db_handle_val, const char *username);
Value *webs_auth_get_user_from_session(Value *db_handle_val,
                                       const char *session_id);
void webs_auth_delete_session(Value *db_handle_val, const char *session_id);
Value *webs_cookie_parse(const char *cookie_header);
char *webs_cookie_serialize(const char *name, const char *value,
                            Value *options);

// --- DB API ---
Value *webs_db_open(const char *filename);
Value *webs_db_close(Value *db_handle_val);
Value *webs_db_exec(Value *db_handle_val, const char *sql);
Value *webs_db_query(Value *db_handle_val, const char *sql);

// --- Framework & Tooling APIs ---
Status webs_bundle(const char *entry_file, const char *output_dir,
                   char **error_out);
char *webs_asset_walk(const char *file_path);
Engine *webs_engine_api();
void webs_engine_destroy_api(Engine *engine);
void webs_engine_register_component(Engine *engine, const char *name,
                                    Value *definition);
ComponentInstance *webs_create_instance(Engine *engine, VNode *vnode,
                                        ComponentInstance *parent);
void webs_destroy_instance(ComponentInstance *instance);
void webs_mount_component(ComponentInstance *instance);
void webs_unmount_component(ComponentInstance *instance);
void webs_on_mounted(Engine *engine, LifecycleHookFunc hook);
void webs_on_before_unmount(Engine *engine, LifecycleHookFunc hook);
void webs_provide(Engine *engine, const char *key, Value *value);
Value *webs_inject(Engine *engine, const char *key);
VNode *webs_h(const char *type, Value *props, Value *children);
void webs_free_vnode(VNode *vnode);
Value *webs_parse_template(const char *template_string, Status *status);
Value *webs_parse_expression(const char *expression_string, Status *status);
char *webs_render_to_string(Engine *engine, const char *component_name,
                            Value *props_and_initial_state);
char *webs_ssr(const char *template_string, const char *context_json);
char *webs_render_vdom(const char *template_string, const char *context_json);

// --- Server APIs ---
Server *webs_server(const char *host, int port);
int webs_server_listen(Server *server, RequestHandler handler);
void webs_server_stop(Server *server);
void webs_server_destroy(Server *server);
void webs_server_write_response(int client_fd, const char *response);
void webs_http_stream_begin(int client_fd, int status_code,
                            const char *content_type);
void webs_http_stream_write_chunk(int client_fd, const char *data, size_t len);
void webs_http_stream_end(int client_fd);
int webs_static_server(const char *host, int port, const char *public_dir);

// --- Router API (for testing and future C-native server setup) ---
Value *webs_router_create(void);
void webs_router_free(Value *router_ptr_val);
char *webs_test_run_router_logic(Value *router_ptr_val,
                                 const char *request_json);

// --- Memory Management ---
void webs_free_string(char *str);
void webs_free_value(Value *value);

// --- Configuration ---
void webs_set_log_level(int level);

#endif // WEBS_H
