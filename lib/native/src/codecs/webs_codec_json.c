#include "webs_codec_json.h"
#include "../core/webs_hash.h"
#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  const char *current;
  const char *start;
  char **error;
} Parser;

static WebsValue *parse_value(Parser *p);

static int webs_realloc_safe(void **ptr, size_t new_size) {
  void *new_ptr = realloc(*ptr, new_size);
  if (!new_ptr && new_size > 0) {
    fprintf(stderr, "Webs Parser: Memory reallocation failed.\n");
    return 0;
  }
  *ptr = new_ptr;
  return 1;
}

static WebsValue *create_node(WebsValueType type) {
  WebsValue *node = (WebsValue *)calloc(1, sizeof(WebsValue));
  if (!node) {
    fprintf(stderr, "Webs Parser: Failed to allocate memory for WebsValue.\n");
    return NULL;
  }
  node->type = type;
  return node;
}

static void set_error(Parser *p, const char *message) {
  if (p->error && !*p->error) {
    int line = 1;
    int col = 1;
    const char *temp = p->start;
    while (temp < p->current) {
      if (*temp == '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      temp++;
    }
    char *err_buf = (char *)malloc(256);
    if (err_buf) {
      snprintf(err_buf, 256, "Error at line %d, col %d: %s", line, col,
               message);
      *p->error = err_buf;
    }
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
    set_error(p, "Unterminated string literal.");
    return NULL;
  }

  char *unescaped_str = (char *)malloc(end - start + 1);
  if (!unescaped_str) {
    fprintf(stderr,
            "Webs Parser: Memory allocation failed for unescaped string.\n");
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

static WebsValue *parse_string(Parser *p) {
  char *str_val = parse_allocated_string(p);
  if (!str_val)
    return NULL;

  WebsValue *node = create_node(WEBS_VALUE_STRING);
  if (!node) {
    free(str_val);
    return NULL;
  }
  node->value.string_val = str_val;
  return node;
}

static WebsValue *parse_number(Parser *p) {
  const char *start = p->current;
  if (*p->current == '-')
    p->current++;
  while (isdigit((unsigned char)*p->current))
    p->current++;
  if (*p->current == '.') {
    p->current++;
    while (isdigit((unsigned char)*p->current))
      p->current++;
  }
  if (*p->current == 'e' || *p->current == 'E') {
    p->current++;
    if (*p->current == '+' || *p->current == '-')
      p->current++;
    if (!isdigit((unsigned char)*p->current)) {
      set_error(p, "Invalid number format (exponent).");
      return NULL;
    }
    while (isdigit((unsigned char)*p->current))
      p->current++;
  }

  WebsValue *node = create_node(WEBS_VALUE_NUMBER);
  if (!node)
    return NULL;

  size_t len = p->current - start;
  char *num_str = malloc(len + 1);
  if (!num_str) {
    free(node);
    return NULL;
  }
  memcpy(num_str, start, len);
  num_str[len] = '\0';

  node->value.number_val = strtod(num_str, NULL);
  free(num_str);

  return node;
}

static WebsValue *parse_literal(Parser *p) {
  WebsValue *node;
  if (strncmp(p->current, "true", 4) == 0) {
    p->current += 4;
    node = create_node(WEBS_VALUE_BOOL);
    if (!node)
      return NULL;
    node->value.bool_val = true;
    return node;
  }
  if (strncmp(p->current, "false", 5) == 0) {
    p->current += 5;
    node = create_node(WEBS_VALUE_BOOL);
    if (!node)
      return NULL;
    node->value.bool_val = false;
    return node;
  }
  if (strncmp(p->current, "null", 4) == 0) {
    p->current += 4;
    return create_node(WEBS_VALUE_NULL);
  }
  set_error(p, "Invalid literal.");
  return NULL;
}

static WebsValue *parse_array(Parser *p) {
  p->current++;

  WebsValue *node = create_node(WEBS_VALUE_ARRAY);
  if (!node)
    return NULL;

  node->value.array_val.capacity = 8;
  node->value.array_val.count = 0;
  node->value.array_val.elements =
      malloc(sizeof(WebsValue *) * node->value.array_val.capacity);
  if (!node->value.array_val.elements) {
    free(node);
    return NULL;
  }

  skip_whitespace(p);
  if (*p->current == ']') {
    p->current++;
    return node;
  }

  while (*p->current) {
    WebsValue *element = parse_value(p);
    if (!element) {
      webs_value_free(node);
      return NULL;
    }

    if (node->value.array_val.count >= node->value.array_val.capacity) {
      node->value.array_val.capacity *= 2;
      if (!webs_realloc_safe((void **)&node->value.array_val.elements,
                             sizeof(WebsValue *) *
                                 node->value.array_val.capacity)) {
        webs_value_free(element);
        webs_value_free(node);
        return NULL;
      }
    }
    node->value.array_val.elements[node->value.array_val.count++] = element;

    skip_whitespace(p);
    if (*p->current == ']') {
      p->current++;
      return node;
    }
    if (*p->current == ',') {
      p->current++;
      skip_whitespace(p);
      if (*p->current == ']') {
        set_error(p, "Trailing comma in array.");
        webs_value_free(node);
        return NULL;
      }
    } else {
      set_error(p, "Expected ',' or ']' in array.");
      webs_value_free(node);
      return NULL;
    }
  }

  set_error(p, "Unterminated array.");
  webs_value_free(node);
  return NULL;
}

static WebsValue *parse_object(Parser *p) {
  p->current++;

  WebsValue *node = create_node(WEBS_VALUE_OBJECT);
  if (!node)
    return NULL;

  node->value.object_val.table = webs_hash_create(8);
  if (!node->value.object_val.table) {
    free(node);
    return NULL;
  }

  skip_whitespace(p);
  if (*p->current == '}') {
    p->current++;
    return node;
  }

  while (*p->current) {
    if (*p->current != '"') {
      set_error(p, "Expected string key in object.");
      webs_value_free(node);
      return NULL;
    }

    char *key_string = parse_allocated_string(p);
    if (!key_string) {
      webs_value_free(node);
      return NULL;
    }

    skip_whitespace(p);
    if (*p->current != ':') {
      set_error(p, "Expected ':' after key in object.");
      free(key_string);
      webs_value_free(node);
      return NULL;
    }
    p->current++;

    WebsValue *value_node = parse_value(p);
    if (!value_node) {
      free(key_string);
      webs_value_free(node);
      return NULL;
    }

    webs_hash_set(node->value.object_val.table, key_string, value_node);
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
        set_error(p, "Trailing comma in object.");
        webs_value_free(node);
        return NULL;
      }
    } else {
      set_error(p, "Expected ',' or '}' in object.");
      webs_value_free(node);
      return NULL;
    }
  }

  set_error(p, "Unterminated object.");
  webs_value_free(node);
  return NULL;
}

static WebsValue *parse_value(Parser *p) {
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
    set_error(p, "Invalid JSON value.");
    return NULL;
  }
}

