#include "expression.h"
#include "../core/array.h"
#include "../core/boolean.h"
#include "../core/map.h"
#include "../core/null.h"
#include "../core/number.h"
#include "../core/object.h"
#include "../core/string.h"
#include "../core/undefined.h"
#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef enum {
  TOKEN_IDENTIFIER,
  TOKEN_NUMBER,
  TOKEN_STRING,
  TOKEN_OPERATOR,
  TOKEN_BOOLEAN,
  TOKEN_NULL,
  TOKEN_UNDEFINED,
  TOKEN_LPAREN,
  TOKEN_RPAREN,
  TOKEN_LBRACKET,
  TOKEN_RBRACKET,
  TOKEN_LBRACE,
  TOKEN_RBRACE,
  TOKEN_COMMA,
  TOKEN_DOT,
  TOKEN_COLON,
  TOKEN_EQUALS,
  TOKEN_ARROW,
  TOKEN_BACKTICK,
  TOKEN_TEMPLATE_STRING,
  TOKEN_TEMPLATE_EXPR_START,
  TOKEN_EOF
} TokenType;

typedef struct {
  TokenType type;
  char *value;
  double number_value;
} Token;

typedef struct {
  Token *tokens;
  size_t token_count;
  size_t pos;
  const char **error;
} Parser;

static Value *parse_assignment(Parser *p);
static Value *parse_array_literal(Parser *p);
static Value *parse_object_literal(Parser *p);
static Value *parse_expression_tokens(Token *tokens, size_t token_count,
                                      const char **error);

static void set_error(Parser *p, const char *message) {
  if (p->error && !*(p->error)) {
    char *err_buf = (char *)malloc(strlen(message) + 1);
    if (err_buf) {
      strcpy(err_buf, message);
      *(p->error) = err_buf;
    }
  }
}

static void free_tokens(Token *tokens, size_t count) {
  if (!tokens)
    return;
  for (size_t i = 0; i < count; i++) {
    free(tokens[i].value);
  }
  free(tokens);
}

static Value *new_ast_node(const char *type) {
  Value *node = object_value();
  if (!node)
    return NULL;
  node->as.object->set(node->as.object, "type", string_value(type));
  return node;
}

static bool is_ident_start(char c) {
  return isalpha(c) || c == '_' || c == '$';
}

static bool is_ident_part(char c) { return isalnum(c) || c == '_' || c == '$'; }

static Token *tokenize_expression(const char *expression, size_t *token_count) {
  size_t capacity = 256;
  Token *tokens = malloc(sizeof(Token) * capacity);
  *token_count = 0;

  const char *c = expression;
  while (*c) {
    if (*token_count >= capacity) {
      capacity *= 2;
      tokens = realloc(tokens, sizeof(Token) * capacity);
    }

    if (isspace(*c)) {
      c++;
      continue;
    }

    Token token = {0};

    if (is_ident_start(*c)) {
      const char *start = c;
      while (is_ident_part(*c))
        c++;
      size_t len = c - start;
      char *value = strndup(start, len);

      if (strcmp(value, "true") == 0 || strcmp(value, "false") == 0) {
        token.type = TOKEN_BOOLEAN;
      } else if (strcmp(value, "null") == 0) {
        token.type = TOKEN_NULL;
      } else if (strcmp(value, "undefined") == 0) {
        token.type = TOKEN_UNDEFINED;
      } else {
        token.type = TOKEN_IDENTIFIER;
      }
      token.value = value;
    } else if (isdigit(*c) || (*c == '.' && isdigit(*(c + 1)))) {
      const char *start = c;
      char *end;
      token.number_value = strtod(start, &end);
      c = end;
      token.type = TOKEN_NUMBER;
    } else if (*c == '\'' || *c == '"') {
      char quote = *c++;
      const char *start = c;
      while (*c && *c != quote) {
        if (*c == '\\')
          c++;
        c++;
      }
      size_t len = c - start;
      char *value = malloc(len + 1);
      strncpy(value, start, len);
      value[len] = '\0';

      token.type = TOKEN_STRING;
      token.value = value;
      if (*c == quote)
        c++;
    } else if (strncmp(c, "===", 3) == 0 || strncmp(c, "!==", 3) == 0) {
      token.type = TOKEN_OPERATOR;
      token.value = strndup(c, 3);
      c += 3;
    } else if (strncmp(c, "==", 2) == 0 || strncmp(c, "!=", 2) == 0 ||
               strncmp(c, "<=", 2) == 0 || strncmp(c, ">=", 2) == 0 ||
               strncmp(c, "&&", 2) == 0 || strncmp(c, "||", 2) == 0 ||
               strncmp(c, "??", 2) == 0 || strncmp(c, "?.", 2) == 0) {
      token.type = TOKEN_OPERATOR;
      token.value = strndup(c, 2);
      c += 2;
    } else if (strncmp(c, "=>", 2) == 0) {
      token.type = TOKEN_ARROW;
      token.value = strndup(c, 2);
      c += 2;
    } else if (strchr("+-*/%<>&|!?=", *c)) {
      if (*c == '=')
        token.type = TOKEN_EQUALS;
      else
        token.type = TOKEN_OPERATOR;
      token.value = strndup(c, 1);
      c++;
    } else if (strchr("()[]{},.:", *c)) {
      char val = *c;
      token.value = strndup(c, 1);
      c++;
      switch (val) {
      case '(':
        token.type = TOKEN_LPAREN;
        break;
      case ')':
        token.type = TOKEN_RPAREN;
        break;
      case '[':
        token.type = TOKEN_LBRACKET;
        break;
      case ']':
        token.type = TOKEN_RBRACKET;
        break;
      case '{':
        token.type = TOKEN_LBRACE;
        break;
      case '}':
        token.type = TOKEN_RBRACE;
        break;
      case ',':
        token.type = TOKEN_COMMA;
        break;
      case '.':
        token.type = TOKEN_DOT;
        break;
      case ':':
        token.type = TOKEN_COLON;
        break;
      }
    } else {
      free_tokens(tokens, *token_count);
      *token_count = 0;
      return NULL;
    }

    tokens[(*token_count)++] = token;
  }

  tokens[*token_count] = (Token){.type = TOKEN_EOF};
  return tokens;
}

