#ifndef FETCH_H
#define FETCH_H

#include "../core/value.h"
#include "../framework/reactivity.h"

char *webs_fetch_sync(const char *url, const char *options_json, char **error);

void webs_fetch_async(const char *url, const char *options_json,
                      EffectCallback on_complete, void *callback_data);

#endif
