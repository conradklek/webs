#include "url.h"
#include "../core/array.h"
#include "../core/map.h"
#include "../core/object.h"
#include "../core/string.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static size_t url_decode_inplace(char *str) {
  char *p = str, *q = str;
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
  return q - str;
}

static Status set_nested_value(Value *root, char *key, Value *value) {
  Value *cursor = root;
  char *p = key;
  char *key_part_start = key;

  while (*p) {
    if (*p == '[') {
      if (p > key_part_start) {
        *p = '\0';
        Value *child_node =
            cursor->as.object_val->get(cursor->as.object_val, key_part_start);

        if (!child_node) {
          if (*(p + 1) == ']') {
            child_node = array_value();
          } else {
            child_node = object_value();
          }
          if (!child_node) {
            value_free(value);
            return ERROR_MEMORY;
          }
          Status set_status = cursor->as.object_val->set(
              cursor->as.object_val, key_part_start, child_node);
          if (set_status != OK) {
            value_free(value);
            value_free(child_node);
            return set_status;
          }
        }
        cursor = child_node;
      }

      char *end_bracket = strchr(p + 1, ']');
      if (!end_bracket) {
        value_free(value);
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
    if (cursor && cursor->type == VALUE_ARRAY) {
      return cursor->as.array_val->push(cursor->as.array_val, value);
    }
  } else {
    if (cursor && cursor->type == VALUE_OBJECT) {
      return cursor->as.object_val->set(cursor->as.object_val, key_part_start,
                                        value);
    }
  }

  value_free(value);
  return ERROR_INVALID_ARG;
}

Value *url_decode(const char *url_string, Status *status) {
  Value *root = NULL;
  char *input_copy = NULL;
  *status = OK;

  if (!url_string) {
    return object_value();
  }

  input_copy = strdup(url_string);
  if (!input_copy) {
    *status = ERROR_MEMORY;
    goto cleanup;
  }

  root = object_value();
  if (!root) {
    *status = ERROR_MEMORY;
    goto cleanup;
  }

  if (strstr(url_string, "://") == NULL) {
    char *pair_state;
    char *pair = strtok_r(input_copy, "&", &pair_state);
    while (pair != NULL) {
      char *equals = strchr(pair, '=');
      char *key;
      Value *value;

      if (equals) {
        *equals = '\0';
        key = pair;
        char *val_str = equals + 1;
        url_decode_inplace(val_str);
        value = string_value(val_str);
      } else {
        key = pair;
        value = string_value("");
      }

      if (!value) {
        *status = ERROR_MEMORY;
        goto cleanup;
      }
      url_decode_inplace(key);
      *status = set_nested_value(root, key, value);
      if (*status != OK) {
        goto cleanup;
      }
      pair = strtok_r(NULL, "&", &pair_state);
    }
  } else {
    Object *root_obj = root->as.object_val;
    char *rest = input_copy;

    char *fragment_start = strchr(rest, '#');
    if (fragment_start) {
      *fragment_start = '\0';
      root_obj->set(root_obj, "fragment", string_value(fragment_start + 1));
    }

    Value *query_obj = object_value();
    if (!query_obj) {
      *status = ERROR_MEMORY;
      goto cleanup;
    }
    char *query_start = strchr(rest, '?');
    if (query_start) {
      *query_start = '\0';
      char *query_part = query_start + 1;

      char *pair_state;
      char *pair = strtok_r(query_part, "&", &pair_state);
      while (pair != NULL) {
        char *equals = strchr(pair, '=');
        char *key;
        Value *value;
        if (equals) {
          *equals = '\0';
          key = pair;
          char *val_str = equals + 1;
          url_decode_inplace(val_str);
          value = string_value(val_str);
        } else {
          key = pair;
          value = string_value("");
        }
        if (!value) {
          *status = ERROR_MEMORY;
          value_free(query_obj);
          goto cleanup;
        }
        url_decode_inplace(key);
        *status = set_nested_value(query_obj, key, value);
        if (*status != OK) {
          value_free(query_obj);
          goto cleanup;
        }
        pair = strtok_r(NULL, "&", &pair_state);
      }
    }
    root_obj->set(root_obj, "query", query_obj);

    char *scheme_end = strstr(rest, "://");
    if (scheme_end) {
      *scheme_end = '\0';
      root_obj->set(root_obj, "scheme", string_value(rest));
      rest = scheme_end + 3;
    }

    char *path_start = strchr(rest, '/');
    if (path_start) {
      root_obj->set(root_obj, "path", string_value(path_start));
      *path_start = '\0';
    } else {
      root_obj->set(root_obj, "path", string_value("/"));
    }

    char *host_part = rest;
    char *port_delim = strchr(host_part, ':');
    if (port_delim) {
      *port_delim = '\0';
      root_obj->set(root_obj, "port", string_value(port_delim + 1));
    }
    root_obj->set(root_obj, "host", string_value(host_part));
  }

cleanup:
  if (input_copy)
    free(input_copy);
  if (*status != OK && root) {
    value_free(root);
    root = NULL;
  }
  return root;
}

Value *url_match_route(const char *pattern, const char *path, Status *status) {
  *status = OK;
  char *p_copy = strdup(pattern);
  char *path_copy = strdup(path);
  if (!p_copy || !path_copy) {
    free(p_copy);
    free(path_copy);
    *status = ERROR_MEMORY;
    return NULL;
  }

  Value *params = object_value();
  if (!params) {
    free(p_copy);
    free(path_copy);
    *status = ERROR_MEMORY;
    return NULL;
  }

  char *p_tok, *path_tok;
  char *p_save, *path_save;

  p_tok = strtok_r(p_copy, "/", &p_save);
  path_tok = strtok_r(path_copy, "/", &path_save);

  bool catch_all_matched = false;

  while (p_tok != NULL) {
    if (path_tok == NULL && p_tok[0] != '[') {
      value_free(params);
      params = NULL;
      break;
    }

    if (p_tok[0] == '[') {
      bool is_catch_all = strncmp(p_tok + 1, "...", 3) == 0;
      size_t offset = is_catch_all ? 4 : 1;
      char *name = strndup(p_tok + offset, strlen(p_tok) - offset - 1);

      if (is_catch_all) {
        Value *vals = array_value();
        if (path_tok) {
          do {
            vals->as.array_val->push(vals->as.array_val,
                                     string_value(path_tok));
          } while ((path_tok = strtok_r(NULL, "/", &path_save)));
        }
        params->as.object_val->set(params->as.object_val, name, vals);
        catch_all_matched = true;

      } else {
        if (!path_tok) {
          value_free(params);
          params = NULL;
          free(name);
          break;
        }
        params->as.object_val->set(params->as.object_val, name,
                                   string_value(path_tok));
      }
      free(name);

    } else if (path_tok == NULL || strcmp(p_tok, path_tok) != 0) {
      value_free(params);
      params = NULL;
      break;
    }

    p_tok = strtok_r(NULL, "/", &p_save);
    if (!catch_all_matched) {
      path_tok = strtok_r(NULL, "/", &path_save);
    }
  }

  if (path_tok != NULL && !catch_all_matched) {
    if (params)
      value_free(params);
    params = NULL;
  }

  free(p_copy);
  free(path_copy);
  return params;
}
