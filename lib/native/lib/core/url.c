/**
 * @file url.c
 * @brief Provides URL and route parsing.
 * @note This file has been refactored to use the W-> API for string
 * splitting and slicing, replacing manual tokenization with `strtok_r`.
 */

#include "url.h"
#include "../webs_api.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Helper to decode a URL component (e.g., %20 -> ' '). Returns a new string.
static char *url_decode_component(const char *str) {
  if (!str)
    return NULL;
  size_t len = strlen(str);
  char *decoded = malloc(len + 1);
  if (!decoded)
    return NULL;

  char *q = decoded;
  const char *p = str;
  while (*p) {
    if (*p == '%') {
      if (p[1] && p[2] && isxdigit((unsigned char)p[1]) &&
          isxdigit((unsigned char)p[2])) {
        char hex[3] = {p[1], p[2], 0};
        *q++ = (char)strtol(hex, NULL, 16);
        p += 3;
      } else {
        *q++ = *p++;
      }
    } else if (*p == '+') {
      *q++ = ' ';
      p++;
    } else {
      *q++ = *p++;
    }
  }
  *q = '\0';
  return decoded;
}

// Helper to decode a path segment. Returns a new string.
static char *path_segment_decode(const char *str) {
  if (!str)
    return NULL;
  size_t len = strlen(str);
  char *decoded = malloc(len + 1);
  if (!decoded)
    return NULL;

  char *q = decoded;
  const char *p = str;
  while (*p) {
    if (*p == '%') {
      if (p[1] && p[2] && isxdigit((unsigned char)p[1]) &&
          isxdigit((unsigned char)p[2])) {
        char hex[3] = {p[1], p[2], 0};
        *q++ = (char)strtol(hex, NULL, 16);
        p += 3;
      } else {
        *q++ = *p++;
      }
    } else {
      *q++ = *p++;
    }
  }
  *q = '\0';
  return decoded;
}

static Status set_nested_value(Value *root, char *key, Value *value) {
  Value *cursor = root;
  char *p = key;
  char *key_part_start = key;

  while (*p) {
    if (*p == '[') {
      if (p > key_part_start) {
        *p = '\0';
        Value *child_node = W->objectGetRef(cursor, key_part_start);
        if (!child_node) {
          child_node = (*(p + 1) == ']') ? W->array() : W->object();
          if (!child_node) {
            W->freeValue(value);
            return ERROR_MEMORY;
          }
          if (W->objectSet(cursor, key_part_start, child_node) != OK) {
            W->freeValue(value);
            W->freeValue(child_node);
            return ERROR_MEMORY;
          }
        }
        cursor = child_node;
      }
      char *end_bracket = strchr(p + 1, ']');
      if (!end_bracket) {
        W->freeValue(value);
        return ERROR_PARSE;
      }
      p++;
      *end_bracket = '\0';
      key_part_start = p;
      p = end_bracket;
    }
    p++;
  }
  if (*key_part_start == '\0') {
    if (cursor && W->valueGetType(cursor) == VALUE_ARRAY)
      return W->arrayPush(cursor, value);
  } else {
    if (cursor && W->valueGetType(cursor) == VALUE_OBJECT)
      return W->objectSet(cursor, key_part_start, value);
  }
  W->freeValue(value);
  return ERROR_INVALID_ARG;
}

