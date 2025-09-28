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
  const WebsApi *w = webs();
  char *str_val = parse_allocated_string(p);
  if (!str_val)
    return NULL;

  Value *node = w->string(str_val);
  free(str_val);
  if (!node) {
    set_status(p, ERROR_MEMORY);
  }
  return node;
}

static Value *parse_number(Parser *p) {
  const WebsApi *w = webs();
  const char *start = p->current;
  char *end;
  double num = strtod(start, &end);
  if (end == start) {
    set_status(p, ERROR_PARSE);
    return NULL;
  }
  p->current = end;
  return w->number(num);
}

static Value *parse_literal(Parser *p) {
  const WebsApi *w = webs();
  if (strncmp(p->current, "true", 4) == 0) {
    p->current += 4;
    return w->boolean(true);
  }
  if (strncmp(p->current, "false", 5) == 0) {
    p->current += 5;
    return w->boolean(false);
  }
  if (strncmp(p->current, "null", 4) == 0) {
    p->current += 4;
    return w->null();
  }
  set_status(p, ERROR_PARSE);
  return NULL;
}

static Value *parse_array(Parser *p) {
  const WebsApi *w = webs();
  p->current++;

  Value *node = w->array();
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
      w->freeValue(node);
      return NULL;
    }
    w->arrayPush(node, element);

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
        w->freeValue(node);
        return NULL;
      }
    } else {
      set_status(p, ERROR_PARSE);
      w->freeValue(node);
      return NULL;
    }
  }

  set_status(p, ERROR_PARSE);
  w->freeValue(node);
  return NULL;
}

static Value *parse_object(Parser *p) {
  const WebsApi *w = webs();
  p->current++;

  Value *node = w->object();
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

    w->objectSet(node, key_string, value_node);
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
  w->freeValue(node);
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
  const WebsApi *w = webs();
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
    w->freeValue(root);
    return NULL;
  }

  return root;
}

typedef struct {
  char *buffer;
  size_t length;
  size_t capacity;
} StringBuilder;

static void sb_init(StringBuilder *sb, size_t initial_capacity) {
  sb->capacity = initial_capacity > 0 ? initial_capacity : 256;
  sb->buffer = malloc(sb->capacity);
  if (sb->buffer) {
    sb->buffer[0] = '\0';
  }
  sb->length = 0;
}

static bool sb_ensure_capacity(StringBuilder *sb, size_t additional_length) {
  if (!sb->buffer)
    return false;
  if (sb->length + additional_length >= sb->capacity) {
    size_t new_capacity = sb->capacity;
    while (new_capacity <= sb->length + additional_length) {
      new_capacity *= 2;
    }
    char *new_buffer = realloc(sb->buffer, new_capacity);
    if (!new_buffer) {
      webs()->log->error("Encoder: Failed to reallocate string builder.");
      return false;
    }
    sb->buffer = new_buffer;
    sb->capacity = new_capacity;
  }
  return true;
}

static void sb_append_str(StringBuilder *sb, const char *str) {
  if (!str)
    return;
  size_t len = strlen(str);
  if (!sb_ensure_capacity(sb, len))
    return;
  memcpy(sb->buffer + sb->length, str, len);
  sb->length += len;
  sb->buffer[sb->length] = '\0';
}

static void sb_append_char(StringBuilder *sb, char c) {
  if (!sb_ensure_capacity(sb, 1))
    return;
  sb->buffer[sb->length++] = c;
  sb->buffer[sb->length] = '\0';
}

static char *sb_to_string(StringBuilder *sb) {
  if (!sb || !sb->buffer)
    return NULL;
  char *result = realloc(sb->buffer, sb->length + 1);
  if (result) {
    result[sb->length] = '\0';
  }
  sb->buffer = NULL;
  sb->length = 0;
  sb->capacity = 0;
  return result;
}

static void encode_value(const Value *value, StringBuilder *sb);

static void encode_string(const char *str, StringBuilder *sb) {
  sb_append_char(sb, '"');
  for (const char *p = str; *p; p++) {
    switch (*p) {
    case '"':
      sb_append_str(sb, "\\\"");
      break;
    case '\\':
      sb_append_str(sb, "\\\\");
      break;
    case '\b':
      sb_append_str(sb, "\\b");
      break;
    case '\f':
      sb_append_str(sb, "\\f");
      break;
    case '\n':
      sb_append_str(sb, "\\n");
      break;
    case '\r':
      sb_append_str(sb, "\\r");
      break;
    case '\t':
      sb_append_str(sb, "\\t");
      break;
    default:
      if ((unsigned char)*p < 32) {
        char hex_buf[7];
        sprintf(hex_buf, "\\u%04x", (unsigned char)*p);
        sb_append_str(sb, hex_buf);
      } else {
        sb_append_char(sb, *p);
      }
      break;
    }
  }
  sb_append_char(sb, '"');
}

