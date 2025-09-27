#ifndef HTTP_H
#define HTTP_H

#include "../core/error.h"
#include "../core/value.h"

Value *webs_http_parse_request(const char *raw_request, Status *status);

#endif
