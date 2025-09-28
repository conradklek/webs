#ifndef STRING_H
#define STRING_H

#include "value.h"

typedef struct String {
  char *chars;
  size_t length;
} String;

Value *string_value(const char *s);

String *string(const char *s);

void string_free(String *string);

char *string_trim_start(const char *str);
char *string_trim_end(const char *str);
char *string_trim(const char *str);

#endif
