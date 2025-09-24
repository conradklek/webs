#ifndef WEBS_CODEC_JSON_H
#define WEBS_CODEC_JSON_H

#include "../core/webs_value.h"

WebsValue *webs_json_decode(const char *json_string, char **error);

char *webs_json_encode(const WebsValue *value);

#endif
