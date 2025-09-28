#include "regex.h"
#include "object.h"
#include "string.h"
#include <stdlib.h>
#include <string.h>

Value *regex_parse(const char *pattern, Status *status) {
  *status = OK;

  if (!pattern || pattern[0] != '/') {
    *status = ERROR_PARSE;
    return NULL;
  }

  const char *end_slash = strrchr(pattern, '/');
  if (!end_slash || end_slash == pattern) {
    *status = ERROR_PARSE;
    return NULL;
  }

  size_t pattern_len = end_slash - (pattern + 1);
  char *pattern_str = (char *)malloc(pattern_len + 1);
  if (!pattern_str) {
    *status = ERROR_MEMORY;
    return NULL;
  }
  strncpy(pattern_str, pattern + 1, pattern_len);
  pattern_str[pattern_len] = '\0';

  const char *flags_str = end_slash + 1;

  Value *regex_obj = object_value();
  if (!regex_obj) {
    free(pattern_str);
    *status = ERROR_MEMORY;
    return NULL;
  }

  if (regex_obj->as.object->set(regex_obj->as.object, "pattern",
                                string_value(pattern_str)) != OK ||
      regex_obj->as.object->set(regex_obj->as.object, "flags",
                                string_value(flags_str)) != OK) {
    *status = ERROR_MEMORY;
    value_free(regex_obj);
    free(pattern_str);
    return NULL;
  }

  free(pattern_str);
  return regex_obj;
}
