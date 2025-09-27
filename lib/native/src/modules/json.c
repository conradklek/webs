#include "json.h"
#include "../core/array.h"
#include "../core/boolean.h"
#include "../core/console.h"
#include "../core/map.h"
#include "../core/null.h"
#include "../core/number.h"
#include "../core/object.h"
#include "../core/string.h"
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

  Value *node = string_value(str_val);
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
  return number(num);
}

static Value *parse_literal(Parser *p) {
  if (strncmp(p->current, "true", 4) == 0) {
    p->current += 4;
    return boolean(true);
  }
  if (strncmp(p->current, "false", 5) == 0) {
    p->current += 5;
    return boolean(false);
  }
  if (strncmp(p->current, "null", 4) == 0) {
    p->current += 4;
    return null();
  }
  set_status(p, ERROR_PARSE);
  return NULL;
}

static Value *parse_array(Parser *p) {
  p->current++;

  Value *node = array_value();
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
      value_free(node);
      return NULL;
    }
    node->as.array_val->push(node->as.array_val, element);

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
        value_free(node);
        return NULL;
      }
    } else {
      set_status(p, ERROR_PARSE);
      value_free(node);
      return NULL;
    }
  }

  set_status(p, ERROR_PARSE);
  value_free(node);
  return NULL;
}

static Value *parse_object(Parser *p) {
  p->current++;

  Value *node = object_value();
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

    node->as.object_val->set(node->as.object_val, key_string, value_node);
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
  value_free(node);
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
    value_free(root);
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
      console()->error(console(),
                       "Encoder: Failed to reallocate string builder.");
      return false;
    }
    sb->buffer = new_buffer;
    sb->capacity = new_capacity;
  }
  return true;
}

static void sb_append_str(StringBuilder *sb, const char *str) {
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
  if (!sb->buffer)
    return NULL;
  char *final_str = realloc(sb->buffer, sb->length + 1);
  return final_str ? final_str : sb->buffer;
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
  sb_append_char(sb, '{');
  bool first = true;
  const Map *table = value->as.object_val->map;
  for (size_t i = 0; i < table->capacity; i++) {
    const MapEntry *entry = table->entries[i];
    while (entry) {
      if (!first) {
        sb_append_char(sb, ',');
      }
      encode_string(entry->key, sb);
      sb_append_char(sb, ':');
      encode_value(entry->value, sb);
      first = false;
      entry = entry->next;
    }
  }
  sb_append_char(sb, '}');
}

static void encode_array(const Value *value, StringBuilder *sb) {
  sb_append_char(sb, '[');
  for (size_t i = 0; i < value->as.array_val->count; i++) {
    if (i > 0) {
      sb_append_char(sb, ',');
    }
    encode_value(value->as.array_val->elements[i], sb);
  }
  sb_append_char(sb, ']');
}

static void encode_value(const Value *value, StringBuilder *sb) {
  if (!value) {
    sb_append_str(sb, "null");
    return;
  }

  switch (value->type) {
  case VALUE_NULL:
  case VALUE_UNDEFINED:
    sb_append_str(sb, "null");
    break;
  case VALUE_BOOL:
    sb_append_str(sb, value->as.boolean_val ? "true" : "false");
    break;
  case VALUE_NUMBER: {
    char num_buf[32];
    snprintf(num_buf, sizeof(num_buf), "%g", value->as.number_val);
    sb_append_str(sb, num_buf);
    break;
  }
  case VALUE_STRING:
    encode_string(value->as.string_val->chars, sb);
    break;
  case VALUE_ARRAY:
    encode_array(value, sb);
    break;
  case VALUE_OBJECT:
    encode_object(value, sb);
    break;
  case VALUE_VNODE:
  case VALUE_REF:
  case VALUE_POINTER:
  case VALUE_FREED:
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

char *value_query(const Value *root, const char *path, Status *status) {
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

    if (current->type == VALUE_OBJECT) {
      current = current->as.object_val->map->get_len(
          current->as.object_val->map, p_start, len);
    } else {
      *status = ERROR_INVALID_ARG;
      goto cleanup;
    }

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

      if (current->type != VALUE_ARRAY) {
        *status = ERROR_INVALID_ARG;
        goto cleanup;
      }
      if (index < 0 || (size_t)index >= current->as.array_val->count) {
        *status = ERROR_NOT_FOUND;
        goto cleanup;
      }
      current = current->as.array_val->elements[index];
      p_start = idx_end + 1;
    }
  }

  char *result_str = NULL;
  switch (current->type) {
  case VALUE_OBJECT:
    result_str = strdup("[Object]");
    break;
  case VALUE_ARRAY:
    result_str = strdup("[Array]");
    break;
  case VALUE_STRING:
    result_str = strdup(current->as.string_val->chars);
    break;
  case VALUE_NUMBER: {
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "%g", current->as.number_val);
    result_str = strdup(buffer);
    break;
  }
  case VALUE_BOOL:
    result_str = strdup(current->as.boolean_val ? "true" : "false");
    break;
  case VALUE_NULL:
    result_str = strdup("null");
    break;
  default:
    result_str = json_encode(current);
    break;
  }
  if (!result_str)
    *status = ERROR_MEMORY;

cleanup:
  free(path_copy);
  if (*status != OK)
    return NULL;
  return result_str;
}
