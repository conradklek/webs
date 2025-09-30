#include "webs_api.h"
#include "core/console.h"
#include "core/error.h"
#include "core/json.h"
#include "core/map.h"
#include "core/string.h"
#include "core/string_builder.h"
#include "core/url.h"
#include "core/value.h"
#include "framework/asset.h"
#include "framework/bundler.h"
#include "framework/component.h"
#include "framework/expression.h"
#include "framework/patch.h"
#include "framework/router.h"
#include "framework/template.h"
#include "framework/vdom.h"
#include "framework/wson.h"
#include "modules/auth.h"
#include "modules/cookie.h"
#include "modules/db.h"
#include "modules/fs.h"
#include "modules/http.h"
#include "modules/path.h"
#include "modules/server.h"
#include "webs.h"
#include <errno.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

// --- Helper Functions ---
static void set_error_msg(char **error, const char *format, ...) {
  if (error && !*error) {
    va_list args;
    va_start(args, format);
    vasprintf(error, format, args);
    va_end(args);
  }
}

static Value *webs_object_of(const char *key, ...) {
  Value *obj = webs_object();
  if (!key)
    return obj;
  va_list args;
  va_start(args, key);
  const char *current_key = key;
  while (current_key != NULL) {
    Value *val = va_arg(args, Value *);
    webs_object_set(obj, current_key, val);
    current_key = va_arg(args, const char *);
  }
  va_end(args);
  return obj;
}

static Value *webs_array_of(int count, ...) {
  Value *arr = webs_array();
  va_list args;
  va_start(args, count);
  for (int i = 0; i < count; i++) {
    Value *val = va_arg(args, Value *);
    webs_array_push(arr, val);
  }
  va_end(args);
  return arr;
}

// --- API Implementation Wrappers ---
static void api_log_info(const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_INFO, format, args);
  va_end(args);
}
static void api_log_warn(const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_WARN, format, args);
  va_end(args);
}
static void api_log_error(const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_ERROR, format, args);
  va_end(args);
}
static void api_log_debug(const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_DEBUG, format, args);
  va_end(args);
}

static Status api_fs_readFile(const char *path, char **out_content,
                              char **out_error) {
  Status status = read_file_sync(path, out_content);
  if (status != OK) {
    set_error_msg(out_error, "Could not read file '%s': %s", path,
                  strerror(errno));
  }
  return status;
}

static Status api_fs_writeFile(const char *path, const char *content,
                               char **out_error) {
  Status status = write_file_sync(path, content);
  if (status != OK) {
    set_error_msg(out_error, "Could not write to file '%s': %s", path,
                  strerror(errno));
  }
  return status;
}

static Status api_fs_deleteFile(const char *path, char **out_error) {
  Status status = delete_file_sync(path);
  if (status != OK) {
    set_error_msg(out_error, "Could not delete file '%s': %s", path,
                  strerror(errno));
  }
  return status;
}

static Status api_fs_createDir(const char *path, char **out_error) {
  Status status = create_dir_sync(path);
  if (status != OK) {
    set_error_msg(out_error, "Could not create directory '%s': %s", path,
                  strerror(errno));
  }
  return status;
}

static Status api_fs_deleteDir(const char *path, char **out_error) {
  Status status = delete_dir_sync(path);
  if (status != OK) {
    set_error_msg(out_error, "Could not delete directory '%s': %s", path,
                  strerror(errno));
  }
  return status;
}

static Status api_fs_listDir(const char *path, char **out_json_array,
                             char **out_error) {
  Status status;
  *out_json_array = list_dir_sync(path, &status);
  if (status != OK) {
    set_error_msg(out_error, "Could not list directory '%s': %s", path,
                  strerror(errno));
  }
  return status;
}

static Status api_fs_rename(const char *old_path, const char *new_path,
                            char **out_error) {
  Status status = rename_sync(old_path, new_path);
  if (status != OK) {
    set_error_msg(out_error, "Could not rename from '%s' to '%s': %s", old_path,
                  new_path, strerror(errno));
  }
  return status;
}

