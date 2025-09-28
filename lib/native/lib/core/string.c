#include "string.h"
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

Value *string_value(const char *s) {
  const char *input = s ? s : "";
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_STRING;
  val->as.string = string(input);
  if (!val->as.string) {
    free(val);
    return NULL;
  }
  return val;
}

String *string(const char *s) {
  const char *input = s ? s : "";
  String *string = malloc(sizeof(String));
  if (!string)
    return NULL;
  string->length = strlen(input);
  string->chars = malloc(string->length + 1);
  if (!string->chars) {
    free(string);
    return NULL;
  }
  memcpy(string->chars, input, string->length + 1);
  return string;
}

void string_free(String *string) {
  if (!string)
    return;
  free(string->chars);
  free(string);
}

char *string_trim_start(const char *str) {
  if (!str)
    return NULL;
  while (*str && isspace((unsigned char)*str)) {
    str++;
  }
  return strdup(str);
}

char *string_trim_end(const char *str) {
  if (!str)
    return NULL;

  char *copy = strdup(str);
  if (!copy)
    return NULL;

  char *end = copy + strlen(copy) - 1;
  while (end >= copy && isspace((unsigned char)*end)) {
    end--;
  }
  *(end + 1) = '\0';
  return copy;
}

char *string_trim(const char *str) {
  if (!str)
    return NULL;

  const char *start = str;
  while (*start && isspace((unsigned char)*start)) {
    start++;
  }

  const char *end = str + strlen(str) - 1;
  while (end >= start && isspace((unsigned char)*end)) {
    end--;
  }

  size_t len = (end < start) ? 0 : (end - start) + 1;

  char *trimmed = malloc(len + 1);
  if (!trimmed)
    return NULL;

  strncpy(trimmed, start, len);
  trimmed[len] = '\0';

  return trimmed;
}
