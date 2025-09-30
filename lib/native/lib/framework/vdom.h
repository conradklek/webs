/**
 * @file vdom.h
 * @brief Defines the structure and functions for the Virtual DOM.
 *
 * The Virtual DOM is an in-memory representation of the UI. This module
 * provides the `VNode` (Virtual Node) structure and a hyperscript-style helper
 * function `h` for creating VNode trees.
 */

#ifndef VDOM_H
#define VDOM_H

#include "../core/value.h"

/**
 * @enum VNodeType
 * @brief Enumerates the different types of Virtual DOM nodes.
 */
typedef enum {
  VNODE_TYPE_ELEMENT,
  VNODE_TYPE_TEXT,
  VNODE_TYPE_COMMENT,
  VNODE_TYPE_FRAGMENT,
  VNODE_TYPE_COMPONENT
} VNodeType;

/**
 * @struct VNode
 * @brief Represents a single node in the Virtual DOM tree.
 */
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

/**
 * @brief Creates a new VNode.
 * @param node_type The type of the node.
 * @param type The tag name or component name.
 * @param props An object `Value` of properties.
 * @param events An object `Value` of event listeners.
 * @param children A `Value` (array or string) for the node's children.
 * @return A new heap-allocated `VNode`, or NULL on failure.
 */
VNode *vnode_new(VNodeType node_type, const char *type, Value *props,
                 Value *events, Value *children);

/**
 * @brief Recursively frees a VNode and its children.
 * @param vnode The VNode to free.
 */
void vnode_free(VNode *vnode);

/**
 * @brief The hyperscript helper function for creating VNodes.
 *
 * This is the primary way to create VNode trees in C. It automatically
 * determines the node type and handles props, events, and children.
 * @param type The tag or component name.
 * @param props An object `Value` for props and attributes. The function takes
 * ownership.
 * @param children A `Value` for the children. Can be an array, string, or
 * single VNode. The function takes ownership.
 * @return A new `VNode` representing the element.
 */
VNode *h(const char *type, Value *props, Value *children);

/**
 * @brief Converts a VNode tree into a serializable `Value` representation.
 *
 * This is useful for debugging or sending the VDOM structure over FFI.
 * @param vnode The VNode to convert.
 * @return A new `Value` that represents the VNode tree, or NULL.
 */
Value *vnode_to_value(const VNode *vnode);

#endif // VDOM_H
