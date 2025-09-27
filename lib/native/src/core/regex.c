#include "regex.h"
#include "object.h"
#include "string.h"
#include <stdlib.h>
#include <string.h>

Value *regex_parse(const char *pattern) {
  if (!pattern || pattern[0] != '/') {
    return NULL;
  }

  const char *end_slash = strrchr(pattern, '/');
  if (!end_slash || end_slash == pattern) {
    return NULL;
  }

  size_t pattern_len = end_slash - (pattern + 1);
  char *pattern_str = (char *)malloc(pattern_len + 1);
  if (!pattern_str)
    return NULL;
  strncpy(pattern_str, pattern + 1, pattern_len);
  pattern_str[pattern_len] = '\0';

  const char *flags_str = end_slash + 1;

  Value *regex_obj = object_value();
  if (!regex_obj) {
    free(pattern_str);
    return NULL;
  }

  regex_obj->as.object_val->set(regex_obj->as.object_val, "pattern",
                                string_value(pattern_str));
  regex_obj->as.object_val->set(regex_obj->as.object_val, "flags",
                                string_value(flags_str));

  free(pattern_str);
  return regex_obj;
}
