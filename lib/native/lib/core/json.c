/**
 * @file json.c
 * @brief Implements JSON parsing, encoding, and querying functionality.
 */
#include "json.h"
#include "../modules/terminal.h"
#include "../webs_api.h"
#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  const char *current;
  const char *start;
  Status *status;
} Parser;

static Value *parse_value(Parser *p);

static void set_status(Parser *p, Status new_status) {
  if (p && p->status && *p->status == OK) {
    *p->status = new_status;
  }
}

static void skip_whitespace(Parser *p) {
  while (*p->current && isspace((unsigned char)*p->current)) {
    p->current++;
  }
}

static char *parse_allocated_string(Parser *p) {
  p->current++;
  const char *start = p->current;
  const char *end = start;
  while (*end && *end != '"') {
    if (*end == '\\') {
      end++;
      if (*end)
        end++;
    } else {
      end++;
    }
  }
  if (*end != '"') {
    set_status(p, ERROR_PARSE);
    return NULL;
  }
  char *unescaped_str = (char *)malloc(end - start + 1);
  if (!unescaped_str) {
    set_status(p, ERROR_MEMORY);
    return NULL;
  }
  char *writer = unescaped_str;
  const char *reader = start;
  while (reader < end) {
    if (*reader == '\\') {
      reader++;
      switch (*reader) {
      case '"':
        *writer++ = '"';
        break;
      case '\\':
        *writer++ = '\\';
        break;
      case '/':
        *writer++ = '/';
        break;
      case 'b':
        *writer++ = '\b';
        break;
      case 'f':
        *writer++ = '\f';
        break;
      case 'n':
        *writer++ = '\n';
        break;
      case 'r':
        *writer++ = '\r';
        break;
      case 't':
        *writer++ = '\t';
        break;
      default:
        *writer++ = *reader;
        break;
      }
      reader++;
    } else {
      *writer++ = *reader++;
    }
  }
  *writer = '\0';
  p->current = end + 1;
  return unescaped_str;
}

static Value *parse_string(Parser *p) {
  char *str_val = parse_allocated_string(p);
  if (!str_val)
    return NULL;
  Value *node = W->string(str_val);
  free(str_val);
  if (!node) {
    set_status(p, ERROR_MEMORY);
  }
  return node;
}

static Value *parse_number(Parser *p) {
  const char *start = p->current;
  char *end;
  double num = strtod(start, &end);
  if (end == start) {
    set_status(p, ERROR_PARSE);
    return NULL;
  }
  p->current = end;
  return W->number(num);
}

static Value *parse_literal(Parser *p) {
  if (strncmp(p->current, "true", 4) == 0) {
    p->current += 4;
    return W->boolean(true);
  }
  if (strncmp(p->current, "false", 5) == 0) {
    p->current += 5;
    return W->boolean(false);
  }
  if (strncmp(p->current, "null", 4) == 0) {
    p->current += 4;
    return W->null();
  }
  set_status(p, ERROR_PARSE);
  return NULL;
}

static Value *parse_array(Parser *p) {
  p->current++;
  Value *node = W->array();
  if (!node) {
    set_status(p, ERROR_MEMORY);
    return NULL;
  }
  skip_whitespace(p);
  if (*p->current == ']') {
    p->current++;
    return node;
  }
  while (*p->current) {
    Value *element = parse_value(p);
    if (!element) {
      W->freeValue(node);
      return NULL;
    }
    W->arrayPush(node, element);
    skip_whitespace(p);
    if (*p->current == ']') {
      p->current++;
      return node;
    }
    if (*p->current == ',') {
      p->current++;
      skip_whitespace(p);
      if (*p->current == ']') {
        set_status(p, ERROR_PARSE);
        W->freeValue(node);
        return NULL;
      }
    } else {
      set_status(p, ERROR_PARSE);
      W->freeValue(node);
      return NULL;
    }
  }
  set_status(p, ERROR_PARSE);
  W->freeValue(node);
  return NULL;
}