static void encode_object(const Value *value, StringBuilder *sb) {
  const WebsApi *w = webs();
  sb_append_char(sb, '{');
  Value *keys = w->objectKeys(value);
  if (keys) {
    size_t key_count = w->arrayCount(keys);
    for (size_t i = 0; i < key_count; i++) {
      if (i > 0) {
        sb_append_char(sb, ',');
      }
      Value *key_val = w->arrayGet(keys, i);
      const char *key_str = w->valueAsString(key_val);
      encode_string(key_str, sb);
      sb_append_char(sb, ':');
      encode_value(w->objectGet(value, key_str), sb);
    }
    w->freeValue(keys);
  }
  sb_append_char(sb, '}');
}

static void encode_array(const Value *value, StringBuilder *sb) {
  const WebsApi *w = webs();
  sb_append_char(sb, '[');
  size_t count = w->arrayCount(value);
  for (size_t i = 0; i < count; i++) {
    if (i > 0) {
      sb_append_char(sb, ',');
    }
    encode_value(w->arrayGet(value, i), sb);
  }
  sb_append_char(sb, ']');
}

static void encode_value(const Value *value, StringBuilder *sb) {
  const WebsApi *w = webs();
  if (!value) {
    sb_append_str(sb, "null");
    return;
  }

  switch (w->valueGetType(value)) {
  case VALUE_BOOL:
    sb_append_str(sb, w->valueAsBool(value) ? "true" : "false");
    break;
  case VALUE_NUMBER: {
    char num_buf[32];
    snprintf(num_buf, sizeof(num_buf), "%g", w->valueAsNumber(value));
    sb_append_str(sb, num_buf);
    break;
  }
  case VALUE_STRING:
    encode_string(w->valueAsString(value), sb);
    break;
  case VALUE_ARRAY:
    encode_array(value, sb);
    break;
  case VALUE_OBJECT:
    encode_object(value, sb);
    break;
  default: // NULL, UNDEFINED, POINTER, etc.
    sb_append_str(sb, "null");
    break;
  }
}

char *json_encode(const Value *value) {
  StringBuilder sb;
  sb_init(&sb, 1024);
  if (!sb.buffer)
    return NULL;
  encode_value(value, &sb);
  return sb_to_string(&sb);
}

Value *value_query(const Value *root, const char *path, Status *status) {
  const WebsApi *w = webs();
  *status = OK;
  const Value *current = root;
  char *path_copy = strdup(path);
  if (!path_copy) {
    *status = ERROR_MEMORY;
    return NULL;
  }
  char *p_start = path_copy;

  while (*p_start && current) {
    if (*p_start == '.') {
      p_start++;
    }

    char *p_end = strpbrk(p_start, ".[]");
    size_t len = p_end ? (size_t)(p_end - p_start) : strlen(p_start);
    char *key_part = strndup(p_start, len);

    if (w->valueGetType(current) == VALUE_OBJECT) {
      current = w->objectGet(current, key_part);
    } else {
      *status = ERROR_INVALID_ARG;
      free(key_part);
      goto cleanup;
    }
    free(key_part);

    if (!current) {
      *status = ERROR_NOT_FOUND;
      goto cleanup;
    }

    p_start = p_end ? p_end : p_start + len;

    while (*p_start == '[') {
      p_start++;
      char *idx_end = strchr(p_start, ']');
      if (!idx_end) {
        *status = ERROR_PARSE;
        goto cleanup;
      }
      *idx_end = '\0';

      char *endptr;
      long index = strtol(p_start, &endptr, 10);
      if (*endptr != '\0') {
        *status = ERROR_PARSE;
        goto cleanup;
      }

      if (w->valueGetType(current) != VALUE_ARRAY) {
        *status = ERROR_INVALID_ARG;
        goto cleanup;
      }
      if (index < 0 || (size_t)index >= w->arrayCount(current)) {
        *status = ERROR_NOT_FOUND;
        goto cleanup;
      }
      current = w->arrayGet(current, index);
      p_start = idx_end + 1;
    }
  }

  // REASON: Instead of creating a string representation, we return a deep clone
  // of the found value. If no value is found, we will return NULL (after
  // cleanup).
  Value *result_val = NULL;
  if (*status == OK && current) {
    result_val = w->valueClone(current);
    if (!result_val) {
      *status = ERROR_MEMORY;
    }
  }

cleanup:
  free(path_copy);
  // If an error occurred, ensure we don't return a value.
  if (*status != OK) {
    if (result_val)
      w->freeValue(result_val);
    return NULL;
  }
  return result_val;
}

static void append_indent(StringBuilder *sb, int level) {
  for (int i = 0; i < level; i++) {
    sb_append_str(sb, "  ");
  }
}

