#include "regex.h"
#include "../webs_api.h"
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

  Value *regex_obj = W->objectOf("pattern", W->string(pattern_str), "flags",
                                 W->string(flags_str), NULL);

  free(pattern_str);

  if (!regex_obj) {
    *status = ERROR_MEMORY;
    return NULL;
  }

  return regex_obj;
}