static Value *parse_object(Parser *p) {
  p->current++;
  Value *node = W->object();
  if (!node) {
    set_status(p, ERROR_MEMORY);
    return NULL;
  }
  skip_whitespace(p);
  if (*p->current == '}') {
    p->current++;
    return node;
  }
  while (*p->current) {
    if (*p->current != '"') {
      set_status(p, ERROR_PARSE);
      goto cleanup;
    }
    char *key_string = parse_allocated_string(p);
    if (!key_string) {
      goto cleanup;
    }
    skip_whitespace(p);
    if (*p->current != ':') {
      set_status(p, ERROR_PARSE);
      free(key_string);
      goto cleanup;
    }
    p->current++;
    Value *value_node = parse_value(p);
    if (!value_node) {
      free(key_string);
      goto cleanup;
    }
    W->objectSet(node, key_string, value_node);
    free(key_string);
    skip_whitespace(p);
    if (*p->current == '}') {
      p->current++;
      return node;
    }
    if (*p->current == ',') {
      p->current++;
      skip_whitespace(p);
      if (*p->current == '}') {
        set_status(p, ERROR_PARSE);
        goto cleanup;
      }
    } else {
      set_status(p, ERROR_PARSE);
      goto cleanup;
    }
  }
  set_status(p, ERROR_PARSE);
cleanup:
  W->freeValue(node);
  return NULL;
}

static Value *parse_value(Parser *p) {
  skip_whitespace(p);
  switch (*p->current) {
  case '"':
    return parse_string(p);
  case '[':
    return parse_array(p);
  case '{':
    return parse_object(p);
  case '-':
  case '0' ... '9':
    return parse_number(p);
  case 't':
  case 'f':
  case 'n':
    return parse_literal(p);
  default:
    set_status(p, ERROR_PARSE);
    return NULL;
  }
}

Value *json_decode(const char *json_string, Status *status) {
  Parser p = {.current = json_string, .start = json_string, .status = status};
  *status = OK;
  Value *root = parse_value(&p);
  if (*status == OK && root) {
    skip_whitespace(&p);
    if (*p.current != '\0') {
      *status = ERROR_PARSE;
    }
  }
  if (*status != OK && root) {
    W->freeValue(root);
    return NULL;
  }
  return root;
}

static void encode_value(const Value *value, StringBuilder *sb);

static void encode_string(const char *str, StringBuilder *sb) {
  W->stringBuilder->appendChar(sb, '"');
  for (const char *p = str; *p; p++) {
    switch (*p) {
    case '"':
      W->stringBuilder->appendStr(sb, "\\\"");
      break;
    case '\\':
      W->stringBuilder->appendStr(sb, "\\\\");
      break;
    case '\b':
      W->stringBuilder->appendStr(sb, "\\b");
      break;
    case '\f':
      W->stringBuilder->appendStr(sb, "\\f");
      break;
    case '\n':
      W->stringBuilder->appendStr(sb, "\\n");
      break;
    case '\r':
      W->stringBuilder->appendStr(sb, "\\r");
      break;
    case '\t':
      W->stringBuilder->appendStr(sb, "\\t");
      break;
    default:
      if ((unsigned char)*p < 32) {
        char hex_buf[7];
        sprintf(hex_buf, "\\u%04x", (unsigned char)*p);
        W->stringBuilder->appendStr(sb, hex_buf);
      } else {
        W->stringBuilder->appendChar(sb, *p);
      }
      break;
    }
  }
  W->stringBuilder->appendChar(sb, '"');
}

static void encode_object(const Value *value, StringBuilder *sb) {
  W->stringBuilder->appendChar(sb, '{');
  Value *keys = W->objectKeys(value);
  if (keys) {
    size_t key_count = W->arrayCount(keys);
    for (size_t i = 0; i < key_count; i++) {
      if (i > 0) {
        W->stringBuilder->appendChar(sb, ',');
      }
      Value *key_val = W->arrayGetRef(keys, i);
      const char *key_str = W->valueAsString(key_val);
      encode_string(key_str, sb);
      W->stringBuilder->appendChar(sb, ':');
      encode_value(W->objectGetRef(value, key_str), sb);
    }
    W->freeValue(keys);
  }
  W->stringBuilder->appendChar(sb, '}');
}

