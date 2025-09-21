#include <node/node_api.h>
#include <stdlib.h>
#include <string.h>

#define WEBS_JSON_IMPL
#include "./webs_json.h"

napi_value webs_json_parse(napi_env env, const char* json_string) {
    webs_json_Reader reader = webs_json_reader((char*)json_string, strlen(json_string));
    webs_json_Value root_object = webs_json_read(&reader);

    if (root_object.type != WEBS_JSON_OBJECT) {
        napi_throw_error(env, NULL, "Expected the root of the JSON to be an object.");
        return NULL;
    }

    napi_value result_js_object;
    napi_create_object(env, &result_js_object);

    webs_json_Value current_key, current_value;
    while (webs_json_iter_object(&reader, root_object, &current_key, &current_value)) {
        if (current_value.type == WEBS_JSON_NUMBER) {
            int int_val = atoi(current_value.start);
            napi_value js_num;
            napi_create_int32(env, int_val, &js_num);
            napi_set_named_property(env, result_js_object, current_key.start, js_num);

        } else if (current_value.type == WEBS_JSON_STRING) {
            napi_value js_str;
            size_t str_length = current_value.end - current_value.start;
            napi_create_string_utf8(env, current_value.start, str_length, &js_str);
            napi_set_named_property(env, result_js_object, current_key.start, js_str);
        }
    }

    if (reader.error) {
        napi_throw_error(env, NULL, reader.error);
        return NULL;
    }

    return result_js_object;
}

