#include "template.h"
#include "../core/array.h"
#include "../core/boolean.h"
#include "../core/map.h"
#include "../core/object.h"
#include "../core/string.h"
#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void parse_nodes(const char **cursor, Value *parent);
static Value *parse_node(const char **cursor);
static Value *parse_element(const char **cursor);
static Value *parse_directive(const char **cursor);
static Value *parse_text(const char **cursor);
static void parse_attributes(const char **cursor, Value *element_node);
static char *parse_until_chars(const char **cursor, const char *delimiters);
static void skip_whitespace(const char **cursor);

static Value *new_ast_node(const char *type) {
  Value *node = object_value();
  if (!node)
    return NULL;
  node->as.object_val->set(node->as.object_val, "type", string_value(type));
  return node;
}

static Value *new_root_node() {
  Value *node = new_ast_node("root");
  node->as.object_val->set(node->as.object_val, "children", array_value());
  return node;
}

static Value *new_text_node(char *content) {
  Value *node = new_ast_node("text");
  node->as.object_val->set(node->as.object_val, "content",
                           string_value(content));
  free(content);
  return node;
}

static Value *new_comment_node(char *content) {
  Value *node = new_ast_node("comment");
  node->as.object_val->set(node->as.object_val, "content",
                           string_value(content));
  free(content);
  return node;
}

Value *webs_template_parse(const char *html) {
  const char *cursor = html;
  Value *root = new_root_node();
  if (!root)
    return NULL;
  parse_nodes(&cursor, root);
  return root;
}

static bool is_if_family(const Value *node) {
  if (!node || node->type != VALUE_OBJECT)
    return false;
  const Value *type_val = node->as.object_val->get(node->as.object_val, "type");
  if (!type_val || type_val->type != VALUE_STRING)
    return false;
  const char *type = type_val->as.string_val->chars;
  return strcmp(type, "ifBlock") == 0 || strcmp(type, "elseIfBlock") == 0;
}

static void parse_nodes(const char **cursor, Value *parent) {
  Value *children_array =
      parent->as.object_val->get(parent->as.object_val, "children");
  if (!children_array || children_array->type != VALUE_ARRAY)
    return;

  bool in_if_block_context = is_if_family(parent);

  while (**cursor) {
    skip_whitespace(cursor);
    if (!**cursor)
      break;

    if (strncmp(*cursor, "</", 2) == 0)
      break;
    if (strncmp(*cursor, "{/if}", 5) == 0)
      break;
    if (strncmp(*cursor, "{/each}", 7) == 0)
      break;

    if (in_if_block_context) {
      if (strncmp(*cursor, "{:else}", 7) == 0)
        break;
      if (strncmp(*cursor, "{:else if", 9) == 0)
        break;
    }

    Value *node = parse_node(cursor);
    if (node) {
      children_array->as.array_val->push(children_array->as.array_val, node);
    }
  }
}

static Value *parse_node(const char **cursor) {
  if (**cursor == '<') {
    return parse_element(cursor);
  } else if (**cursor == '{') {
    if (*(*cursor + 1) == '#' || *(*cursor + 1) == ':' ||
        *(*cursor + 1) == '/') {
      return parse_directive(cursor);
    }
  }
  return parse_text(cursor);
}

static Value *parse_text(const char **cursor) {
  const char *start = *cursor;
  const char *p = start;
  while (*p) {
    if (*p == '<')
      break;
    if (*p == '{' && (*(p + 1) == '#' || *(p + 1) == ':' || *(p + 1) == '/'))
      break;
    p++;
  }

  if (p == start)
    return NULL;

  size_t len = p - start;
  char *text_content = malloc(len + 1);
  if (!text_content)
    return NULL;

  strncpy(text_content, start, len);
  text_content[len] = '\0';
  *cursor = p;

  const char *ws_check = text_content;
  bool only_whitespace = true;
  while (*ws_check) {
    if (!isspace((unsigned char)*ws_check++)) {
      only_whitespace = false;
      break;
    }
  }

  if (only_whitespace) {
    free(text_content);
    return NULL;
  }

  return new_text_node(text_content);
}

static void skip_whitespace(const char **cursor) {
  while (**cursor && isspace((unsigned char)**cursor)) {
    (*cursor)++;
  }
}

