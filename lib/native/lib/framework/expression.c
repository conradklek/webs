#include "expression.h"
#include "../webs_api.h"
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
  Value *node = W->object();
  if (!node)
    return NULL;
  W->objectSet(node, "type", W->string(type));
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
      if (strcmp(value, "true") == 0 || strcmp(value, "false") == 0)
        token.type = TOKEN_BOOLEAN;
      else if (strcmp(value, "null") == 0)
        token.type = TOKEN_NULL;
      else if (strcmp(value, "undefined") == 0)
        token.type = TOKEN_UNDEFINED;
      else
        token.type = TOKEN_IDENTIFIER;
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
    W->objectSet(node, "value", W->number(token.number_value));
    return node;
  case TOKEN_STRING:
    consume(p);
    node = new_ast_node("Literal");
    W->objectSet(node, "value", W->string(token.value));
    return node;
  case TOKEN_BOOLEAN:
    consume(p);
    node = new_ast_node("Literal");
    W->objectSet(node, "value", W->boolean(strcmp(token.value, "true") == 0));
    return node;
  case TOKEN_NULL:
    consume(p);
    node = new_ast_node("Literal");
    W->objectSet(node, "value", W->null());
    return node;
  case TOKEN_UNDEFINED:
    consume(p);
    node = new_ast_node("Literal");
    W->objectSet(node, "value", W->undefined());
    return node;
  case TOKEN_IDENTIFIER:
    consume(p);
    node = new_ast_node("Identifier");
    W->objectSet(node, "name", W->string(token.value));
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
  Value *elements = W->array();
  W->objectSet(node, "elements", elements);
  if (peek(p).type != TOKEN_RBRACKET) {
    do {
      Value *element = parse_assignment(p);
      if (!element) {
        W->freeValue(node);
        return NULL;
      }
      W->arrayPush(elements, element);
    } while (peek(p).type == TOKEN_COMMA && (consume(p), true));
  }
  if (peek(p).type != TOKEN_RBRACKET) {
    set_error(p, "Expected ']' to close array literal");
    W->freeValue(node);
    return NULL;
  }
  consume(p);
  return node;
}

