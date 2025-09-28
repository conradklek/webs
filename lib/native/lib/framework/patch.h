#ifndef PATCH_H
#define PATCH_H

#include "../core/value.h"
#include "vdom.h"

Value *webs_diff(VNode *old_vnode, VNode *new_vnode);

#endif