static Status api_fs_stat(const char *path, char **out_json_object,
                          char **out_error) {
  Status status;
  *out_json_object = stat_sync(path, &status);
  if (status != OK) {
    set_error_msg(out_error, "Could not stat path '%s': %s", path,
                  strerror(errno));
  }
  return status;
}

static Status api_fs_glob(const char *pattern, char **out_json_array,
                          char **out_error) {
  Status status;
  *out_json_array = glob_sync(pattern, &status);
  if (status != OK) {
    set_error_msg(out_error, "Glob failed for pattern '%s': %s", pattern,
                  strerror(errno));
  }
  return status;
}

static Status api_db_open(const char *filename, Value **out_db_handle,
                          char **out_error) {
  *out_db_handle = db_open(filename);
  if (!*out_db_handle) {
    set_error_msg(out_error, "Failed to open database: %s", filename);
    return ERROR_IO;
  }
  return OK;
}

static Status api_db_close(Value *db_handle_val, char **out_error) {
  Value *result = db_close(db_handle_val);
  if (W->valueGetType(result) == VALUE_STRING) {
    set_error_msg(out_error, "%s", W->valueAsString(result));
    W->freeValue(result);
    return ERROR_INVALID_STATE;
  }
  W->freeValue(result);
  return OK;
}

static Status api_db_exec(Value *db_handle_val, const char *sql,
                          char **out_error) {
  Value *result = db_exec(db_handle_val, sql);
  if (W->valueGetType(result) == VALUE_STRING) {
    set_error_msg(out_error, "%s", W->valueAsString(result));
    W->freeValue(result);
    return ERROR_INVALID_ARG;
  }
  W->freeValue(result);
  return OK;
}

static Status api_db_query(Value *db_handle_val, const char *sql,
                           Value **out_results_array, char **out_error) {
  Value *result = db_query(db_handle_val, sql);
  if (W->valueGetType(result) == VALUE_STRING) {
    set_error_msg(out_error, "%s", W->valueAsString(result));
    W->freeValue(result);
    *out_results_array = NULL;
    return ERROR_INVALID_ARG;
  }
  *out_results_array = result;
  return OK;
}

static Status api_json_parse(const char *json_string, Value **out_value,
                             char **out_error) {
  Status status;
  *out_value = json_decode(json_string, &status);
  if (status != OK) {
    set_error_msg(out_error, "JSON parsing error: %s",
                  webs_status_to_string(status));
  }
  return status;
}

static Status api_json_query(const char *json_string, const char *path,
                             Value **out_value, char **out_error) {
  Status status;
  Value *root = json_decode(json_string, &status);
  if (status != OK) {
    set_error_msg(out_error, "Failed to parse JSON for query.");
    return status;
  }
  *out_value = value_query(root, path, &status);
  W->freeValue(root);
  if (status != OK) {
    set_error_msg(out_error, "Failed to query path '%s'.", path);
  }
  return status;
}

static Status api_url_decode(const char *url_string, Value **out_value,
                             char **out_error) {
  Status status;
  *out_value = url_decode(url_string, &status);
  if (status != OK) {
    set_error_msg(out_error, "Failed to decode URL string.");
  }
  return status;
}

static Status api_url_matchRoute(const char *pattern, const char *path,
                                 Value **out_params, char **out_error) {
  Status status;
  *out_params = url_match_route(pattern, path, &status);
  if (status != OK) {
    set_error_msg(out_error, "Error during route matching.");
  }
  return status;
}

static Status api_http_parseRequest(const char *raw_request, Value **out_value,
                                    char **out_error) {
  *out_value = webs_http_parse_request(raw_request, out_error);
  return (*out_error == NULL) ? OK : ERROR_PARSE;
}

static Status api_http_fetch(const char *url, const char *options_json,
                             char **out_json_response, char **out_error) {
  *out_json_response = webs_fetch_sync(url, options_json, out_error);
  return (*out_error == NULL) ? OK : ERROR_IO;
}