static Value *parse_object_literal(Parser *p) {
  consume(p);
  Value *node = new_ast_node("ObjectLiteral");
  Value *properties = W->array();
  W->objectSet(node, "properties", properties);
  if (peek(p).type != TOKEN_RBRACE) {
    do {
      Value *prop_node = new_ast_node("Property");
      Token key_token = consume(p);
      Value *key_node;
      if (key_token.type == TOKEN_IDENTIFIER) {
        key_node = new_ast_node("Identifier");
        W->objectSet(key_node, "name", W->string(key_token.value));
      } else if (key_token.type == TOKEN_STRING) {
        key_node = new_ast_node("Literal");
        W->objectSet(key_node, "value", W->string(key_token.value));
      } else {
        set_error(
            p, "Invalid key in object literal. Expected identifier or string.");
        W->freeValue(prop_node);
        W->freeValue(node);
        return NULL;
      }
      W->objectSet(prop_node, "key", key_node);
      if (peek(p).type != TOKEN_COLON) {
        set_error(p, "Expected ':' after key in object literal.");
        W->freeValue(prop_node);
        W->freeValue(node);
        return NULL;
      }
      consume(p);
      Value *value_node = parse_assignment(p);
      if (!value_node) {
        W->freeValue(prop_node);
        W->freeValue(node);
        return NULL;
      }
      W->objectSet(prop_node, "value", value_node);
      W->arrayPush(properties, prop_node);
    } while (peek(p).type == TOKEN_COMMA && (consume(p), true));
  }
  if (peek(p).type != TOKEN_RBRACE) {
    set_error(p, "Expected '}' to close object literal");
    W->freeValue(node);
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
        W->freeValue(node);
        return NULL;
      }
      Value *new_node = new_ast_node("MemberExpression");
      W->objectSet(new_node, "object", node);
      Value *prop_node = new_ast_node("Identifier");
      W->objectSet(prop_node, "name", W->string(prop_token.value));
      W->objectSet(new_node, "property", prop_node);
      W->objectSet(new_node, "optional", W->boolean(optional));
      node = new_node;
    } else if (token.type == TOKEN_LBRACKET) {
      consume(p);
      Value *prop = parse_assignment(p);
      if (peek(p).type != TOKEN_RBRACKET) {
        set_error(p, "Expected ']'");
        W->freeValue(node);
        W->freeValue(prop);
        return NULL;
      }
      consume(p);
      Value *new_node = new_ast_node("ComputedMemberExpression");
      W->objectSet(new_node, "object", node);
      W->objectSet(new_node, "property", prop);
      W->objectSet(new_node, "optional", W->boolean(false));
      W->objectSet(new_node, "computed", W->boolean(true));
      node = new_node;
    } else if (token.type == TOKEN_LPAREN) {
      consume(p);
      Value *args = W->array();
      if (peek(p).type != TOKEN_RPAREN) {
        do {
          Value *arg = parse_assignment(p);
          if (!arg) {
            W->freeValue(args);
            W->freeValue(node);
            return NULL;
          }
          W->arrayPush(args, arg);
        } while (peek(p).type == TOKEN_COMMA && (consume(p), true));
      }
      if (peek(p).type != TOKEN_RPAREN) {
        set_error(p, "Expected ')' to close arguments");
        W->freeValue(args);
        W->freeValue(node);
        return NULL;
      }
      consume(p);
      Value *new_node = new_ast_node("CallExpression");
      W->objectSet(new_node, "callee", node);
      W->objectSet(new_node, "arguments", args);
      W->objectSet(new_node, "optional", W->boolean(false));
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
    W->objectSet(node, "operator", W->string(token.value));
    W->objectSet(node, "argument", argument);
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
      W->freeValue(left);
      return NULL;
    }
    Value *new_left = new_ast_node("BinaryExpression");
    W->objectSet(new_left, "operator", W->string(token.value));
    W->objectSet(new_left, "left", left);
    W->objectSet(new_left, "right", right);
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
      W->freeValue(test);
      return NULL;
    }
    if (peek(p).type != TOKEN_COLON) {
      set_error(p, "Expected ':' for ternary operator");
      W->freeValue(test);
      W->freeValue(consequent);
      return NULL;
    }
    consume(p);
    Value *alternate = parse_assignment(p);
    if (!alternate) {
      W->freeValue(test);
      W->freeValue(consequent);
      return NULL;
    }
    Value *node = new_ast_node("ConditionalExpression");
    W->objectSet(node, "test", test);
    W->objectSet(node, "consequent", consequent);
    W->objectSet(node, "alternate", alternate);
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
      W->freeValue(left);
      return NULL;
    }
    Value *node = new_ast_node("AssignmentExpression");
    W->objectSet(node, "left", left);
    W->objectSet(node, "right", right);
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
      W->freeValue(ast);
    return NULL;
  }
  if (p.pos < token_count) {
    set_error(&p, "Unexpected token at end of expression");
    if (ast)
      W->freeValue(ast);
    return NULL;
  }
  return ast;
}

Value *parse_expression(const char *expression, Status *status) {
  *status = OK;
  if (!expression) {
    *status = ERROR_INVALID_ARG;
    return NULL;
  }
  size_t token_count;
  Token *tokens = tokenize_expression(expression, &token_count);
  if (!tokens) {
    *status = ERROR_PARSE;
    return NULL;
  }
  const char *error = NULL;
  Value *ast = parse_expression_tokens(tokens, token_count, &error);
  free_tokens(tokens, token_count);
  if (error) {
    *status = ERROR_PARSE;
    free((void *)error);
    return NULL;
  }
  return ast;
}