static void encode_array(const Value *value, StringBuilder *sb) {
  W->stringBuilder->appendChar(sb, '[');
  size_t count = W->arrayCount(value);
  for (size_t i = 0; i < count; i++) {
    if (i > 0) {
      W->stringBuilder->appendChar(sb, ',');
    }
    encode_value(W->arrayGetRef(value, i), sb);
  }
  W->stringBuilder->appendChar(sb, ']');
}

static void encode_value(const Value *value, StringBuilder *sb) {
  if (!value) {
    W->stringBuilder->appendStr(sb, "null");
    return;
  }
  switch (W->valueGetType(value)) {
  case VALUE_BOOL:
    W->stringBuilder->appendStr(sb, W->valueAsBool(value) ? "true" : "false");
    break;
  case VALUE_NUMBER: {
    char num_buf[32];
    snprintf(num_buf, sizeof(num_buf), "%g", W->valueAsNumber(value));
    W->stringBuilder->appendStr(sb, num_buf);
    break;
  }
  case VALUE_STRING:
    encode_string(W->valueAsString(value), sb);
    break;
  case VALUE_ARRAY:
    encode_array(value, sb);
    break;
  case VALUE_OBJECT:
    encode_object(value, sb);
    break;
  default:
    W->stringBuilder->appendStr(sb, "null");
    break;
  }
}

char *json_encode(const Value *value) {
  StringBuilder sb;
  W->stringBuilder->init(&sb);
  if (!sb.buffer)
    return NULL;
  encode_value(value, &sb);
  return W->stringBuilder->toString(&sb);
}

Value *value_query(const Value *root, const char *path, Status *status) {
  *status = OK;
  const Value *current = root;
  const char *p = path;

  while (*p && current) {
    if (*p == '.') {
      p++;
    }

    const char *key_start = p;
    const char *key_end = strpbrk(p, ".[]");
    size_t key_len =
        key_end ? (size_t)(key_end - key_start) : strlen(key_start);

    if (W->valueGetType(current) == VALUE_OBJECT) {
      char key_buffer[key_len + 1];
      strncpy(key_buffer, key_start, key_len);
      key_buffer[key_len] = '\0';
      current = W->objectGetRef(current, key_buffer);
    } else {
      *status = ERROR_INVALID_ARG;
      return NULL;
    }

    if (!current) {
      break;
    }

    p = key_start + key_len;

    while (*p == '[') {
      p++;
      char *idx_end;
      long index = strtol(p, &idx_end, 10);
      if (idx_end == p || *idx_end != ']') {
        *status = ERROR_PARSE;
        return NULL;
      }

      if (W->valueGetType(current) != VALUE_ARRAY) {
        *status = ERROR_INVALID_ARG;
        return NULL;
      }
      if (index < 0 || (size_t)index >= W->arrayCount(current)) {
        current = NULL;
        break;
      }
      current = W->arrayGetRef(current, index);
      p = idx_end + 1;
    }
  }

  if (!current) {
    *status = ERROR_NOT_FOUND;
    return NULL;
  }

  Value *result_val = W->valueClone(current);
  if (!result_val) {
    *status = ERROR_MEMORY;
  }
  return result_val;
}

static void append_indent(StringBuilder *sb, int level) {
  for (int i = 0; i < level; i++) {
    W->stringBuilder->appendStr(sb, "  ");
  }
}

static void pretty_print_recursive(const Value *value, StringBuilder *sb,
                                   int indent_level);

static void pretty_print_object(const Value *value, StringBuilder *sb,
                                int indent_level) {
  W->stringBuilder->appendStr(sb, "{\r\n");
  Value *keys = W->objectKeys(value);
  if (keys) {
    size_t key_count = W->arrayCount(keys);
    for (size_t i = 0; i < key_count; i++) {
      if (i > 0) {
        W->stringBuilder->appendStr(sb, ",\r\n");
      }
      append_indent(sb, indent_level + 1);
      Value *key_val = W->arrayGetRef(keys, i);
      const char *key_str = W->valueAsString(key_val);
      W->stringBuilder->appendStr(sb, T_YELLOW);
      W->stringBuilder->appendChar(sb, '"');
      W->stringBuilder->appendStr(sb, key_str);
      W->stringBuilder->appendChar(sb, '"');
      W->stringBuilder->appendStr(sb, T_RESET);
      W->stringBuilder->appendStr(sb, ": ");
      pretty_print_recursive(W->objectGetRef(value, key_str), sb,
                             indent_level + 1);
    }
    W->freeValue(keys);
    if (key_count > 0) {
      W->stringBuilder->appendStr(sb, "\r\n");
    }
  }
  append_indent(sb, indent_level);
  W->stringBuilder->appendChar(sb, '}');
}

