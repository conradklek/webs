#ifndef JSON_H
#define JSON_H

#include "../core/error.h"
#include "../core/value.h"

Value *json_decode(const char *json_string, Status *status);

char *json_encode(const Value *value);

char *value_query(const Value *root, const char *path, Status *status);

#endif
