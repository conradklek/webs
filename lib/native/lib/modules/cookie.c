#include "cookie.h"
#include "../webs_api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/**
 * @brief Parses a cookie header string (e.g., "key1=val1; key2=val2") into an
 * object.
 */
Value *cookie_parse(const char *cookie_header) {
  Value *cookies = W->object();
  if (!cookie_header)
    return cookies;

  char *header_copy = strdup(cookie_header);
  if (!header_copy)
    return cookies;

  char *pair_state;
  char *pair = strtok_r(header_copy, ";", &pair_state);
  while (pair) {
    while (*pair == ' ')
      pair++;
    char *equals = strchr(pair, '=');
    if (equals) {
      *equals = '\0';
      char *key = pair;
      char *value = equals + 1;
      W->objectSet(cookies, key, W->string(value));
    }
    pair = strtok_r(NULL, ";", &pair_state);
  }
  free(header_copy);
  return cookies;
}

/**
 * @brief Creates a 'Set-Cookie' header string. This is a simplified version.
 */
char *cookie_serialize(const char *name, const char *value, Value *options) {
  char *cookie_str = NULL;
  asprintf(&cookie_str, "%s=%s; HttpOnly; Path=/", name, value);
  return cookie_str;
}