static void pretty_print_recursive(const Value *value, StringBuilder *sb,
                                   int indent_level);

static void pretty_print_object(const Value *value, StringBuilder *sb,
                                int indent_level) {
  const WebsApi *w = webs();
  sb_append_str(sb, "{\r\n");

  Value *keys = w->objectKeys(value);
  if (keys) {
    size_t key_count = w->arrayCount(keys);
    for (size_t i = 0; i < key_count; i++) {
      if (i > 0) {
        sb_append_str(sb, ",\r\n");
      }
      append_indent(sb, indent_level + 1);

      Value *key_val = w->arrayGet(keys, i);
      const char *key_str = w->valueAsString(key_val);

      sb_append_str(sb, T_YELLOW);
      sb_append_char(sb, '"');
      sb_append_str(sb, key_str);
      sb_append_char(sb, '"');
      sb_append_str(sb, T_RESET);

      sb_append_str(sb, ": ");
      pretty_print_recursive(w->objectGet(value, key_str), sb,
                             indent_level + 1);
    }
    w->freeValue(keys);
    if (key_count > 0) {
      sb_append_str(sb, "\r\n");
    }
  }

  append_indent(sb, indent_level);
  sb_append_char(sb, '}');
}

static void pretty_print_array(const Value *value, StringBuilder *sb,
                               int indent_level) {
  const WebsApi *w = webs();
  size_t count = w->arrayCount(value);
  if (count == 0) {
    sb_append_str(sb, "[]");
    return;
  }
  sb_append_str(sb, "[\r\n");
  for (size_t i = 0; i < count; i++) {
    append_indent(sb, indent_level + 1);
    pretty_print_recursive(w->arrayGet(value, i), sb, indent_level + 1);
    if (i < count - 1) {
      sb_append_str(sb, ",\r\n");
    }
  }
  sb_append_str(sb, "\r\n");
  append_indent(sb, indent_level);
  sb_append_char(sb, ']');
}

static void encode_pretty_string(const char *str, StringBuilder *sb) {
  sb_append_str(sb, T_GREEN);
  sb_append_char(sb, '"');
  for (const char *p = str; *p; p++) {
    switch (*p) {
    case '"':
      sb_append_str(sb, "\\\"");
      break;
    case '\\':
      sb_append_str(sb, "\\\\");
      break;
    case '\b':
      sb_append_str(sb, "\\b");
      break;
    case '\f':
      sb_append_str(sb, "\\f");
      break;
    case '\n':
      sb_append_str(sb, "\\n");
      break;
    case '\r':
      sb_append_str(sb, "\\r");
      break;
    case '\t':
      sb_append_str(sb, "\\t");
      break;
    default:
      if ((unsigned char)*p < 32) {
        char hex_buf[7];
        sprintf(hex_buf, "\\u%04x", (unsigned char)*p);
        sb_append_str(sb, hex_buf);
      } else {
        sb_append_char(sb, *p);
      }
      break;
    }
  }
  sb_append_char(sb, '"');
  sb_append_str(sb, T_RESET);
}

static void pretty_print_recursive(const Value *value, StringBuilder *sb,
                                   int indent_level) {
  const WebsApi *w = webs();
  if (!value) {
    sb_append_str(sb, T_GRAY "null" T_RESET);
    return;
  }

  switch (w->valueGetType(value)) {
  case VALUE_NULL:
  case VALUE_UNDEFINED:
    sb_append_str(sb, T_GRAY "null" T_RESET);
    break;
  case VALUE_BOOL:
    sb_append_str(sb, T_YELLOW);
    sb_append_str(sb, w->valueAsBool(value) ? "true" : "false");
    sb_append_str(sb, T_RESET);
    break;
  case VALUE_NUMBER: {
    char num_buf[32];
    snprintf(num_buf, sizeof(num_buf), "%g", w->valueAsNumber(value));
    sb_append_str(sb, T_BLUE);
    sb_append_str(sb, num_buf);
    sb_append_str(sb, T_RESET);
    break;
  }
  case VALUE_STRING:
    encode_pretty_string(w->valueAsString(value), sb);
    break;
  case VALUE_ARRAY:
    pretty_print_array(value, sb, indent_level);
    break;
  case VALUE_OBJECT:
    pretty_print_object(value, sb, indent_level);
    break;
  default:
    sb_append_str(sb, T_GRAY "null" T_RESET);
    break;
  }
}

char *json_pretty_print(const Value *value) {
  StringBuilder sb;
  sb_init(&sb, 1024);
  if (!sb.buffer) {
    return strdup("/* Memory allocation failed */");
  }

  pretty_print_recursive(value, &sb, 0);

  return sb_to_string(&sb);
}