static char *parse_until_chars(const char **cursor, const char *delimiters) {
  const char *start = *cursor;
  const char *end = strpbrk(start, delimiters);

  if (!end) {
    end = start + strlen(start);
  }

  if (end == start)
    return NULL;

  size_t len = end - start;
  char *result = malloc(len + 1);
  if (!result)
    return NULL;

  strncpy(result, start, len);
  result[len] = '\0';
  *cursor = end;
  return result;
}

static Value *parse_element(const char **cursor) {
  (*cursor)++;

  if (strncmp(*cursor, "!--", 3) == 0) {
    *cursor += 3;
    const char *comment_start = *cursor;
    const char *comment_end = strstr(comment_start, "-->");
    if (!comment_end)
      return NULL;

    size_t len = comment_end - comment_start;
    char *content = malloc(len + 1);
    strncpy(content, comment_start, len);
    content[len] = '\0';
    *cursor = comment_end + 3;
    return new_comment_node(content);
  }

  const char *tag_name_start = *cursor;
  while (isalnum((unsigned char)**cursor) || **cursor == '-')
    (*cursor)++;

  size_t name_len = *cursor - tag_name_start;
  if (name_len == 0)
    return NULL;

  char *tag_name = malloc(name_len + 1);
  strncpy(tag_name, tag_name_start, name_len);
  tag_name[name_len] = '\0';

  Value *node = new_ast_node("element");
  Object *node_obj = node->as.object_val;
  node_obj->set(node_obj, "tagName", string_value(tag_name));
  node_obj->set(node_obj, "attributes", array_value());
  node_obj->set(node_obj, "children", array_value());
  free(tag_name);

  parse_attributes(cursor, node);

  bool self_closing = false;
  if (**cursor == '/') {
    self_closing = true;
    (*cursor)++;
  }
  if (**cursor == '>') {
    (*cursor)++;
  }

  const char *void_elements[] = {"area",  "base",   "br",    "col",  "embed",
                                 "hr",    "img",    "input", "link", "meta",
                                 "param", "source", "track", "wbr",  NULL};
  bool is_void = false;
  const Value *tagNameValue = node_obj->get(node_obj, "tagName");
  if (tagNameValue && tagNameValue->type == VALUE_STRING) {
    for (int i = 0; void_elements[i]; ++i) {
      if (strcmp(tagNameValue->as.string_val->chars, void_elements[i]) == 0) {
        is_void = true;
        break;
      }
    }
  }

  if (!self_closing && !is_void) {
    parse_nodes(cursor, node);

    if (strncmp(*cursor, "</", 2) == 0) {
      *cursor += 2;
      if (tagNameValue && tagNameValue->type == VALUE_STRING) {
        *cursor += strlen(tagNameValue->as.string_val->chars);
      }
      skip_whitespace(cursor);
      if (**cursor == '>')
        (*cursor)++;
    }
  }

  return node;
}

static void parse_attributes(const char **cursor, Value *element_node) {
  Value *attributes_array = element_node->as.object_val->get(
      element_node->as.object_val, "attributes");
  skip_whitespace(cursor);

  while (**cursor && **cursor != '>' && **cursor != '/') {
    const char *name_start = *cursor;
    while (**cursor && !isspace((unsigned char)**cursor) && **cursor != '=' &&
           **cursor != '>' && **cursor != '/') {
      (*cursor)++;
    }
    size_t name_len = *cursor - name_start;
    if (name_len == 0) {
      skip_whitespace(cursor);
      continue;
    }
    char *name = malloc(name_len + 1);
    strncpy(name, name_start, name_len);
    name[name_len] = '\0';

    Value *attr_value_node;
    skip_whitespace(cursor);

    if (**cursor == '=') {
      (*cursor)++;
      skip_whitespace(cursor);
      char quote = **cursor;
      if (quote == '"' || quote == '\'') {
        (*cursor)++;
        const char *value_start = *cursor;
        while (**cursor && **cursor != quote) {
          (*cursor)++;
        }
        size_t value_len = *cursor - value_start;
        char *value = malloc(value_len + 1);
        strncpy(value, value_start, value_len);
        value[value_len] = '\0';
        attr_value_node = string_value(value);
        free(value);
        if (**cursor == quote)
          (*cursor)++;
      } else {
        const char *value_start = *cursor;
        while (**cursor && !isspace((unsigned char)**cursor) && **cursor != '>')
          (*cursor)++;
        size_t value_len = *cursor - value_start;
        char *value = malloc(value_len + 1);
        strncpy(value, value_start, value_len);
        value[value_len] = '\0';
        attr_value_node = string_value(value);
        free(value);
      }
    } else {
      attr_value_node = boolean(true);
    }

    Value *attr_obj = object_value();
    Object *attr_obj_val = attr_obj->as.object_val;
    attr_obj_val->set(attr_obj_val, "name", string_value(name));
    attr_obj_val->set(attr_obj_val, "value", attr_value_node);
    attributes_array->as.array_val->push(attributes_array->as.array_val,
                                         attr_obj);

    free(name);
    skip_whitespace(cursor);
  }
}

