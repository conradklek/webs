#include "renderer.h"
#include "../core/string_builder.h"
#include "../webs_api.h"
#include "evaluate.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static VNode *render_node(const Value *ast_node, const Value *context);
static Value *render_children(const Value *ast_children_array,
                              const Value *context);

VNode *render_template(const Value *template_ast, const Value *context) {
  if (!template_ast)
    return NULL;
  return render_node(template_ast, context);
}

static Value *render_children(const Value *ast_children_array,
                              const Value *context) {
  const WebsApi *w = webs();
  if (!ast_children_array ||
      w->valueGetType(ast_children_array) != VALUE_ARRAY) {
    return w->array();
  }

  Value *vnode_children = w->array();
  for (size_t i = 0; i < w->arrayCount(ast_children_array); i++) {
    const Value *child_ast_node = w->arrayGet(ast_children_array, i);
    VNode *child_vnode = render_node(child_ast_node, context);
    if (child_vnode) {
      w->arrayPush(vnode_children, w->pointer(child_vnode));
    }
  }
  return vnode_children;
}

static VNode *render_node(const Value *ast_node, const Value *context) {
  const WebsApi *w = webs();
  if (!ast_node || w->valueGetType(ast_node) != VALUE_OBJECT)
    return NULL;

  const Value *type_val = w->objectGet(ast_node, "type");
  if (!type_val || w->valueGetType(type_val) != VALUE_STRING)
    return NULL;

  const char *type = w->valueAsString(type_val);

  if (strcmp(type, "root") == 0) {
    const Value *ast_children = w->objectGet(ast_node, "children");
    Value *vnode_children = render_children(ast_children, context);

    if (vnode_children && w->valueGetType(vnode_children) == VALUE_ARRAY &&
        w->arrayCount(vnode_children) == 1) {
      Value *child_wrapper = w->arrayGet(vnode_children, 0);
      VNode *single_root = (VNode *)child_wrapper->as.pointer;
      child_wrapper->type = VALUE_FREED;
      w->freeValue(vnode_children);
      return single_root;
    }

    return w->h("Fragment", w->object(), vnode_children);
  }

  if (strcmp(type, "element") == 0) {
    const char *tag_name = w->valueAsString(w->objectGet(ast_node, "tagName"));
    const Value *attributes = w->objectGet(ast_node, "attributes");
    Value *props = w->object();

    if (attributes && w->valueGetType(attributes) == VALUE_ARRAY) {
      for (size_t i = 0; i < w->arrayCount(attributes); i++) {
        const Value *attr = w->arrayGet(attributes, i);
        const char *attr_name = w->valueAsString(w->objectGet(attr, "name"));
        const Value *attr_value = w->objectGet(attr, "value");

        if (attr_name[0] == ':' || attr_name[0] == '@') {
          Value *expr_ast = w->parseExpression(w->valueAsString(attr_value));
          Value *result = evaluate_expression(expr_ast, context);
          if (result) {
            w->objectSet(props, attr_name[0] == ':' ? attr_name + 1 : attr_name,
                         result);
          }
          w->freeValue(expr_ast);
        } else {
          w->objectSet(props, attr_name, w->valueClone(attr_value));
        }
      }
    }

    const Value *ast_children = w->objectGet(ast_node, "children");
    Value *vnode_children = render_children(ast_children, context);
    return w->h(tag_name, props, vnode_children);
  }

  if (strcmp(type, "text") == 0) {
    const char *content = w->valueAsString(w->objectGet(ast_node, "content"));

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
      Value *expr_ast = w->parseExpression(expr_str);
      Value *result = evaluate_expression(expr_ast, context);
      w->freeValue(expr_ast);
      free(expr_str);

      if (result) {
        if (w->valueGetType(result) == VALUE_STRING) {
          sb_append_str(&sb, w->valueAsString(result));
        } else if (w->valueGetType(result) == VALUE_NUMBER) {
          char buffer[64];
          snprintf(buffer, sizeof(buffer), "%g", w->valueAsNumber(result));
          sb_append_str(&sb, buffer);
        }
        w->freeValue(result);
      }

      p = end + 2;
    }

    char *final_text = sb_to_string(&sb);
    Value *text_children = w->string(final_text);
    free(final_text);

    return w->h("Text", w->object(), text_children);
  }

  return NULL;
}
