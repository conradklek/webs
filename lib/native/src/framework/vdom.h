#ifndef VDOM_H
#define VDOM_H

#include "../core/value.h"

typedef enum {
  VNODE_TYPE_ELEMENT,
  VNODE_TYPE_TEXT,
  VNODE_TYPE_COMMENT,
  VNODE_TYPE_FRAGMENT,
  VNODE_TYPE_COMPONENT
} VNodeType;

typedef struct VNode {
  VNodeType node_type;
  char *type;
  Value *props;
  Value *events;
  Value *children;
  Value *key;
  void *el;
  void *component;
} VNode;

VNode *vnode_new(VNodeType node_type, const char *type, Value *props,
                 Value *events, Value *children);

void vnode_free(VNode *vnode);

Value *normalize_children(Value *children);

VNode *h(const char *type, Value *props, Value *children);

Value *vnode_to_value(const VNode *vnode);

#endif
