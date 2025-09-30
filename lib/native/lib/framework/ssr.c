#include "ssr.h"
#include "../core/string_builder.h"
#include "../webs_api.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void render_node_to_string(VNode *vnode, StringBuilder *sb);

static void render_attributes(VNode *vnode, StringBuilder *sb) {
  if (!vnode->props || W->valueGetType(vnode->props) != VALUE_OBJECT)
    return;
  Value *keys = W->objectKeys(vnode->props);
  if (!keys)
    return;

  for (size_t i = 0; i < W->arrayCount(keys); i++) {
    Value *key_val = W->arrayGetRef(keys, i);
    const char *key = W->valueAsString(key_val);
    Value *value = W->objectGetRef(vnode->props, key);
    if (strcmp(key, "key") == 0)
      continue;

    if (W->valueGetType(value) == VALUE_BOOL) {
      if (W->valueAsBool(value)) {
        sb_append_char(sb, ' ');
        sb_append_str(sb, key);
      }
      continue;
    }

    if (W->valueGetType(value) == VALUE_NULL ||
        W->valueGetType(value) == VALUE_UNDEFINED)
      continue;

    sb_append_char(sb, ' ');
    sb_append_str(sb, key);
    sb_append_str(sb, "=\"");
    if (W->valueGetType(value) == VALUE_STRING) {
      sb_append_html_escaped(sb, W->valueAsString(value));
    } else if (W->valueGetType(value) == VALUE_NUMBER) {
      char buffer[64];
      snprintf(buffer, sizeof(buffer), "%g", W->valueAsNumber(value));
      sb_append_str(sb, buffer);
    }
    sb_append_char(sb, '"');
  }
  W->freeValue(keys);
}

static void render_node_to_string(VNode *vnode, StringBuilder *sb) {
  if (!vnode)
    return;

  switch (vnode->node_type) {
  case VNODE_TYPE_TEXT:
    if (vnode->children && W->valueGetType(vnode->children) == VALUE_STRING)
      sb_append_html_escaped(sb, W->valueAsString(vnode->children));
    break;
  case VNODE_TYPE_FRAGMENT:
  case VNODE_TYPE_COMPONENT:
    if (vnode->children && W->valueGetType(vnode->children) == VALUE_ARRAY) {
      for (size_t i = 0; i < W->arrayCount(vnode->children); i++) {
        Value *child_wrapper = W->arrayGetRef(vnode->children, i);
        if (child_wrapper && W->valueGetType(child_wrapper) == VALUE_POINTER)
          render_node_to_string((VNode *)child_wrapper->as.pointer, sb);
      }
    }
    break;
  case VNODE_TYPE_ELEMENT: {
    sb_append_char(sb, '<');
    sb_append_str(sb, vnode->type);
    render_attributes(vnode, sb);

    const char *void_elements[] = {"area",  "base",   "br",    "col",  "embed",
                                   "hr",    "img",    "input", "link", "meta",
                                   "param", "source", "track", "wbr",  NULL};
    bool is_void = false;
    for (int i = 0; void_elements[i]; i++) {
      if (strcmp(vnode->type, void_elements[i]) == 0) {
        is_void = true;
        break;
      }
    }

    sb_append_char(sb, '>');

    if (is_void)
      break;

    if (vnode->children && W->valueGetType(vnode->children) == VALUE_ARRAY) {
      for (size_t i = 0; i < W->arrayCount(vnode->children); i++) {
        Value *child_wrapper = W->arrayGetRef(vnode->children, i);
        if (child_wrapper && W->valueGetType(child_wrapper) == VALUE_POINTER)
          render_node_to_string((VNode *)child_wrapper->as.pointer, sb);
      }
    }
    sb_append_str(sb, "</");
    sb_append_str(sb, vnode->type);
    sb_append_char(sb, '>');
    break;
  }
  case VNODE_TYPE_COMMENT:
    sb_append_str(sb, "<!--");
    if (vnode->children && W->valueGetType(vnode->children) == VALUE_STRING)
      sb_append_str(sb, W->valueAsString(vnode->children));
    sb_append_str(sb, "-->");
    break;
  }
}

char *webs_ssr_render_vnode(VNode *vnode) {
  if (!vnode)
    return strdup("<!-- Component not found -->");
  StringBuilder sb;
  sb_init(&sb);
  render_node_to_string(vnode, &sb);
  return sb_to_string(&sb);
}
