#ifndef COMPONENT_H
#define COMPONENT_H

#include "../core/value.h"
#include "engine.h"
#include "reactivity.h"
#include "vdom.h"

typedef struct ComponentInstance ComponentInstance;

struct ComponentInstance {
  int uid;
  VNode *vnode;
  Value *type;
  Value *props;
  Value *attrs;
  Value *slots;
  Value *ctx;
  Value *internal_ctx;
  bool is_mounted;
  VNode *sub_tree;
  ReactiveEffect *effect;
  ComponentInstance *parent;
  Value *on_mount;
  Value *on_before_unmount;
};

ComponentInstance *component(Engine *engine, VNode *vnode,
                             ComponentInstance *parent);

void component_destroy(ComponentInstance *instance);

#endif