static void pretty_print_array(const Value *value, StringBuilder *sb,
                               int indent_level) {
  size_t count = W->arrayCount(value);
  if (count == 0) {
    W->stringBuilder->appendStr(sb, "[]");
    return;
  }
  W->stringBuilder->appendStr(sb, "[\r\n");
  for (size_t i = 0; i < count; i++) {
    append_indent(sb, indent_level + 1);
    pretty_print_recursive(W->arrayGetRef(value, i), sb, indent_level + 1);
    if (i < count - 1) {
      W->stringBuilder->appendStr(sb, ",\r\n");
    }
  }
  W->stringBuilder->appendStr(sb, "\r\n");
  append_indent(sb, indent_level);
  W->stringBuilder->appendChar(sb, ']');
}

static void encode_pretty_string(const char *str, StringBuilder *sb) {
  W->stringBuilder->appendStr(sb, T_GREEN);
  W->stringBuilder->appendChar(sb, '"');
  for (const char *p = str; *p; p++) {
    switch (*p) {
    case '"':
      W->stringBuilder->appendStr(sb, "\\\"");
      break;
    case '\\':
      W->stringBuilder->appendStr(sb, "\\\\");
      break;
    case '\b':
      W->stringBuilder->appendStr(sb, "\\b");
      break;
    case '\f':
      W->stringBuilder->appendStr(sb, "\\f");
      break;
    case '\n':
      W->stringBuilder->appendStr(sb, "\\n");
      break;
    case '\r':
      W->stringBuilder->appendStr(sb, "\\r");
      break;
    case '\t':
      W->stringBuilder->appendStr(sb, "\\t");
      break;
    default:
      if ((unsigned char)*p < 32) {
        char hex_buf[7];
        sprintf(hex_buf, "\\u%04x", (unsigned char)*p);
        W->stringBuilder->appendStr(sb, hex_buf);
      } else {
        W->stringBuilder->appendChar(sb, *p);
      }
      break;
    }
  }
  W->stringBuilder->appendChar(sb, '"');
  W->stringBuilder->appendStr(sb, T_RESET);
}

static void pretty_print_recursive(const Value *value, StringBuilder *sb,
                                   int indent_level) {
  if (!value) {
    W->stringBuilder->appendStr(sb, T_GRAY "null" T_RESET);
    return;
  }
  switch (W->valueGetType(value)) {
  case VALUE_NULL:
  case VALUE_UNDEFINED:
    W->stringBuilder->appendStr(sb, T_GRAY "null" T_RESET);
    break;
  case VALUE_BOOL:
    W->stringBuilder->appendStr(sb, T_YELLOW);
    W->stringBuilder->appendStr(sb, W->valueAsBool(value) ? "true" : "false");
    W->stringBuilder->appendStr(sb, T_RESET);
    break;
  case VALUE_NUMBER: {
    char num_buf[32];
    snprintf(num_buf, sizeof(num_buf), "%g", W->valueAsNumber(value));
    W->stringBuilder->appendStr(sb, T_BLUE);
    W->stringBuilder->appendStr(sb, num_buf);
    W->stringBuilder->appendStr(sb, T_RESET);
    break;
  }
  case VALUE_STRING:
    encode_pretty_string(W->valueAsString(value), sb);
    break;
  case VALUE_ARRAY:
    pretty_print_array(value, sb, indent_level);
    break;
  case VALUE_OBJECT:
    pretty_print_object(value, sb, indent_level);
    break;
  default:
    W->stringBuilder->appendStr(sb, T_GRAY "null" T_RESET);
    break;
  }
}

char *json_pretty_print(const Value *value) {
  StringBuilder sb;
  W->stringBuilder->init(&sb);
  if (!sb.buffer) {
    return strdup("/* Memory allocation failed */");
  }
  pretty_print_recursive(value, &sb, 0);
  return W->stringBuilder->toString(&sb);
}
