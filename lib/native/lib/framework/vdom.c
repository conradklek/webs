#include "vdom.h"
#include "../webs_api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

VNode *vnode_new(VNodeType node_type, const char *type, Value *props,
                 Value *events, Value *children) {
  const WebsApi *w = webs();
  VNode *vnode = (VNode *)calloc(1, sizeof(VNode));
  if (!vnode)
    return NULL;

  vnode->node_type = node_type;
  vnode->type = type ? strdup(type) : NULL;
  vnode->props = props ? props : w->object();
  vnode->events = events ? events : w->object();
  vnode->children = children;

  if (vnode->props && w->valueGetType(vnode->props) == VALUE_OBJECT) {
    Value *key_val = w->objectGet(vnode->props, "key");
    if (key_val) {
      if (w->valueGetType(key_val) == VALUE_STRING) {
        vnode->key = w->valueClone(key_val);
      } else if (w->valueGetType(key_val) == VALUE_NUMBER) {
        char buffer[64];
        snprintf(buffer, sizeof(buffer), "%g", w->valueAsNumber(key_val));
        vnode->key = w->string(buffer);
      }
    }
  }

  return vnode;
}

void vnode_free(VNode *vnode) {
  const WebsApi *w = webs();
  if (!vnode)
    return;

  free(vnode->type);
  w->freeValue(vnode->props);
  w->freeValue(vnode->events);
  w->freeValue(vnode->key);

  if (vnode->children && w->valueGetType(vnode->children) == VALUE_ARRAY) {
    for (size_t i = 0; i < w->arrayCount(vnode->children); i++) {
      Value *child_wrapper = w->arrayGet(vnode->children, i);
      if (child_wrapper && w->valueGetType(child_wrapper) == VALUE_POINTER) {
        vnode_free((VNode *)child_wrapper->as.pointer);
      }
    }
  }
  w->freeValue(vnode->children);
  free(vnode);
}

Value *normalize_children(Value *children) {
  const WebsApi *w = webs();
  Value *array_to_process = children;
  bool created_wrapper = false;

  if (!children) {
    return w->array();
  }

  if (w->valueGetType(children) != VALUE_ARRAY) {
    array_to_process = w->array();
    w->arrayPush(array_to_process, children);
    created_wrapper = true;
  }

  Value *normalized_array = w->array();
  for (size_t i = 0; i < w->arrayCount(array_to_process); i++) {
    Value *child = w->arrayGet(array_to_process, i);
    VNode *vnode = NULL;

    if (child && w->valueGetType(child) == VALUE_POINTER) {
      w->arrayPush(normalized_array, w->valueClone(child));
      continue;
    }

    ValueType child_type = w->valueGetType(child);
    if (child && (child_type == VALUE_STRING || child_type == VALUE_NUMBER)) {
      char buffer[64];
      const char *child_content;
      if (child_type == VALUE_NUMBER) {
        snprintf(buffer, sizeof(buffer), "%g", w->valueAsNumber(child));
        child_content = buffer;
      } else {
        child_content = w->valueAsString(child);
      }
      Value *text_child_value = w->string(child_content);
      vnode = vnode_new(VNODE_TYPE_TEXT, "Text", w->object(), w->object(),
                        text_child_value);
    } else if (child && child_type == VALUE_OBJECT) {
      Value *v_type_val = w->objectGet(child, "type");
      Value *v_props_val = w->objectGet(child, "props");
      Value *v_children_val = w->objectGet(child, "children");

      if (v_type_val && w->valueGetType(v_type_val) == VALUE_STRING) {
        vnode = h(w->valueAsString(v_type_val), w->valueClone(v_props_val),
                  w->valueClone(v_children_val));
      } else {
        char *stringified = w->json->encode(child);
        Value *text_content = w->string(stringified ? stringified : "{}");
        vnode = vnode_new(VNODE_TYPE_TEXT, "Text", w->object(), w->object(),
                          text_content);
        w->freeString(stringified);
      }
    }

    if (vnode) {
      w->arrayPush(normalized_array, w->pointer(vnode));
    }
  }

  if (created_wrapper) {
    // Clear the temporary wrapper array before freeing
    w->arrayGet(array_to_process, 0)->type = VALUE_FREED;
    w->freeValue(array_to_process);
  }

  return normalized_array;
}

VNode *h(const char *type, Value *props, Value *children) {
  const WebsApi *w = webs();
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

  Value *actual_props = w->object();
  Value *events = w->object();
  if (props && w->valueGetType(props) == VALUE_OBJECT) {
    Value *keys = w->objectKeys(props);
    if (keys) {
      for (size_t i = 0; i < w->arrayCount(keys); i++) {
        Value *key_val = w->arrayGet(keys, i);
        const char *key = w->valueAsString(key_val);
        Value *val = w->objectGet(props, key);
        if (key[0] == '@') {
          w->objectSet(events, key + 1, w->valueClone(val));
        } else {
          w->objectSet(actual_props, key, w->valueClone(val));
        }
      }
      w->freeValue(keys);
    }
  }
  w->freeValue(props);

  Value *vnode_children;
  if (node_type == VNODE_TYPE_TEXT || node_type == VNODE_TYPE_COMMENT) {
    if (children && w->valueGetType(children) == VALUE_STRING) {
      vnode_children = children;
    } else if (children && w->valueGetType(children) == VALUE_ARRAY &&
               w->arrayCount(children) > 0) {
      Value *first_child = w->arrayGet(children, 0);
      if (first_child && w->valueGetType(first_child) == VALUE_STRING) {
        vnode_children = w->valueClone(first_child);
      } else {
        vnode_children = w->string("");
      }
      w->freeValue(children);
    } else {
      vnode_children = w->string("");
      if (children) {
        w->freeValue(children);
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
  const WebsApi *w = webs();
  if (!vnode)
    return w->null();

  Value *obj = w->object();
  w->objectSet(obj, "node_type", w->number(vnode->node_type));
  w->objectSet(obj, "type", w->string(vnode->type ? vnode->type : ""));
  w->objectSet(obj, "props", w->valueClone(vnode->props));
  w->objectSet(obj, "events", w->valueClone(vnode->events));

  if (vnode->node_type == VNODE_TYPE_TEXT ||
      vnode->node_type == VNODE_TYPE_COMMENT) {
    w->objectSet(obj, "children", w->valueClone(vnode->children));
  } else {
    Value *children_array = w->array();
    if (vnode->children && w->valueGetType(vnode->children) == VALUE_ARRAY) {
      for (size_t i = 0; i < w->arrayCount(vnode->children); i++) {
        Value *child_wrapper = w->arrayGet(vnode->children, i);
        if (child_wrapper && w->valueGetType(child_wrapper) == VALUE_POINTER) {
          const VNode *child_vnode = (const VNode *)child_wrapper->as.pointer;
          w->arrayPush(children_array, w->vnodeToValue(child_vnode));
        }
      }
    }
    w->objectSet(obj, "children", children_array);
  }

  if (vnode->key) {
    w->objectSet(obj, "key", w->valueClone(vnode->key));
  } else {
    w->objectSet(obj, "key", w->null());
  }

  return obj;
}
