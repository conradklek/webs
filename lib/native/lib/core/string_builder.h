#ifndef STRING_BUILDER_H
#define STRING_BUILDER_H

#include <stddef.h>

typedef struct {
  char *buffer;
  size_t length;
  size_t capacity;
} StringBuilder;

void sb_init(StringBuilder *sb);

void sb_append_str(StringBuilder *sb, const char *str);

void sb_append_char(StringBuilder *sb, char c);

void sb_append_html_escaped(StringBuilder *sb, const char *text);

char *sb_to_string(StringBuilder *sb);

void sb_free(StringBuilder *sb);

#endif
