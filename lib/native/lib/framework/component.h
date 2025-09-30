/**
 * @file component.h
 * @brief Defines the structure for a component instance.
 *
 * A component instance represents a stateful, mounted instance of a component
 * definition in the VDOM tree.
 */

#ifndef COMPONENT_H
#define COMPONENT_H

#include "../core/value.h"
#include "engine.h"
#include "reactivity.h"
#include "vdom.h"

typedef struct ComponentInstance ComponentInstance;

/**
 * @struct ComponentInstance
 * @brief Represents an active instance of a component.
 */
struct ComponentInstance {
  int uid;
  VNode *vnode;
  Value *type;
  Value *props;
  Value *attrs;
  Value *ctx;
  bool is_mounted;
  VNode *sub_tree;
  ReactiveEffect *effect;
  ComponentInstance *parent;

  // --- Composition API & Lifecycle ---
  Value *slots;            // <slot /> content from parent
  Value *provides;         // for provide/inject
  Value *on_mount_hooks;   // Array of function pointers
  Value *on_unmount_hooks; // Array of function pointers
};

/**
 * @brief Creates a new component instance from a VNode.
 * @param engine The framework engine instance.
 * @param vnode The component VNode.
 * @param parent The parent component instance, if any.
 * @return A new `ComponentInstance`, or NULL on failure.
 */
ComponentInstance *component(Engine *engine, VNode *vnode,
                             ComponentInstance *parent);

/**
 * @brief Frees all resources associated with a component instance.
 * @param instance The instance to destroy.
 */
void component_destroy(ComponentInstance *instance);

#endif // COMPONENT_H