static Status api_asset_walk(const char *file_path, char **out_json,
                             char **out_error) {
  *out_json = walk_asset(file_path, out_error);
  return (*out_error == NULL) ? OK : ERROR_IO;
}

static Status api_auth_createSession(Value *db_handle_val, const char *username,
                                     char **out_session_id, char **out_error) {
  *out_session_id = auth_create_session(db_handle_val, username);
  if (!*out_session_id) {
    set_error_msg(out_error, "Failed to create session for user '%s'",
                  username);
    return ERROR;
  }
  return OK;
}

static Status api_auth_getUserFromSession(Value *db_handle_val,
                                          const char *session_id,
                                          Value **out_user, char **out_error) {
  *out_user = auth_get_user_from_session(db_handle_val, session_id);
  return OK;
}

static Status api_auth_deleteSession(Value *db_handle_val,
                                     const char *session_id, char **out_error) {
  auth_delete_session(db_handle_val, session_id);
  return OK;
}

static void api_provide(Engine *engine, const char *key, Value *value) {
  if (!engine || !engine->current_instance || !key || !value) {
    if (value)
      W->freeValue(value);
    return;
  }
  W->objectSet(engine->current_instance->provides, key, value);
}

static Value *api_inject(Engine *engine, const char *key) {
  if (!engine || !engine->current_instance || !key)
    return NULL;

  ComponentInstance *current = engine->current_instance->parent;
  while (current) {
    Value *provided_value = W->objectGetRef(current->provides, key);
    if (provided_value) {
      return W->valueClone(provided_value);
    }
    current = current->parent;
  }
  return NULL;
}

static void api_on_mounted(Engine *engine, LifecycleHookFunc hook) {
  if (!engine || !engine->current_instance || !hook)
    return;
  W->arrayPush(engine->current_instance->on_mount_hooks,
               W->pointer((void *)hook));
}

static void api_on_before_unmount(Engine *engine, LifecycleHookFunc hook) {
  if (!engine || !engine->current_instance || !hook)
    return;
  W->arrayPush(engine->current_instance->on_unmount_hooks,
               W->pointer((void *)hook));
}

// --- API Struct Initializers ---
static const WebsConsoleApi g_webs_console_api = {.info = api_log_info,
                                                  .warn = api_log_warn,
                                                  .error = api_log_error,
                                                  .debug = api_log_debug};
static const WebsFsApi g_webs_fs_api = {
    .readFile = api_fs_readFile,
    .writeFile = api_fs_writeFile,
    .exists = file_exists_sync,
    .deleteFile = api_fs_deleteFile,
    .createDir = api_fs_createDir,
    .deleteDir = api_fs_deleteDir,
    .listDir = api_fs_listDir,
    .rename = api_fs_rename,
    .stat = api_fs_stat,
    .glob = api_fs_glob,
};
static const WebsDbApi g_webs_db_api = {.open = api_db_open,
                                        .close = api_db_close,
                                        .exec = api_db_exec,
                                        .query = api_db_query};
static const WebsJsonApi g_webs_json_api = {.parse = api_json_parse,
                                            .encode = json_encode,
                                            .query = api_json_query,
                                            .prettyPrint = json_pretty_print};

static const WebsUrlApi g_webs_url_api = {.decode = api_url_decode,
                                          .matchRoute = api_url_matchRoute};
static const WebsHttpApi g_webs_http_api = {
    .parseRequest = api_http_parseRequest, .fetch = api_http_fetch};
static const WebsServerApi g_webs_server_api = {
    .start = server,
    .listen = NULL,
    .stop = NULL,
    .destroy = server_destroy,
    .writeResponse = server_write_response,
    .serveStatic = static_server_run,
    .streamBegin = http_stream_begin,
    .streamWrite = http_stream_write_chunk,
    .streamEnd = http_stream_end};
static const WebsAssetApi g_webs_asset_api = {.walk = api_asset_walk};
static const WebsRouterApi g_webs_router_api = {
    .create = router_create,
    .free = router_free,
    .addRoute = router_add_route,
    .addRouteWithMiddleware = router_add_route_with_middleware,
    .handleRequest = router_handle_request};
