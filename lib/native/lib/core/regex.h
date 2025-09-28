#ifndef REGEX_H
#define REGEX_H

#include "error.h"
#include "value.h"

Value *regex_parse(const char *pattern, Status *status);

#endif
