#include "ssr.h"
#include "../core/string_builder.h"
#include "../webs_api.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void render_node_to_string(VNode *vnode, StringBuilder *sb);

static void render_attributes(VNode *vnode, StringBuilder *sb) {
  const WebsApi *w = webs();
  if (!vnode->props || w->valueGetType(vnode->props) != VALUE_OBJECT) {
    return;
  }

  Value *keys = w->objectKeys(vnode->props);
  if (!keys)
    return;

  for (size_t i = 0; i < w->arrayCount(keys); i++) {
    Value *key_val = w->arrayGet(keys, i);
    const char *key = w->valueAsString(key_val);
    Value *value = w->objectGet(vnode->props, key);

    if (strcmp(key, "key") == 0) {
      continue;
    }

    if (w->valueGetType(value) == VALUE_BOOL) {
      if (w->valueAsBool(value)) {
        sb_append_char(sb, ' ');
        sb_append_str(sb, key);
      }
      continue;
    }

    if (w->valueGetType(value) == VALUE_NULL) {
      continue;
    }

    sb_append_char(sb, ' ');
    sb_append_str(sb, key);
    sb_append_str(sb, "=\"");

    if (w->valueGetType(value) == VALUE_STRING) {
      sb_append_html_escaped(sb, w->valueAsString(value));
    } else if (w->valueGetType(value) == VALUE_NUMBER) {
      char buffer[64];
      snprintf(buffer, sizeof(buffer), "%g", w->valueAsNumber(value));
      sb_append_str(sb, buffer);
    }
    sb_append_char(sb, '"');
  }

  w->freeValue(keys);
}

static void render_node_to_string(VNode *vnode, StringBuilder *sb) {
  const WebsApi *w = webs();
  if (!vnode) {
    return;
  }

  switch (vnode->node_type) {
  case VNODE_TYPE_TEXT:
    if (vnode->children && w->valueGetType(vnode->children) == VALUE_STRING) {
      sb_append_html_escaped(sb, w->valueAsString(vnode->children));
    }
    break;

  case VNODE_TYPE_FRAGMENT:
  case VNODE_TYPE_COMPONENT:
    if (vnode->children && w->valueGetType(vnode->children) == VALUE_ARRAY) {
      for (size_t i = 0; i < w->arrayCount(vnode->children); i++) {
        Value *child_wrapper = w->arrayGet(vnode->children, i);
        if (child_wrapper && w->valueGetType(child_wrapper) == VALUE_POINTER) {
          render_node_to_string((VNode *)child_wrapper->as.pointer, sb);
        }
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

    if (is_void) {
      sb_append_str(sb, "/>");
      break;
    }

    sb_append_char(sb, '>');

    if (vnode->children && w->valueGetType(vnode->children) == VALUE_ARRAY) {
      for (size_t i = 0; i < w->arrayCount(vnode->children); i++) {
        Value *child_wrapper = w->arrayGet(vnode->children, i);
        if (child_wrapper && w->valueGetType(child_wrapper) == VALUE_POINTER) {
          render_node_to_string((VNode *)child_wrapper->as.pointer, sb);
        }
      }
    }
    sb_append_str(sb, "</");
    sb_append_str(sb, vnode->type);
    sb_append_char(sb, '>');
    break;
  }

  case VNODE_TYPE_COMMENT:
    sb_append_str(sb, "<!--");
    if (vnode->children && w->valueGetType(vnode->children) == VALUE_STRING) {
      sb_append_str(sb, w->valueAsString(vnode->children));
    }
    sb_append_str(sb, "-->");
    break;
  }
}

char *webs_ssr_render_vnode(VNode *vnode) {
  StringBuilder sb;
  sb_init(&sb);
  render_node_to_string(vnode, &sb);
  return sb_to_string(&sb);
}
