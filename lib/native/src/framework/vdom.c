#include "vdom.h"
#include "../core/array.h"
#include "../core/map.h"
#include "../core/null.h"
#include "../core/number.h"
#include "../core/object.h"
#include "../core/pointer.h"
#include "../core/string.h"
#include "../modules/json.h"
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
  vnode->props = props ? props : object_value();
  vnode->events = events ? events : object_value();
  vnode->children = children;

  if (vnode->props && vnode->props->type == VALUE_OBJECT) {
    Value *key_val =
        vnode->props->as.object_val->get(vnode->props->as.object_val, "key");
    if (key_val) {
      if (key_val->type == VALUE_STRING) {
        vnode->key = value_clone(key_val);
      } else if (key_val->type == VALUE_NUMBER) {
        char buffer[64];
        snprintf(buffer, sizeof(buffer), "%g", key_val->as.number_val);
        vnode->key = string_value(buffer);
      }
    }
  }

  return vnode;
}

void vnode_free(VNode *vnode) {
  if (!vnode)
    return;

  free(vnode->type);
  value_free(vnode->props);
  value_free(vnode->events);
  value_free(vnode->key);

  if (vnode->children && vnode->children->type == VALUE_ARRAY) {
    for (size_t i = 0; i < vnode->children->as.array_val->count; i++) {
      Value *child_wrapper = vnode->children->as.array_val->elements[i];
      if (child_wrapper && child_wrapper->type == VALUE_POINTER) {
        vnode_free((VNode *)child_wrapper->as.pointer_val);
      }
    }
  }
  value_free(vnode->children);
  free(vnode);
}

Value *normalize_children(Value *children) {
  Value *array_to_process = children;
  bool created_wrapper = false;

  if (!children) {
    return array_value();
  }

  if (children->type != VALUE_ARRAY) {
    array_to_process = array_value();
    array_to_process->as.array_val->push(array_to_process->as.array_val,
                                         children);
    created_wrapper = true;
  }

  Value *normalized_array = array_value();
  for (size_t i = 0; i < array_to_process->as.array_val->count; i++) {
    Value *child = array_to_process->as.array_val->elements[i];
    VNode *vnode = NULL;

    if (child && child->type == VALUE_POINTER) {
      normalized_array->as.array_val->push(normalized_array->as.array_val,
                                           value_clone(child));
      continue;
    }

    if (child && (child->type == VALUE_STRING || child->type == VALUE_NUMBER)) {
      char buffer[64];
      const char *child_content;
      if (child->type == VALUE_NUMBER) {
        snprintf(buffer, sizeof(buffer), "%g", child->as.number_val);
        child_content = buffer;
      } else {
        child_content = child->as.string_val->chars;
      }
      Value *text_child_value = string_value(child_content);
      vnode = vnode_new(VNODE_TYPE_TEXT, "Text", object_value(), object_value(),
                        text_child_value);
    } else if (child && child->type == VALUE_OBJECT) {
      Object *child_obj = child->as.object_val;
      Value *v_type_val = child_obj->get(child_obj, "type");
      Value *v_props_val = child_obj->get(child_obj, "props");
      Value *v_children_val = child_obj->get(child_obj, "children");

      if (v_type_val && v_type_val->type == VALUE_STRING) {
        vnode = h(v_type_val->as.string_val->chars, value_clone(v_props_val),
                  value_clone(v_children_val));
      } else {
        char *stringified = json_encode(child);
        Value *text_content = string_value(stringified ? stringified : "{}");
        vnode = vnode_new(VNODE_TYPE_TEXT, "Text", object_value(),
                          object_value(), text_content);
        free(stringified);
      }
    }

    if (vnode) {
      normalized_array->as.array_val->push(normalized_array->as.array_val,
                                           pointer(vnode));
    }
  }

  if (created_wrapper) {
    array_to_process->as.array_val->count = 0;
    value_free(array_to_process);
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

  Value *actual_props = object_value();
  Value *events = object_value();
  if (props && props->type == VALUE_OBJECT) {
    Map *table = props->as.object_val->map;
    for (size_t i = 0; i < table->capacity; i++) {
      for (MapEntry *entry = table->entries[i]; entry; entry = entry->next) {
        if (entry->key[0] == '@') {
          events->as.object_val->set(events->as.object_val, entry->key + 1,
                                     value_clone(entry->value));
        } else {
          actual_props->as.object_val->set(actual_props->as.object_val,
                                           entry->key,
                                           value_clone(entry->value));
        }
      }
    }
  }
  value_free(props);

  Value *vnode_children;
  if (node_type == VNODE_TYPE_TEXT || node_type == VNODE_TYPE_COMMENT) {
    if (children && children->type == VALUE_STRING) {
      vnode_children = children;
    } else if (children && children->type == VALUE_ARRAY &&
               children->as.array_val->count > 0) {
      Value *first_child = children->as.array_val->elements[0];
      if (first_child && first_child->type == VALUE_STRING) {
        vnode_children = value_clone(first_child);
      } else {
        vnode_children = string_value("");
      }
      value_free(children);
    } else {
      vnode_children = string_value("");
      if (children) {
        value_free(children);
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
    return null();

  Value *obj = object_value();
  Object *obj_val = obj->as.object_val;
  obj_val->set(obj_val, "node_type", number(vnode->node_type));
  obj_val->set(obj_val, "type", string_value(vnode->type ? vnode->type : ""));
  obj_val->set(obj_val, "props", value_clone(vnode->props));
  obj_val->set(obj_val, "events", value_clone(vnode->events));

  if (vnode->node_type == VNODE_TYPE_TEXT ||
      vnode->node_type == VNODE_TYPE_COMMENT) {
    obj_val->set(obj_val, "children", value_clone(vnode->children));
  } else {
    Value *children_array = array_value();
    if (vnode->children && vnode->children->type == VALUE_ARRAY) {
      for (size_t i = 0; i < vnode->children->as.array_val->count; i++) {
        Value *child_wrapper = vnode->children->as.array_val->elements[i];
        if (child_wrapper && child_wrapper->type == VALUE_POINTER) {
          const VNode *child_vnode =
              (const VNode *)child_wrapper->as.pointer_val;
          children_array->as.array_val->push(children_array->as.array_val,
                                             vnode_to_value(child_vnode));
        }
      }
    }
    obj_val->set(obj_val, "children", children_array);
  }

  if (vnode->key) {
    obj_val->set(obj_val, "key", value_clone(vnode->key));
  } else {
    obj_val->set(obj_val, "key", null());
  }

  return obj;
}
