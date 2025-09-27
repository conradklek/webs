#ifndef WSON_H
#define WSON_H

#include "../core/value.h"
#include "../framework/engine.h"

char *webs_wson_encode(const Value *value);

Value *webs_wson_decode(Engine *engine, const char *wson_string, char **error);

#endif
