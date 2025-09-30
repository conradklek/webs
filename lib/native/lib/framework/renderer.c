#include "renderer.h"
#include "../core/string.h"
#include "../core/string_builder.h"
#include "../webs_api.h"
#include "evaluate.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static VNode *render_node(const Value *ast_node, const Value *context,
                          const Value *ast_parent_children_array,
                          size_t *child_idx);
static Value *render_children(const Value *ast_children_array,
                              const Value *context);

VNode *render_template(const Value *template_ast, const Value *context) {
  if (!template_ast)
    return NULL;
  return render_node(template_ast, context, NULL, NULL);
}

static Value *render_children(const Value *ast_children_array,
                              const Value *context) {
  if (!ast_children_array ||
      W->valueGetType(ast_children_array) != VALUE_ARRAY) {
    return W->array();
  }

  Value *vnode_children = W->array();
  for (size_t i = 0; i < W->arrayCount(ast_children_array);) {
    const Value *child_ast_node = W->arrayGetRef(ast_children_array, i);
    size_t current_i = i;
    VNode *child_vnode =
        render_node(child_ast_node, context, ast_children_array, &i);

    if (i == current_i) {
      i++;
    }

    if (child_vnode) {
      W->arrayPush(vnode_children, W->pointer(child_vnode));
    }
  }
  return vnode_children;
}

static bool is_truthy(const Value *val) {
  if (!val)
    return false;
  switch (val->type) {
  case VALUE_NULL:
  case VALUE_UNDEFINED:
    return false;
  case VALUE_BOOL:
    return val->as.boolean;
  case VALUE_NUMBER:
    return val->as.number != 0;
  case VALUE_STRING:
    return val->as.string && val->as.string->length > 0;
  default:
    return true;
  }
}

