#include "template.h"
#include "../webs_api.h"
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
  const WebsApi *w = webs();
  Value *node = w->object();
  if (!node)
    return NULL;
  w->objectSet(node, "type", w->string(type));
  return node;
}

static Value *new_root_node() {
  const WebsApi *w = webs();
  Value *node = new_ast_node("root");
  w->objectSet(node, "children", w->array());
  return node;
}

static Value *new_text_node(char *content) {
  const WebsApi *w = webs();
  Value *node = new_ast_node("text");
  w->objectSet(node, "content", w->string(content));
  free(content);
  return node;
}

static Value *new_comment_node(char *content) {
  const WebsApi *w = webs();
  Value *node = new_ast_node("comment");
  w->objectSet(node, "content", w->string(content));
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
  const WebsApi *w = webs();
  if (!node || w->valueGetType(node) != VALUE_OBJECT)
    return false;
  const Value *type_val = w->objectGet(node, "type");
  if (!type_val || w->valueGetType(type_val) != VALUE_STRING)
    return false;
  const char *type = w->valueAsString(type_val);
  return strcmp(type, "ifBlock") == 0 || strcmp(type, "elseIfBlock") == 0;
}

static void parse_nodes(const char **cursor, Value *parent) {
  const WebsApi *w = webs();
  Value *children_array = w->objectGet(parent, "children");
  if (!children_array || w->valueGetType(children_array) != VALUE_ARRAY)
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
      w->arrayPush(children_array, node);
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
  const WebsApi *w = webs();
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
  w->objectSet(node, "tagName", w->string(tag_name));
  w->objectSet(node, "attributes", w->array());
  w->objectSet(node, "children", w->array());
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
  const Value *tagNameValue = w->objectGet(node, "tagName");
  if (tagNameValue && w->valueGetType(tagNameValue) == VALUE_STRING) {
    for (int i = 0; void_elements[i]; ++i) {
      if (strcmp(w->valueAsString(tagNameValue), void_elements[i]) == 0) {
        is_void = true;
        break;
      }
    }
  }

  if (!self_closing && !is_void) {
    parse_nodes(cursor, node);

    if (strncmp(*cursor, "</", 2) == 0) {
      *cursor += 2;
      if (tagNameValue && w->valueGetType(tagNameValue) == VALUE_STRING) {
        *cursor += strlen(w->valueAsString(tagNameValue));
      }
      skip_whitespace(cursor);
      if (**cursor == '>')
        (*cursor)++;
    }
  }

  return node;
}

static void parse_attributes(const char **cursor, Value *element_node) {
  const WebsApi *w = webs();
  Value *attributes_array = w->objectGet(element_node, "attributes");
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
        attr_value_node = w->string(value);
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
        attr_value_node = w->string(value);
        free(value);
      }
    } else {
      attr_value_node = w->boolean(true);
    }

    Value *attr_obj = w->object();
    w->objectSet(attr_obj, "name", w->string(name));
    w->objectSet(attr_obj, "value", attr_value_node);
    w->arrayPush(attributes_array, attr_obj);

    free(name);
    skip_whitespace(cursor);
  }
}

static Value *parse_directive(const char **cursor) {
  const WebsApi *w = webs();
  const char *start_of_directive = *cursor;
  *cursor += 2;

  if (strncmp(start_of_directive, "{#if", 4) == 0) {
    *cursor += 2;
    skip_whitespace(cursor);
    char *expr = parse_until_chars(cursor, "}");
    if (**cursor == '}')
      (*cursor)++;
    Value *node = new_ast_node("ifBlock");
    w->objectSet(node, "test", w->string(expr ? expr : ""));
    w->objectSet(node, "children", w->array());
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
    w->objectSet(node, "test", w->string(expr ? expr : ""));
    w->objectSet(node, "children", w->array());
    free(expr);
    parse_nodes(cursor, node);
    return node;
  }

  if (strncmp(start_of_directive, "{:else}", 7) == 0) {
    *cursor += 5;
    Value *node = new_ast_node("elseBlock");
    w->objectSet(node, "children", w->array());
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
    w->objectSet(node, "expression", w->string(expression ? expression : ""));
    w->objectSet(node, "item", w->string(item ? item : ""));
    w->objectSet(node, "key", key ? w->string(key) : w->string("null"));
    w->objectSet(node, "children", w->array());

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
