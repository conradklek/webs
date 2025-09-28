#include "webs_api.h"
#include "webs.h"

// We include the full definitions here, where the implementation lives
#include "core/array.h"
#include "core/boolean.h"
#include "core/console.h"
#include "core/null.h"
#include "core/number.h"
#include "core/object.h"
#include "core/pointer.h"
#include "core/string.h"
#include "core/value.h"

#include "framework/expression.h"
#include "framework/patch.h"
#include "framework/template.h"
#include "framework/vdom.h"

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

static const WebsConsoleApi g_webs_console_api = {
    .info = api_log_info,
    .warn = api_log_warn,
    .error = api_log_error,
    .debug = api_log_debug,
};

static const WebsFsApi g_webs_fs_api = {.readFile = webs_read_file,
                                        .writeFile = webs_write_file,
                                        .exists = webs_file_exists,
                                        .deleteFile = webs_delete_file,
                                        .createDir = webs_dir,
                                        .deleteDir = webs_delete_dir,
                                        .listDir = webs_list_dir,
                                        .rename = webs_rename_path,
                                        .stat = webs_stat_path,
                                        .glob = webs_glob};

static const WebsDbApi g_webs_db_api = {.open = webs_db_open,
                                        .close = webs_db_close,
                                        .exec = webs_db_exec,
                                        .query = webs_db_query};

static const WebsJsonApi g_webs_json_api = {.parse = webs_json_parse,
                                            .encode = webs_json_encode,
                                            .query = webs_query_json,
                                            .prettyPrint =
                                                webs_json_pretty_print};

static const WebsUrlApi g_webs_url_api = {.decode = webs_url_decode,
                                          .matchRoute = webs_match_route};

static const WebsHttpApi g_webs_http_api = {
    .parseRequest = webs_parse_http_request, .fetch = webs_fetch};

static const WebsServerApi g_webs_server_api = {
    .start = webs_server,
    .listen = webs_server_listen,
    .stop = webs_server_stop,
    .destroy = webs_server_destroy,
    .writeResponse = webs_server_write_response,
    .serveStatic = webs_static_server,
    .streamBegin = webs_http_stream_begin,
    .streamWrite = webs_http_stream_write_chunk,
    .streamEnd = webs_http_stream_end};

static const WebsApi g_webs_api = {
    .string = webs_string,
    .number = webs_number,
    .boolean = webs_boolean,
    .object = webs_object,
    .array = webs_array,
    .null = webs_null,
    .pointer = webs_pointer,

    .valueGetType = webs_value_get_type,
    .valueAsBool = webs_value_as_bool,
    .valueAsNumber = webs_value_as_number,
    .valueAsString = webs_value_as_string,
    .valueEquals = value_equals,
    .stringTrim = webs_string_trim,

    .arrayPush = webs_array_push,
    .arrayCount = webs_array_count,
    .arrayGet = webs_array_get,

    .objectSet = webs_object_set,
    .objectGet = webs_object_get,
    .objectKeys = webs_object_keys,

    .h = h,
    .diff = webs_diff,
    .vnodeToValue = vnode_to_value,
    .bundle = webs_bundle,
    .parseTemplate = webs_template_parse,
    .parseExpression = parse_expression,
    .ssr = webs_ssr,
    .createEngine = webs_engine_api,
    .destroyEngine = webs_engine_destroy_api,

    .freeString = webs_free_string,
    .freeValue = value_free,
    .freeVNode = vnode_free,
    .valueClone = value_clone,

    .fs = &g_webs_fs_api,
    .db = &g_webs_db_api,
    .json = &g_webs_json_api,
    .url = &g_webs_url_api,
    .http = &g_webs_http_api,
    .server = &g_webs_server_api,
    .log = &g_webs_console_api,
};

const WebsApi *webs() { return &g_webs_api; }
