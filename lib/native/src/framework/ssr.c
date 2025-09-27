#include "ssr.h"
#include "../core/array.h"
#include "../core/map.h"
#include "../core/object.h"
#include "../core/string.h"
#include "../core/string_builder.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void render_node_to_string(VNode *vnode, StringBuilder *sb);

static void render_attributes(VNode *vnode, StringBuilder *sb) {
  if (!vnode->props || vnode->props->type != VALUE_OBJECT)
    return;

  Map *table = vnode->props->as.object_val->map;
  for (size_t i = 0; i < table->capacity; i++) {
    for (MapEntry *entry = table->entries[i]; entry; entry = entry->next) {
      if (strcmp(entry->key, "key") == 0)
        continue;

      if (entry->value->type == VALUE_BOOL) {
        if (entry->value->as.boolean_val) {
          sb_append_char(sb, ' ');
          sb_append_str(sb, entry->key);
        }
        continue;
      }

      if (entry->value->type == VALUE_NULL) {
        continue;
      }

      sb_append_char(sb, ' ');
      sb_append_str(sb, entry->key);
      sb_append_str(sb, "=\"");

      if (entry->value->type == VALUE_STRING) {
        sb_append_html_escaped(sb, entry->value->as.string_val->chars);
      } else if (entry->value->type == VALUE_NUMBER) {
        char buffer[64];
        snprintf(buffer, sizeof(buffer), "%g", entry->value->as.number_val);
        sb_append_str(sb, buffer);
      }
      sb_append_char(sb, '"');
    }
  }
}

static void render_node_to_string(VNode *vnode, StringBuilder *sb) {
  if (!vnode)
    return;

  switch (vnode->node_type) {
  case VNODE_TYPE_TEXT:
    if (vnode->children && vnode->children->type == VALUE_STRING) {
      sb_append_html_escaped(sb, vnode->children->as.string_val->chars);
    }
    break;

  case VNODE_TYPE_FRAGMENT:
  case VNODE_TYPE_COMPONENT:
    if (vnode->children && vnode->children->type == VALUE_ARRAY) {
      for (size_t i = 0; i < vnode->children->as.array_val->count; i++) {
        Value *child_wrapper = vnode->children->as.array_val->elements[i];
        if (child_wrapper && child_wrapper->type == VALUE_POINTER) {
          render_node_to_string((VNode *)child_wrapper->as.pointer_val, sb);
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

    if (vnode->children && vnode->children->type == VALUE_ARRAY) {
      for (size_t i = 0; i < vnode->children->as.array_val->count; i++) {
        Value *child_wrapper = vnode->children->as.array_val->elements[i];
        if (child_wrapper && child_wrapper->type == VALUE_POINTER) {
          render_node_to_string((VNode *)child_wrapper->as.pointer_val, sb);
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
    if (vnode->children && vnode->children->type == VALUE_STRING) {
      sb_append_str(sb, vnode->children->as.string_val->chars);
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
