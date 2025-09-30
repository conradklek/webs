#include "vdom.h"
#include "../webs_api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

VNode *vnode_new(VNodeType node_type, const char *type, Value *props,
                 Value *events, Value *children) {
  VNode *vnode = (VNode *)calloc(1, sizeof(VNode));
  if (!vnode)
    return NULL;

  vnode->node_type = node_type;
  vnode->type = type ? strdup(type) : NULL;
  vnode->props = props ? props : W->object();
  vnode->events = events ? events : W->object();
  vnode->children = children;

  if (vnode->props && W->valueGetType(vnode->props) == VALUE_OBJECT) {
    Value *key_val = W->objectGetRef(vnode->props, "key");
    if (key_val) {
      if (W->valueGetType(key_val) == VALUE_STRING) {
        vnode->key = W->valueClone(key_val);
      } else if (W->valueGetType(key_val) == VALUE_NUMBER) {
        char buffer[64];
        snprintf(buffer, sizeof(buffer), "%g", W->valueAsNumber(key_val));
        vnode->key = W->string(buffer);
      }
    }
  }

  return vnode;
}

void vnode_free(VNode *vnode) {
  if (!vnode)
    return;

  free(vnode->type);
  W->freeValue(vnode->props);
  W->freeValue(vnode->events);
  W->freeValue(vnode->key);

  if (vnode->children && W->valueGetType(vnode->children) == VALUE_ARRAY) {
    for (size_t i = 0; i < W->arrayCount(vnode->children); i++) {
      Value *child_wrapper = W->arrayGetRef(vnode->children, i);
      if (child_wrapper && W->valueGetType(child_wrapper) == VALUE_POINTER) {
        vnode_free((VNode *)child_wrapper->as.pointer);
      }
    }
  }
  W->freeValue(vnode->children);
  free(vnode);
}

Value *normalize_children(Value *children) {
  Value *array_to_process = children;
  bool created_wrapper = false;

  if (!children) {
    return W->array();
  }

  if (W->valueGetType(children) != VALUE_ARRAY) {
    array_to_process = W->array();
    W->arrayPush(array_to_process, children);
    created_wrapper = true;
  }

  Value *normalized_array = W->array();
  for (size_t i = 0; i < W->arrayCount(array_to_process); i++) {
    Value *child = W->arrayGetRef(array_to_process, i);
    VNode *vnode = NULL;

    if (child && W->valueGetType(child) == VALUE_POINTER) {
      W->arrayPush(normalized_array, W->valueClone(child));
      continue;
    }

    ValueType child_type = W->valueGetType(child);
    if (child && (child_type == VALUE_STRING || child_type == VALUE_NUMBER)) {
      char buffer[64];
      const char *child_content;
      if (child_type == VALUE_NUMBER) {
        snprintf(buffer, sizeof(buffer), "%g", W->valueAsNumber(child));
        child_content = buffer;
      } else {
        child_content = W->valueAsString(child);
      }
      Value *text_child_value = W->string(child_content);
      vnode = vnode_new(VNODE_TYPE_TEXT, "Text", W->object(), W->object(),
                        text_child_value);
    } else if (child && child_type == VALUE_OBJECT) {
      Value *v_type_val = W->objectGetRef(child, "type");
      Value *v_props_val = W->objectGetRef(child, "props");
      Value *v_children_val = W->objectGetRef(child, "children");

      if (v_type_val && W->valueGetType(v_type_val) == VALUE_STRING) {
        vnode = h(W->valueAsString(v_type_val), W->valueClone(v_props_val),
                  W->valueClone(v_children_val));
      } else {
        char *stringified = W->json->encode(child);
        Value *text_content = W->string(stringified ? stringified : "{}");
        vnode = vnode_new(VNODE_TYPE_TEXT, "Text", W->object(), W->object(),
                          text_content);
        W->freeString(stringified);
      }
    }

    if (vnode) {
      W->arrayPush(normalized_array, W->pointer(vnode));
    }
  }

  if (created_wrapper) {
    W->arrayGetRef(array_to_process, 0)->type = VALUE_FREED;
    W->freeValue(array_to_process);
  }

  return normalized_array;
}

VNode *h(const char *type, Value *props, Value *children) {
  VNodeType node_type;
  if (strcmp(type, "Fragment") == 0) {
    node_type = VNODE_TYPE_FRAGMENT;
  } else if (strcmp(type, "Text") == 0) {
    node_type = VNODE_TYPE_TEXT;
  } else if (strcmp(type, "Comment") == 0) {
    node_type = VNODE_TYPE_COMMENT;
  } else if (type[0] >= 'A' && type[0] <= 'Z') {
    node_type = VNODE_TYPE_COMPONENT;
  } else {
    node_type = VNODE_TYPE_ELEMENT;
  }

  Value *actual_props = W->object();
  Value *events = W->object();
  if (props && W->valueGetType(props) == VALUE_OBJECT) {
    Value *keys = W->objectKeys(props);
    if (keys) {
      for (size_t i = 0; i < W->arrayCount(keys); i++) {
        Value *key_val = W->arrayGetRef(keys, i);
        const char *key = W->valueAsString(key_val);
        Value *val = W->objectGetRef(props, key);
        if (key[0] == '@') {
          W->objectSet(events, key + 1, W->valueClone(val));
        } else {
          W->objectSet(actual_props, key, W->valueClone(val));
        }
      }
      W->freeValue(keys);
    }
  }
  W->freeValue(props);

  Value *vnode_children;
  if (node_type == VNODE_TYPE_TEXT || node_type == VNODE_TYPE_COMMENT) {
    if (children && W->valueGetType(children) == VALUE_STRING) {
      vnode_children = children;
    } else if (children && W->valueGetType(children) == VALUE_ARRAY &&
               W->arrayCount(children) > 0) {
      Value *first_child = W->arrayGetRef(children, 0);
      if (first_child && W->valueGetType(first_child) == VALUE_STRING) {
        vnode_children = W->valueClone(first_child);
      } else {
        vnode_children = W->string("");
      }
      W->freeValue(children);
    } else {
      vnode_children = W->string("");
      if (children) {
        W->freeValue(children);
      }
    }
  } else {
    vnode_children = normalize_children(children);
  }

  VNode *vnode =
      vnode_new(node_type, type, actual_props, events, vnode_children);

  return vnode;
}

Value *vnode_to_value(const VNode *vnode) {
  if (!vnode)
    return W->null();

  Value *children_value;
  if (vnode->node_type == VNODE_TYPE_TEXT ||
      vnode->node_type == VNODE_TYPE_COMMENT) {
    children_value = W->valueClone(vnode->children);
  } else {
    Value *children_array = W->array();
    if (vnode->children && W->valueGetType(vnode->children) == VALUE_ARRAY) {
      for (size_t i = 0; i < W->arrayCount(vnode->children); i++) {
        Value *child_wrapper = W->arrayGetRef(vnode->children, i);
        if (child_wrapper && W->valueGetType(child_wrapper) == VALUE_POINTER) {
          const VNode *child_vnode = (const VNode *)child_wrapper->as.pointer;
          W->arrayPush(children_array, vnode_to_value(child_vnode));
        }
      }
    }
    children_value = children_array;
  }

  return W->objectOf("node_type", W->number(vnode->node_type), "type",
                     W->string(vnode->type ? vnode->type : ""), "props",
                     W->valueClone(vnode->props), "events",
                     W->valueClone(vnode->events), "children", children_value,
                     "key", vnode->key ? W->valueClone(vnode->key) : W->null(),
                     NULL);
}