static Token peek(Parser *p) { return p->tokens[p->pos]; }

static Token consume(Parser *p) { return p->tokens[p->pos++]; }

static Value *parse_primary(Parser *p) {
  Token token = peek(p);
  Value *node = NULL;

  switch (token.type) {
  case TOKEN_NUMBER:
    consume(p);
    node = new_ast_node("Literal");
    node->as.object->set(node->as.object, "value", number(token.number_value));
    return node;
  case TOKEN_STRING:
    consume(p);
    node = new_ast_node("Literal");
    node->as.object->set(node->as.object, "value", string_value(token.value));
    return node;
  case TOKEN_BOOLEAN:
    consume(p);
    node = new_ast_node("Literal");
    node->as.object->set(node->as.object, "value",
                         boolean(strcmp(token.value, "true") == 0));
    return node;
  case TOKEN_NULL:
    consume(p);
    node = new_ast_node("Literal");
    node->as.object->set(node->as.object, "value", null());
    return node;
  case TOKEN_UNDEFINED:
    consume(p);
    node = new_ast_node("Literal");
    node->as.object->set(node->as.object, "value", undefined());
    return node;
  case TOKEN_IDENTIFIER:
    consume(p);
    node = new_ast_node("Identifier");
    node->as.object->set(node->as.object, "name", string_value(token.value));
    return node;
  case TOKEN_LPAREN:
    consume(p);
    node = parse_assignment(p);
    if (peek(p).type != TOKEN_RPAREN) {
      set_error(p, "Expected ')'");
      return NULL;
    }
    consume(p);
    return node;
  case TOKEN_LBRACKET:
    return parse_array_literal(p);
  case TOKEN_LBRACE:
    return parse_object_literal(p);
  default:
    set_error(p, "Unexpected token in expression");
    return NULL;
  }
}

static Value *parse_array_literal(Parser *p) {
  consume(p);
  Value *node = new_ast_node("ArrayLiteral");
  Value *elements = array_value();
  node->as.object->set(node->as.object, "elements", elements);

  if (peek(p).type != TOKEN_RBRACKET) {
    do {
      Value *element = parse_assignment(p);
      if (!element) {
        value_free(node);
        return NULL;
      }
      elements->as.array->push(elements->as.array, element);
    } while (peek(p).type == TOKEN_COMMA && (consume(p), true));
  }

  if (peek(p).type != TOKEN_RBRACKET) {
    set_error(p, "Expected ']' to close array literal");
    value_free(node);
    return NULL;
  }
  consume(p);
  return node;
}

