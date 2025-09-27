#include "string_builder.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static bool sb_ensure_capacity(StringBuilder *sb, size_t additional) {
  if (!sb->buffer)
    return false;

  if (sb->length + additional >= sb->capacity) {
    size_t new_capacity = sb->capacity;
    while (new_capacity <= sb->length + additional) {
      new_capacity = new_capacity == 0 ? 256 : new_capacity * 2;
    }
    char *new_buffer = realloc(sb->buffer, new_capacity);
    if (!new_buffer)
      return false;
    sb->buffer = new_buffer;
    sb->capacity = new_capacity;
  }
  return true;
}

void sb_init(StringBuilder *sb) {
  sb->capacity = 1024;
  sb->buffer = malloc(sb->capacity);
  if (sb->buffer) {
    sb->buffer[0] = '\0';
  }
  sb->length = 0;
}

void sb_append_str(StringBuilder *sb, const char *str) {
  if (!str)
    return;
  size_t len = strlen(str);
  if (!sb_ensure_capacity(sb, len))
    return;
  memcpy(sb->buffer + sb->length, str, len);
  sb->length += len;
  sb->buffer[sb->length] = '\0';
}

void sb_append_char(StringBuilder *sb, char c) {
  if (!sb_ensure_capacity(sb, 1))
    return;
  sb->buffer[sb->length++] = c;
  sb->buffer[sb->length] = '\0';
}

void sb_append_html_escaped(StringBuilder *sb, const char *text) {
  if (!text)
    return;
  for (const char *p = text; *p; p++) {
    switch (*p) {
    case '&':
      sb_append_str(sb, "&amp;");
      break;
    case '<':
      sb_append_str(sb, "&lt;");
      break;
    case '>':
      sb_append_str(sb, "&gt;");
      break;
    case '"':
      sb_append_str(sb, "&quot;");
      break;
    case '\'':
      sb_append_str(sb, "&#39;");
      break;
    default:
      sb_append_char(sb, *p);
      break;
    }
  }
}

char *sb_to_string(StringBuilder *sb) {
  if (!sb || !sb->buffer)
    return NULL;
  char *result = realloc(sb->buffer, sb->length + 1);
  if (result) {
    result[sb->length] = '\0';
  }
  sb->buffer = NULL;
  sb->length = 0;
  sb->capacity = 0;
  return result;
}

void sb_free(StringBuilder *sb) {
  if (sb && sb->buffer) {
    free(sb->buffer);
    sb->buffer = NULL;
    sb->length = 0;
    sb->capacity = 0;
  }
}