Value *url_decode(const char *url_string, Status *status) {
  *status = OK;
  if (!url_string)
    return W->object();

  if (W->stringIndexOf(url_string, "://") != -1) {
    // Full URL parsing logic
    char *input_copy = strdup(url_string);
    if (!input_copy) {
      *status = ERROR_MEMORY;
      return NULL;
    }
    Value *root = W->object();
    char *rest = input_copy;

    int fragment_idx = W->stringIndexOf(rest, "#");
    if (fragment_idx != -1) {
      char *fragment_str = W->stringSlice(rest, fragment_idx + 1, strlen(rest));
      W->objectSet(root, "fragment", W->string(fragment_str));
      W->freeString(fragment_str);
      rest[fragment_idx] = '\0';
    }

    Value *query_obj = W->object();
    int query_idx = W->stringIndexOf(rest, "?");
    if (query_idx != -1) {
      char *query_part = rest + query_idx + 1;
      rest[query_idx] = '\0';

      // REFACTOR: Use W->stringSplit instead of strtok_r
      int pair_count;
      char **pairs = W->stringSplit(query_part, "&", &pair_count);
      if (pairs) {
        for (int i = 0; i < pair_count; i++) {
          char *key;
          Value *value;
          int equals_idx = W->stringIndexOf(pairs[i], "=");

          if (equals_idx != -1) {
            char *raw_key = W->stringSlice(pairs[i], 0, equals_idx);
            char *raw_val =
                W->stringSlice(pairs[i], equals_idx + 1, strlen(pairs[i]));

            key = url_decode_component(raw_key);
            char *decoded_val = url_decode_component(raw_val);
            value = W->string(decoded_val);

            W->freeString(raw_key);
            W->freeString(raw_val);
            W->freeString(decoded_val);
          } else {
            key = url_decode_component(pairs[i]);
            value = W->string("");
          }

          if (key) {
            set_nested_value(query_obj, key, value);
            free(key);
          }
        }
        W->freeStringArray(pairs, pair_count);
      }
    }
    W->objectSet(root, "query", query_obj);

    // Continue with full URL parsing
    int scheme_end_idx = W->stringIndexOf(rest, "://");
    if (scheme_end_idx != -1) {
      char *scheme = W->stringSlice(rest, 0, scheme_end_idx);
      W->objectSet(root, "scheme", W->string(scheme));
      W->freeString(scheme);
      rest += scheme_end_idx + 3;
    }

    int path_idx = W->stringIndexOf(rest, "/");
    if (path_idx != -1) {
      char *path_str = W->stringSlice(rest, path_idx, strlen(rest));
      W->objectSet(root, "path", W->string(path_str));
      W->freeString(path_str);
      rest[path_idx] = '\0';
    } else {
      W->objectSet(root, "path", W->string("/"));
    }

    int port_idx = W->stringIndexOf(rest, ":");
    if (port_idx != -1) {
      char *port_str = W->stringSlice(rest, port_idx + 1, strlen(rest));
      W->objectSet(root, "port", W->string(port_str));
      W->freeString(port_str);
      rest[port_idx] = '\0';
    }
    W->objectSet(root, "host", W->string(rest));
    free(input_copy);
    return root;

  } else {
    // Query string only parsing logic
    Value *root = W->object();
    int pair_count;
    char **pairs = W->stringSplit(url_string, "&", &pair_count);
    if (pairs) {
      for (int i = 0; i < pair_count; i++) {
        char *key;
        Value *value;
        int equals_idx = W->stringIndexOf(pairs[i], "=");

        if (equals_idx != -1) {
          char *raw_key = W->stringSlice(pairs[i], 0, equals_idx);
          char *raw_val =
              W->stringSlice(pairs[i], equals_idx + 1, strlen(pairs[i]));
          key = url_decode_component(raw_key);
          char *decoded_val = url_decode_component(raw_val);
          value = W->string(decoded_val);
          W->freeString(raw_key);
          W->freeString(raw_val);
          W->freeString(decoded_val);
        } else {
          key = url_decode_component(pairs[i]);
          value = W->string("");
        }
        if (key) {
          set_nested_value(root, key, value);
          free(key);
        }
      }
      W->freeStringArray(pairs, pair_count);
    }
    return root;
  }
}

Value *url_match_route(const char *pattern, const char *path, Status *status) {
  *status = OK;
  Value *params = W->object();
  if (!params) {
    *status = ERROR_MEMORY;
    return NULL;
  }

  const char *p_cursor = pattern;
  const char *path_cursor = path;

  while (*p_cursor) {
    if (*p_cursor == '[') {
      p_cursor++;
      bool is_catch_all = W->stringStartsWith(p_cursor, "...");
      if (is_catch_all)
        p_cursor += 3;

      const char *name_start = p_cursor;
      while (*p_cursor && *p_cursor != ']')
        p_cursor++;
      if (*p_cursor != ']') {
        W->freeValue(params);
        return NULL;
      }
      char *name = strndup(name_start, p_cursor - name_start);
      p_cursor++;

      if (is_catch_all) {
        if (*p_cursor != '\0') {
          W->freeValue(params);
          free(name);
          return NULL;
        }
        Value *segments = W->array();
        if (*path_cursor != '\0' &&
            (*path_cursor != '/' || *(path_cursor + 1) != '\0')) {
          const char *start =
              (*path_cursor == '/') ? path_cursor + 1 : path_cursor;
          if (*start != '\0') {
            // REFACTOR: Use W->stringSplit instead of strtok_r
            int segment_count;
            char **path_segments = W->stringSplit(start, "/", &segment_count);
            if (path_segments) {
              for (int i = 0; i < segment_count; i++) {
                char *decoded_segment = path_segment_decode(path_segments[i]);
                W->arrayPush(segments, W->string(decoded_segment));
                free(decoded_segment);
              }
              W->freeStringArray(path_segments, segment_count);
            }
          }
        }
        W->objectSet(params, name, segments);
        path_cursor += strlen(path_cursor);
      } else {
        const char *seg_end;
        const char delimiter = *p_cursor;

        if (delimiter != '\0' && delimiter != '/') {
          seg_end = strchr(path_cursor, delimiter);
          if (!seg_end) {
            W->freeValue(params);
            free(name);
            return NULL;
          }
        } else {
          seg_end = path_cursor;
          while (*seg_end && *seg_end != '/') {
            seg_end++;
          }
        }

        char *value = strndup(path_cursor, seg_end - path_cursor);
        char *decoded_value = path_segment_decode(value);
        W->objectSet(params, name, W->string(decoded_value));
        free(value);
        free(decoded_value);
        path_cursor = seg_end;
      }
      free(name);
    } else if (*p_cursor == *path_cursor) {
      p_cursor++;
      path_cursor++;
    } else {
      W->freeValue(params);
      return NULL;
    }
  }

  if (*path_cursor != *p_cursor) {
    W->freeValue(params);
    return NULL;
  }

  return params;
}