static Value *parse_directive(const char **cursor) {
  const char *start_of_directive = *cursor;
  *cursor += 2;

  if (strncmp(start_of_directive, "{#if", 4) == 0) {
    *cursor += 2;
    skip_whitespace(cursor);
    char *expr = parse_until_chars(cursor, "}");
    if (**cursor == '}')
      (*cursor)++;
    Value *node = new_ast_node("ifBlock");
    Object *node_obj = node->as.object_val;
    node_obj->set(node_obj, "test", string_value(expr ? expr : ""));
    node_obj->set(node_obj, "children", array_value());
    free(expr);
    parse_nodes(cursor, node);
    return node;
  }

  if (strncmp(start_of_directive, "{:else if", 9) == 0) {
    *cursor += 7;
    skip_whitespace(cursor);
    char *expr = parse_until_chars(cursor, "}");
    if (**cursor == '}')
      (*cursor)++;
    Value *node = new_ast_node("elseIfBlock");
    Object *node_obj = node->as.object_val;
    node_obj->set(node_obj, "test", string_value(expr ? expr : ""));
    node_obj->set(node_obj, "children", array_value());
    free(expr);
    parse_nodes(cursor, node);
    return node;
  }

  if (strncmp(start_of_directive, "{:else}", 7) == 0) {
    *cursor += 5;
    Value *node = new_ast_node("elseBlock");
    node->as.object_val->set(node->as.object_val, "children", array_value());
    parse_nodes(cursor, node);
    return node;
  }

  if (strncmp(start_of_directive, "{#each", 6) == 0) {
    *cursor += 4;
    skip_whitespace(cursor);
    char *expression = parse_until_chars(cursor, " ");
    skip_whitespace(cursor);
    if (strncmp(*cursor, "as", 2) == 0)
      *cursor += 2;
    skip_whitespace(cursor);
    char *item = parse_until_chars(cursor, " (})");
    char *key = NULL;
    skip_whitespace(cursor);
    if (**cursor == '(') {
      (*cursor)++;
      skip_whitespace(cursor);
      key = parse_until_chars(cursor, ")");
      if (**cursor == ')')
        (*cursor)++;
    }
    while (**cursor && **cursor != '}')
      (*cursor)++;
    if (**cursor == '}')
      (*cursor)++;

    Value *node = new_ast_node("eachBlock");
    Object *node_obj = node->as.object_val;
    node_obj->set(node_obj, "expression",
                  string_value(expression ? expression : ""));
    node_obj->set(node_obj, "item", string_value(item ? item : ""));
    node_obj->set(node_obj, "key",
                  key ? string_value(key) : string_value("null"));
    node_obj->set(node_obj, "children", array_value());

    free(expression);
    free(item);
    if (key)
      free(key);

    parse_nodes(cursor, node);
    if (strncmp(*cursor, "{/each}", 7) == 0) {
      *cursor += 7;
    }
    return node;
  }

  if (strncmp(start_of_directive, "{/if}", 5) == 0) {
    *cursor += 3;
    return NULL;
  }

  if (strncmp(start_of_directive, "{/each}", 7) == 0) {
    *cursor += 5;
    return NULL;
  }

  *cursor = start_of_directive;
  return NULL;
}
