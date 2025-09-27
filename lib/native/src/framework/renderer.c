#include "renderer.h"
#include "../core/array.h"
#include "../core/object.h"
#include "../core/pointer.h"
#include "../core/string.h"
#include "../core/string_builder.h"
#include "evaluate.h"
#include "expression.h"
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
  if (!ast_children_array || ast_children_array->type != VALUE_ARRAY) {
    return array_value();
  }

  Value *vnode_children = array_value();
  for (size_t i = 0; i < ast_children_array->as.array_val->count; i++) {
    const Value *child_ast_node = ast_children_array->as.array_val->elements[i];
    VNode *child_vnode = render_node(child_ast_node, context);
    if (child_vnode) {
      vnode_children->as.array_val->push(vnode_children->as.array_val,
                                         pointer(child_vnode));
    }
  }
  return vnode_children;
}

static VNode *render_node(const Value *ast_node, const Value *context) {
  if (!ast_node || ast_node->type != VALUE_OBJECT)
    return NULL;

  const Object *ast_obj = ast_node->as.object_val;
  const Value *type_val = ast_obj->get(ast_obj, "type");
  if (!type_val || type_val->type != VALUE_STRING)
    return NULL;

  const char *type = type_val->as.string_val->chars;

  if (strcmp(type, "root") == 0) {
    const Value *ast_children = ast_obj->get(ast_obj, "children");
    Value *vnode_children = render_children(ast_children, context);

    if (vnode_children && vnode_children->type == VALUE_ARRAY &&
        vnode_children->as.array_val->count == 1) {
      Value *child_wrapper = vnode_children->as.array_val->elements[0];
      VNode *single_root = (VNode *)child_wrapper->as.pointer_val;
      child_wrapper->type = VALUE_FREED;
      value_free(vnode_children);
      return single_root;
    }

    return h("Fragment", object_value(), vnode_children);
  }

  if (strcmp(type, "element") == 0) {
    const char *tag_name =
        ast_obj->get(ast_obj, "tagName")->as.string_val->chars;
    const Value *attributes = ast_obj->get(ast_obj, "attributes");
    Value *props = object_value();
    Object *props_obj = props->as.object_val;

    if (attributes && attributes->type == VALUE_ARRAY) {
      for (size_t i = 0; i < attributes->as.array_val->count; i++) {
        const Value *attr = attributes->as.array_val->elements[i];
        const Object *attr_obj = attr->as.object_val;
        const char *attr_name =
            attr_obj->get(attr_obj, "name")->as.string_val->chars;
        const Value *attr_value = attr_obj->get(attr_obj, "value");

        if (attr_name[0] == ':') {
          Value *expr_ast = parse_expression(attr_value->as.string_val->chars);
          Value *result = evaluate_expression(expr_ast, context);
          if (result) {
            props_obj->set(props_obj, attr_name + 1, result);
          }
          value_free(expr_ast);
        } else if (attr_name[0] == '@') {
          Value *expr_ast = parse_expression(attr_value->as.string_val->chars);
          Value *result = evaluate_expression(expr_ast, context);
          if (result) {
            props_obj->set(props_obj, attr_name, result);
          }
          value_free(expr_ast);
        } else {
          props_obj->set(props_obj, attr_name, value_clone(attr_value));
        }
      }
    }

    const Value *ast_children = ast_obj->get(ast_obj, "children");
    Value *vnode_children = render_children(ast_children, context);
    return h(tag_name, props, vnode_children);
  }

  if (strcmp(type, "text") == 0) {
    const char *content =
        ast_obj->get(ast_obj, "content")->as.string_val->chars;

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
        size_t len = start - p;
        char *text_part = strndup(p, len);
        sb_append_str(&sb, text_part);
        free(text_part);
      }

      const char *end = strstr(start + 2, "}}");
      if (!end)
        break;

      char *expr_str = strndup(start + 2, end - (start + 2));
      Value *expr_ast = parse_expression(expr_str);
      Value *result = evaluate_expression(expr_ast, context);
      value_free(expr_ast);
      free(expr_str);

      if (result) {
        if (result->type == VALUE_STRING) {
          sb_append_str(&sb, result->as.string_val->chars);
        } else if (result->type == VALUE_NUMBER) {
          char buffer[64];
          snprintf(buffer, sizeof(buffer), "%g", result->as.number_val);
          sb_append_str(&sb, buffer);
        }
        value_free(result);
      }

      p = end + 2;
    }

    char *final_text = sb_to_string(&sb);
    Value *text_children = string_value(final_text);
    free(final_text);

    return h("Text", object_value(), text_children);
  }

  return NULL;
}