static Value *parse_object_literal(Parser *p) {
  consume(p);
  Value *node = new_ast_node("ObjectLiteral");
  Value *properties = array_value();
  node->as.object->set(node->as.object, "properties", properties);

  if (peek(p).type != TOKEN_RBRACE) {
    do {
      Value *prop_node = new_ast_node("Property");
      Token key_token = consume(p);
      Value *key_node;

      if (key_token.type == TOKEN_IDENTIFIER) {
        key_node = new_ast_node("Identifier");
        key_node->as.object->set(key_node->as.object, "name",
                                 string_value(key_token.value));
      } else if (key_token.type == TOKEN_STRING) {
        key_node = new_ast_node("Literal");
        key_node->as.object->set(key_node->as.object, "value",
                                 string_value(key_token.value));
      } else {
        set_error(p, "Invalid key in object literal. Expected identifier or "
                     "string.");
        value_free(prop_node);
        value_free(node);
        return NULL;
      }
      prop_node->as.object->set(prop_node->as.object, "key", key_node);

      if (peek(p).type != TOKEN_COLON) {
        set_error(p, "Expected ':' after key in object literal.");
        value_free(prop_node);
        value_free(node);
        return NULL;
      }
      consume(p);

      Value *value_node = parse_assignment(p);
      if (!value_node) {
        value_free(prop_node);
        value_free(node);
        return NULL;
      }
      prop_node->as.object->set(prop_node->as.object, "value", value_node);
      properties->as.array->push(properties->as.array, prop_node);
    } while (peek(p).type == TOKEN_COMMA && (consume(p), true));
  }

  if (peek(p).type != TOKEN_RBRACE) {
    set_error(p, "Expected '}' to close object literal");
    value_free(node);
    return NULL;
  }
  consume(p);
  return node;
}

static Value *parse_accessors(Parser *p) {
  Value *node = parse_primary(p);
  if (!node)
    return NULL;

  while (true) {
    Token token = peek(p);
    bool optional = false;

    if (token.type == TOKEN_DOT ||
        (token.type == TOKEN_OPERATOR && strcmp(token.value, "?.") == 0)) {
      if (strcmp(token.value, "?.") == 0)
        optional = true;
      consume(p);

      Token prop_token = consume(p);
      if (prop_token.type != TOKEN_IDENTIFIER) {
        set_error(p, "Expected identifier after '.' or '?.'");
        value_free(node);
        return NULL;
      }

      Value *new_node = new_ast_node("MemberExpression");
      Object *new_node_obj = new_node->as.object;
      new_node_obj->set(new_node_obj, "object", node);

      Value *prop_node = new_ast_node("Identifier");
      prop_node->as.object->set(prop_node->as.object, "name",
                                string_value(prop_token.value));
      new_node_obj->set(new_node_obj, "property", prop_node);
      new_node_obj->set(new_node_obj, "optional", boolean(optional));
      node = new_node;
    } else if (token.type == TOKEN_LBRACKET) {
      consume(p);
      Value *prop = parse_assignment(p);
      if (peek(p).type != TOKEN_RBRACKET) {
        set_error(p, "Expected ']'");
        value_free(node);
        value_free(prop);
        return NULL;
      }
      consume(p);
      Value *new_node = new_ast_node("ComputedMemberExpression");
      Object *new_node_obj = new_node->as.object;
      new_node_obj->set(new_node_obj, "object", node);
      new_node_obj->set(new_node_obj, "property", prop);
      new_node_obj->set(new_node_obj, "optional", boolean(false));
      new_node_obj->set(new_node_obj, "computed", boolean(true));
      node = new_node;

    } else if (token.type == TOKEN_LPAREN) {
      consume(p);
      Value *args = array_value();
      if (peek(p).type != TOKEN_RPAREN) {
        do {
          Value *arg = parse_assignment(p);
          if (!arg) {
            value_free(args);
            value_free(node);
            return NULL;
          }
          args->as.array->push(args->as.array, arg);
        } while (peek(p).type == TOKEN_COMMA && (consume(p), true));
      }
      if (peek(p).type != TOKEN_RPAREN) {
        set_error(p, "Expected ')' to close arguments");
        value_free(args);
        value_free(node);
        return NULL;
      }
      consume(p);
      Value *new_node = new_ast_node("CallExpression");
      Object *new_node_obj = new_node->as.object;
      new_node_obj->set(new_node_obj, "callee", node);
      new_node_obj->set(new_node_obj, "arguments", args);
      new_node_obj->set(new_node_obj, "optional", boolean(false));
      node = new_node;
    } else {
      break;
    }
  }
  return node;
}

static Value *parse_unary(Parser *p) {
  Token token = peek(p);
  if (token.type == TOKEN_OPERATOR &&
      (strcmp(token.value, "!") == 0 || strcmp(token.value, "-") == 0)) {
    consume(p);
    Value *argument = parse_unary(p);
    if (!argument)
      return NULL;

    Value *node = new_ast_node("UnaryExpression");
    Object *node_obj = node->as.object;
    node_obj->set(node_obj, "operator", string_value(token.value));
    node_obj->set(node_obj, "argument", argument);
    return node;
  }
  return parse_accessors(p);
}

