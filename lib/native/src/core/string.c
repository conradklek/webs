#include "string.h"
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

Value *string_value(const char *s) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_STRING;
  val->as.string_val = string(s);
  if (!val->as.string_val) {
    free(val);
    return NULL;
  }
  return val;
}

String *string(const char *s) {
  String *string = malloc(sizeof(String));
  if (!string)
    return NULL;
  string->length = strlen(s);
  string->chars = malloc(string->length + 1);
  if (!string->chars) {
    free(string);
    return NULL;
  }
  memcpy(string->chars, s, string->length + 1);
  return string;
}

void string_free(String *string) {
  if (!string)
    return;
  free(string->chars);
  free(string);
}

char *string_trim_start(char *str) {
  if (!str)
    return NULL;
  while (*str && isspace((unsigned char)*str)) {
    str++;
  }
  return str;
}

void string_trim_end(char *str) {
  if (!str)
    return;
  char *end = str + strlen(str) - 1;
  while (end >= str && isspace((unsigned char)*end)) {
    end--;
  }
  *(end + 1) = '\0';
}

char *string_trim(char *str) {
  if (!str)
    return NULL;
  char *start = string_trim_start(str);
  string_trim_end(start);
  return start;
}