WebsValue *webs_json_decode(const char *json_string, char **error) {
  Parser p = {.current = json_string, .start = json_string, .error = error};
  if (error) {
    *error = NULL;
  }

  WebsValue *root = parse_value(&p);

  if (!root && (!error || !*error)) {
    set_error(&p, "Memory allocation failed during parsing.");
  }

  if (root && (!error || !*error)) {
    skip_whitespace(&p);
    if (*p.current != '\0') {
      set_error(&p, "Extra content after top-level value.");
      webs_value_free(root);
      return NULL;
    }
  }

  if (error && *error && root) {
    webs_value_free(root);
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
      fprintf(stderr, "Webs Encoder: Failed to reallocate string builder.\n");
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

static void webs_encode_value(const WebsValue *value, StringBuilder *sb);

static void webs_encode_string(const char *str, StringBuilder *sb) {
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

static void webs_encode_object(const WebsValue *value, StringBuilder *sb) {
  sb_append_char(sb, '{');
  bool first = true;
  WebsHashTable *table = value->value.object_val.table;
  for (size_t i = 0; i < table->capacity; i++) {
    WebsHashEntry *entry = table->entries[i];
    while (entry) {
      if (!first) {
        sb_append_char(sb, ',');
      }
      webs_encode_string(entry->key, sb);
      sb_append_char(sb, ':');
      webs_encode_value(entry->value, sb);
      first = false;
      entry = entry->next;
    }
  }
  sb_append_char(sb, '}');
}

static void webs_encode_array(const WebsValue *value, StringBuilder *sb) {
  sb_append_char(sb, '[');
  for (size_t i = 0; i < value->value.array_val.count; i++) {
    if (i > 0) {
      sb_append_char(sb, ',');
    }
    webs_encode_value(value->value.array_val.elements[i], sb);
  }
  sb_append_char(sb, ']');
}

static void webs_encode_value(const WebsValue *value, StringBuilder *sb) {
  if (!value) {
    sb_append_str(sb, "null");
    return;
  }

  switch (value->type) {
  case WEBS_VALUE_NULL:
    sb_append_str(sb, "null");
    break;
  case WEBS_VALUE_BOOL:
    sb_append_str(sb, value->value.bool_val ? "true" : "false");
    break;
  case WEBS_VALUE_NUMBER: {
    char num_buf[32];
    snprintf(num_buf, sizeof(num_buf), "%g", value->value.number_val);
    sb_append_str(sb, num_buf);
    break;
  }
  case WEBS_VALUE_STRING:
    webs_encode_string(value->value.string_val, sb);
    break;
  case WEBS_VALUE_ARRAY:
    webs_encode_array(value, sb);
    break;
  case WEBS_VALUE_OBJECT:
    webs_encode_object(value, sb);
    break;
  }
}

char *webs_json_encode(const WebsValue *value) {
  StringBuilder sb;
  sb_init(&sb, 1024);
  if (!sb.buffer)
    return NULL;

  webs_encode_value(value, &sb);

  return sb_to_string(&sb);
}