static VNode *render_node(const Value *ast_node, const Value *context,
                          const Value *ast_parent_children_array,
                          size_t *child_idx) {
  Status parse_status;

  if (!ast_node || W->valueGetType(ast_node) != VALUE_OBJECT)
    return NULL;

  const Value *type_val = W->objectGetRef(ast_node, "type");
  if (!type_val || W->valueGetType(type_val) != VALUE_STRING)
    return NULL;

  const char *type = W->valueAsString(type_val);

  if (strcmp(type, "ifBlock") == 0 || strcmp(type, "elseIfBlock") == 0) {
    const Value *test_expr_str_val = W->objectGetRef(ast_node, "test");
    Value *expr_ast =
        W->parseExpression(W->valueAsString(test_expr_str_val), &parse_status);
    Value *result = evaluate_expression(expr_ast, context);
    bool is_true = is_truthy(result);
    W->freeValue(expr_ast);
    W->freeValue(result);

    if (is_true) {
      const Value *children = W->objectGetRef(ast_node, "children");

      if (ast_parent_children_array && child_idx) {
        while (*child_idx + 1 < W->arrayCount(ast_parent_children_array)) {
          const Value *next_node =
              W->arrayGetRef(ast_parent_children_array, *child_idx + 1);
          const Value *next_type_val = W->objectGetRef(next_node, "type");
          if (next_type_val && W->valueGetType(next_type_val) == VALUE_STRING) {
            const char *next_type = W->valueAsString(next_type_val);
            if (strcmp(next_type, "elseIfBlock") == 0 ||
                strcmp(next_type, "elseBlock") == 0) {
              (*child_idx)++;
            } else {
              break;
            }
          } else {
            break;
          }
        }
      }
      return W->h("Fragment", W->object(), render_children(children, context));
    } else if (ast_parent_children_array && child_idx &&
               (*child_idx + 1) < W->arrayCount(ast_parent_children_array)) {
      const Value *next_node =
          W->arrayGetRef(ast_parent_children_array, *child_idx + 1);
      const Value *next_type_val = W->objectGetRef(next_node, "type");
      if (next_type_val && W->valueGetType(next_type_val) == VALUE_STRING) {
        const char *next_type = W->valueAsString(next_type_val);
        if (strcmp(next_type, "elseIfBlock") == 0 ||
            strcmp(next_type, "elseBlock") == 0) {
          (*child_idx)++;
          return render_node(next_node, context, ast_parent_children_array,
                             child_idx);
        }
      }
    }

    Value *comment_content = W->string("w-if");
    VNode *comment_vnode = vnode_new(VNODE_TYPE_COMMENT, "Comment", W->object(),
                                     W->object(), comment_content);

    Value *children_array = W->array();
    W->arrayPush(children_array, W->pointer(comment_vnode));
    return W->h("Fragment", W->object(), children_array);
  }

  if (strcmp(type, "eachBlock") == 0) {
    const char *expression_str =
        W->valueAsString(W->objectGetRef(ast_node, "expression"));
    const char *item_name = W->valueAsString(W->objectGetRef(ast_node, "item"));
    const Value *key_val = W->objectGetRef(ast_node, "key");
    const char *key_expr_str = W->valueAsString(key_val);
    const Value *ast_children = W->objectGetRef(ast_node, "children");

    Value *expr_ast = W->parseExpression(expression_str, &parse_status);
    Value *list_val = evaluate_expression(expr_ast, context);
    W->freeValue(expr_ast);

    if (!list_val || W->valueGetType(list_val) != VALUE_ARRAY) {
      if (list_val)
        W->freeValue(list_val);
      return W->h("Fragment", W->object(), W->array());
    }

    Value *fragment_children = W->array();

    for (size_t i = 0; i < W->arrayCount(list_val); i++) {
      Value *item_val = W->arrayGetRef(list_val, i);

      Value *item_context = W->valueClone(context);
      if (!item_context)
        continue;

      W->objectSet(item_context, item_name, W->valueClone(item_val));

      Value *vnodes = render_children(ast_children, item_context);

      for (size_t j = 0; j < W->arrayCount(vnodes); j++) {
        Value *child_wrapper = W->arrayGetRef(vnodes, j);
        VNode *child_vnode = (VNode *)child_wrapper->as.pointer;

        if (strcmp(key_expr_str, "null") != 0 &&
            strcmp(key_expr_str, "") != 0) {
          Value *key_expr_ast = W->parseExpression(key_expr_str, &parse_status);
          Value *key_result = evaluate_expression(key_expr_ast, item_context);
          W->freeValue(key_expr_ast);

          if (key_result) {
            W->objectSet(child_vnode->props, "key", key_result);
          }
        }

        W->arrayPush(fragment_children, W->valueClone(child_wrapper));
      }

      W->freeValue(vnodes);
      W->freeValue(item_context);
    }

    W->freeValue(list_val);
    return W->h("Fragment", W->object(), fragment_children);
  }

  if (strcmp(type, "elseBlock") == 0) {
    const Value *children = W->objectGetRef(ast_node, "children");
    return W->h("Fragment", W->object(), render_children(children, context));
  }

  if (strcmp(type, "root") == 0) {
    const Value *ast_children = W->objectGetRef(ast_node, "children");
    Value *vnode_children = render_children(ast_children, context);

    if (!vnode_children || W->valueGetType(vnode_children) != VALUE_ARRAY) {
      return NULL;
    }

    if (W->arrayCount(vnode_children) == 1) {
      Value *child_wrapper = W->arrayGetRef(vnode_children, 0);
      if (child_wrapper && W->valueGetType(child_wrapper) == VALUE_POINTER) {
        VNode *single_root = (VNode *)child_wrapper->as.pointer;
        child_wrapper->type = VALUE_FREED;
        W->freeValue(vnode_children);
        return single_root;
      }
    }

    return W->h("Fragment", W->object(), vnode_children);
  }

  if (strcmp(type, "element") == 0) {
    const char *tag_name =
        W->valueAsString(W->objectGetRef(ast_node, "tagName"));
    const Value *attributes = W->objectGetRef(ast_node, "attributes");
    Value *props = W->object();

    if (attributes && W->valueGetType(attributes) == VALUE_ARRAY) {
      for (size_t i = 0; i < W->arrayCount(attributes); i++) {
        const Value *attr = W->arrayGetRef(attributes, i);
        const char *attr_name = W->valueAsString(W->objectGetRef(attr, "name"));
        const Value *attr_value = W->objectGetRef(attr, "value");

        if (attr_name[0] == ':') {
          Value *expr_ast =
              W->parseExpression(W->valueAsString(attr_value), &parse_status);
          Value *result = evaluate_expression(expr_ast, context);
          if (result) {
            W->objectSet(props, attr_name + 1, result);
          }
          W->freeValue(expr_ast);
        } else {
          W->objectSet(props, attr_name, W->valueClone(attr_value));
        }
      }
    }

    const Value *ast_children = W->objectGetRef(ast_node, "children");
    Value *vnode_children = render_children(ast_children, context);
    return W->h(tag_name, props, vnode_children);
  }

  if (strcmp(type, "text") == 0) {
    const char *content =
        W->valueAsString(W->objectGetRef(ast_node, "content"));

    StringBuilder sb;
    sb_init(&sb);
    const char *p = content;

    while (*p) {
      const char *start = strstr(p, "{{");
      if (!start) {
        sb_append_str(&sb, p);
        break;
      }

      if (start > p) {
        char *text_part = strndup(p, start - p);
        sb_append_str(&sb, text_part);
        free(text_part);
      }

      const char *end = strstr(start + 2, "}}");
      if (!end) {
        sb_append_str(&sb, start);
        break;
      }

      char *expr_str = strndup(start + 2, end - (start + 2));
      Value *expr_ast = W->parseExpression(expr_str, &parse_status);
      Value *result = evaluate_expression(expr_ast, context);
      W->freeValue(expr_ast);
      free(expr_str);

      if (result) {
        if (W->valueGetType(result) == VALUE_STRING) {
          sb_append_str(&sb, W->valueAsString(result));
        } else if (W->valueGetType(result) == VALUE_NUMBER) {
          char buffer[64];
          snprintf(buffer, sizeof(buffer), "%g", W->valueAsNumber(result));
          sb_append_str(&sb, buffer);
        }
        W->freeValue(result);
      }

      p = end + 2;
    }

    char *final_text = sb_to_string(&sb);
    Value *text_children = W->string(final_text);
    free(final_text);

    return W->h("Text", W->object(), text_children);
  }

  if (strcmp(type, "comment") == 0) {
    const char *content =
        W->valueAsString(W->objectGetRef(ast_node, "content"));

    Value *comment_content = W->string(content);
    return vnode_new(VNODE_TYPE_COMMENT, "Comment", W->object(), W->object(),
                     comment_content);
  }

  return NULL;
}