static const WebsAuthApi g_webs_auth_api = {
    .hashPassword = auth_hash_password,
    .verifyPassword = auth_verify_password,
    .createSession = api_auth_createSession,
    .getUserFromSession = api_auth_getUserFromSession,
    .deleteSession = api_auth_deleteSession,
};
static const WebsCookieApi g_webs_cookie_api = {.parse = cookie_parse,
                                                .serialize = cookie_serialize};
static const WebsPathApi g_webs_path_api = {.resolve = path_resolve,
                                            .dirname = path_dirname};
static const WebsStringBuilderApi g_webs_string_builder_api = {
    .init = sb_init,
    .appendStr = sb_append_str,
    .appendChar = sb_append_char,
    .appendHtmlEscaped = sb_append_html_escaped,
    .toString = sb_to_string,
    .free = sb_free};

static const WebsApi g_webs_api = {
    .string = webs_string,
    .number = webs_number,
    .boolean = webs_boolean,
    .object = webs_object,
    .array = webs_array,
    .null = webs_null,
    .undefined = webs_undefined,
    .pointer = webs_pointer,
    .objectOf = webs_object_of,
    .arrayOf = webs_array_of,
    .valueGetType = webs_value_get_type,
    .valueAsBool = webs_value_as_bool,
    .valueAsNumber = webs_value_as_number,
    .valueAsString = webs_value_as_string,
    .valueEquals = value_equals,
    .valueCompare = value_compare,
    .valueClone = value_clone,
    .stringTrim = webs_string_trim,
    .stringTrimStart = webs_string_trim_start,
    .stringTrimEnd = webs_string_trim_end,
    .stringSplit = webs_string_split,
    .stringStartsWith = webs_string_starts_with,
    .stringIndexOf = webs_string_index_of,
    .stringSlice = webs_string_slice,
    .stringReplace = webs_string_replace,
    .stringCompare = webs_string_compare,
    .arrayPush = webs_array_push,
    .arrayCount = webs_array_count,
    .arrayGetRef = webs_array_get_ref,
    .arrayGetClone = webs_array_get_clone,
    .objectSet = webs_object_set,
    .objectGetRef = webs_object_get_ref,
    .objectGetClone = webs_object_get_clone,
    .objectKeys = webs_object_keys,
    .provide = api_provide,
    .inject = api_inject,
    .createInstance = webs_create_instance,
    .destroyInstance = webs_destroy_instance,
    .onMounted = api_on_mounted,
    .onBeforeUnmount = api_on_before_unmount,
    .h = h,
    .diff = webs_diff,
    .vnodeToValue = vnode_to_value,
    .ssr = webs_ssr,
    .renderToString = webs_render_to_string,
    .bundle = webs_bundle_from_entry,
    .parseTemplate = webs_template_parse,
    .parseExpression = parse_expression,
    .regexParse = regex_parse,
    .wsonEncode = wson_encode,
    .wsonDecode = wson_decode,
    .createEngine = webs_engine_api,
    .destroyEngine = webs_engine_destroy_api,
    .registerComponent = webs_engine_register_component,
    .freeString = webs_free_string,
    .freeStringArray = free_string_array,
    .freeValue = value_free,
    .freeVNode = vnode_free,
    .statusToString = webs_status_to_string,
    .fs = &g_webs_fs_api,
    .db = &g_webs_db_api,
    .json = &g_webs_json_api,
    .url = &g_webs_url_api,
    .http = &g_webs_http_api,
    .server = &g_webs_server_api,
    .asset = &g_webs_asset_api,
    .log = &g_webs_console_api,
    .router = &g_webs_router_api,
    .auth = &g_webs_auth_api,
    .cookie = &g_webs_cookie_api,
    .path = &g_webs_path_api,
    .stringBuilder = &g_webs_string_builder_api,
};

const WebsApi *webs() { return &g_webs_api; }