static Value *parse_binary(Parser *p, Value *(*next_parser)(Parser *),
                           const char **operators, int op_count) {
  Value *left = next_parser(p);
  if (!left)
    return NULL;

  Token token = peek(p);
  while (token.type == TOKEN_OPERATOR) {
    bool is_op = false;
    for (int i = 0; i < op_count; ++i) {
      if (strcmp(token.value, operators[i]) == 0) {
        is_op = true;
        break;
      }
    }
    if (!is_op)
      break;

    consume(p);
    Value *right = next_parser(p);
    if (!right) {
      value_free(left);
      return NULL;
    }
    Value *new_left = new_ast_node("BinaryExpression");
    Object *new_left_obj = new_left->as.object;
    new_left_obj->set(new_left_obj, "operator", string_value(token.value));
    new_left_obj->set(new_left_obj, "left", left);
    new_left_obj->set(new_left_obj, "right", right);
    left = new_left;
    token = peek(p);
  }
  return left;
}

static Value *parse_multiplicative(Parser *p) {
  const char *ops[] = {"*", "/", "%"};
  return parse_binary(p, parse_unary, ops, 3);
}

static Value *parse_additive(Parser *p) {
  const char *ops[] = {"+", "-"};
  return parse_binary(p, parse_multiplicative, ops, 2);
}

static Value *parse_comparison(Parser *p) {
  const char *ops[] = {"<", ">", "<=", ">="};
  return parse_binary(p, parse_additive, ops, 4);
}

static Value *parse_equality(Parser *p) {
  const char *ops[] = {"==", "!=", "===", "!=="};
  return parse_binary(p, parse_comparison, ops, 4);
}

static Value *parse_logical_and(Parser *p) {
  const char *ops[] = {"&&"};
  return parse_binary(p, parse_equality, ops, 1);
}

static Value *parse_logical_or(Parser *p) {
  const char *ops[] = {"||"};
  return parse_binary(p, parse_logical_and, ops, 1);
}

static Value *parse_nullish_coalescing(Parser *p) {
  const char *ops[] = {"??"};
  return parse_binary(p, parse_logical_or, ops, 1);
}

static Value *parse_conditional(Parser *p) {
  Value *test = parse_nullish_coalescing(p);
  if (!test)
    return NULL;

  if (peek(p).type == TOKEN_OPERATOR && strcmp(peek(p).value, "?") == 0) {
    consume(p);
    Value *consequent = parse_assignment(p);
    if (!consequent) {
      value_free(test);
      return NULL;
    }

    if (peek(p).type != TOKEN_COLON) {
      set_error(p, "Expected ':' for ternary operator");
      value_free(test);
      value_free(consequent);
      return NULL;
    }
    consume(p);
    Value *alternate = parse_assignment(p);
    if (!alternate) {
      value_free(test);
      value_free(consequent);
      return NULL;
    }

    Value *node = new_ast_node("ConditionalExpression");
    Object *node_obj = node->as.object;
    node_obj->set(node_obj, "test", test);
    node_obj->set(node_obj, "consequent", consequent);
    node_obj->set(node_obj, "alternate", alternate);
    return node;
  }
  return test;
}

static Value *parse_assignment(Parser *p) {
  Value *left = parse_conditional(p);
  if (!left)
    return NULL;

  if (peek(p).type == TOKEN_EQUALS) {
    consume(p);

    Value *right = parse_assignment(p);
    if (!right) {
      value_free(left);
      return NULL;
    }

    Value *node = new_ast_node("AssignmentExpression");
    Object *node_obj = node->as.object;
    node_obj->set(node_obj, "left", left);
    node_obj->set(node_obj, "right", right);
    return node;
  }

  return left;
}

static Value *parse_expression_tokens(Token *tokens, size_t token_count,
                                      const char **error) {
  if (!tokens || token_count == 0) {
    Parser p = {.error = error};
    set_error(&p, "Cannot parse empty expression");
    return NULL;
  }

  Parser p = {
      .tokens = tokens, .token_count = token_count, .pos = 0, .error = error};
  Value *ast = parse_assignment(&p);

  if (*error) {
    if (ast)
      value_free(ast);
    return NULL;
  }

  if (p.pos < token_count) {
    set_error(&p, "Unexpected token at end of expression");
    if (ast)
      value_free(ast);
    return NULL;
  }

  return ast;
}

Value *parse_expression(const char *expression) {
  if (!expression)
    return NULL;

  size_t token_count;
  Token *tokens = tokenize_expression(expression, &token_count);
  if (!tokens) {
    return NULL;
  }

  const char *error = NULL;
  Value *ast = parse_expression_tokens(tokens, token_count, &error);

  free_tokens(tokens, token_count);

  if (error) {
    free((void *)error);
    return NULL;
  }

  return ast;
}
