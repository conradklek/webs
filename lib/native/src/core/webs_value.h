#ifndef WEBS_VALUE_H
#define WEBS_VALUE_H

#include <stdbool.h>
#include <stddef.h>

typedef struct WebsHashTable WebsHashTable;

typedef enum {
  WEBS_VALUE_OBJECT,
  WEBS_VALUE_ARRAY,
  WEBS_VALUE_STRING,
  WEBS_VALUE_NUMBER,
  WEBS_VALUE_BOOL,
  WEBS_VALUE_NULL
} WebsValueType;

typedef struct WebsValue WebsValue;

typedef struct {
  WebsHashTable *table;
} WebsObject;

typedef struct {
  WebsValue **elements;
  size_t count;
  size_t capacity;
} WebsArray;

struct WebsValue {
  WebsValueType type;
  union {
    WebsObject object_val;
    WebsArray array_val;
    char *string_val;
    double number_val;
    bool bool_val;
  } value;
};

typedef struct {
  char *result;
  char *error;
} WebsResult;

void webs_value_free(WebsValue *value);
WebsResult webs_value_query(WebsValue *root, const char *path);

#endif
