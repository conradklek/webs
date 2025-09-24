#include "webs_api.h"
#include "../codecs/webs_codec_json.h"
#include "../core/webs_value.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const char *webs_query_json(const char *json_string, const char *path) {
  char *parse_error = NULL;
  WebsValue *root = webs_json_decode(json_string, &parse_error);

  if (!root) {
    return parse_error ? parse_error
                       : strdup("Error: An unknown parsing error occurred.");
  }

  WebsResult query_result = webs_value_query(root, path);
  webs_value_free(root);

  if (query_result.error) {
    free(query_result.result);
    return query_result.error;
  }

  return query_result.result;
}

void webs_free_string(char *str) {
  if (str) {
    free(str);
  }
}

WebsValue *webs_parse_json(const char *json_string) {
  char *parse_error = NULL;
  WebsValue *value = webs_json_decode(json_string, &parse_error);

  if (parse_error) {
    free(parse_error);
    if (value) {
      webs_value_free(value);
    }
    return NULL;
  }
  return value;
}

void webs_free_value(WebsValue *value) { webs_value_free(value); }

char *webs_query_value(const WebsValue *value, const char *path) {
  if (!value) {
    return strdup("Error: Cannot query a null value.");
  }
  WebsResult query_result = webs_value_query((WebsValue *)value, path);
  if (query_result.error) {
    free(query_result.result);
    return query_result.error;
  }
  return query_result.result;
}
