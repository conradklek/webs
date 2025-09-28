#ifndef JSON_H
#define JSON_H

#include "error.h"
#include "value.h"

Value *json_decode(const char *json_string, Status *status);

char *json_encode(const Value *value);

Value *value_query(const Value *root, const char *path, Status *status);

char *json_pretty_print(const Value *value);

#endif
