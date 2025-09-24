#include "webs_value.h"
#include "webs_hash.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static WebsResult create_error_result(const char *error_message) {
  WebsResult res = {.result = NULL, .error = strdup(error_message)};
  return res;
}

void webs_value_free(WebsValue *value) {
  if (!value)
    return;
  switch (value->type) {
  case WEBS_VALUE_STRING:
    free(value->value.string_val);
    break;
  case WEBS_VALUE_ARRAY:
    for (size_t i = 0; i < value->value.array_val.count; i++) {
      webs_value_free(value->value.array_val.elements[i]);
    }
    free(value->value.array_val.elements);
    break;
  case WEBS_VALUE_OBJECT:
    webs_hash_free(value->value.object_val.table);
    break;
  default:
    break;
  }
  free(value);
}

static char *format_node_value(WebsValue *node) {
  if (!node)
    return strdup("null");
  char buffer[512];
  switch (node->type) {
  case WEBS_VALUE_NULL:
    return strdup("null");
  case WEBS_VALUE_BOOL:
    return strdup(node->value.bool_val ? "true" : "false");
  case WEBS_VALUE_NUMBER:
    snprintf(buffer, sizeof(buffer), "%g", node->value.number_val);
    return strdup(buffer);
  case WEBS_VALUE_STRING:
    return strdup(node->value.string_val);
  case WEBS_VALUE_ARRAY:
    return strdup("[Array]");
  case WEBS_VALUE_OBJECT:
    return strdup("[Object]");
  }
  return strdup("unknown");
}

WebsResult webs_value_query(WebsValue *root, const char *path) {
  if (!root) {
    return create_error_result("Failed to query on a null root node.");
  }

  WebsValue *current_node = root;
  const char *p = path;

  while (*p) {
    if (current_node->type == WEBS_VALUE_OBJECT) {
      if (*p == '[') {
        return create_error_result(
            "Error: Attempted to index an object with array syntax.");
      }

      const char *end = strpbrk(p, ".[");
      size_t len = end ? (size_t)(end - p) : strlen(p);

      char *key = malloc(len + 1);
      if (!key)
        return create_error_result("Memory allocation failed for query key.");

      strncpy(key, p, len);
      key[len] = '\0';

      current_node = webs_hash_get(current_node->value.object_val.table, key);
      free(key);

      if (!current_node) {
        return create_error_result("Error: Key not found in path.");
      }
      p += len;
    } else if (current_node->type == WEBS_VALUE_ARRAY && *p == '[') {
      p++;
      char *endptr;
      long index = strtol(p, &endptr, 10);

      if (endptr == p || *endptr != ']') {
        return create_error_result("Error: Invalid or unclosed array index.");
      }
      if (index < 0 || (size_t)index >= current_node->value.array_val.count) {
        return create_error_result("Error: Array index out of bounds.");
      }

      current_node = current_node->value.array_val.elements[index];
      p = endptr + 1;
    } else {
      if (*p == '[')
        return create_error_result(
            "Error: Attempted to index a non-array value.");
      else
        return create_error_result(
            "Error: Attempted to access key on a non-object value.");
    }

    if (*p == '.') {
      p++;
    }
  }

  WebsResult res = {.result = format_node_value(current_node), .error = NULL};
  return res;
}
