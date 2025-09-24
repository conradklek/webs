#ifndef WEBS_API_H
#define WEBS_API_H

typedef struct WebsValue WebsValue;

const char *webs_query_json(const char *json_string, const char *path);

void webs_free_string(char *str);

WebsValue *webs_parse_json(const char *json_string);

char *webs_json_encode(const WebsValue *value);

void webs_free_value(WebsValue *value);

#endif
