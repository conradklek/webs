#ifndef URL_H
#define URL_H

#include "../core/error.h"
#include "../core/value.h"

Value *url_decode(const char *url_string, Status *status);
Value *url_match_route(const char *pattern, const char *path, Status *status);

#endif
