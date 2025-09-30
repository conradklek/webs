/**
 * @file patch.h
 * @brief Defines the Virtual DOM diffing algorithm.
 *
 * This module compares two VDOM trees (an old one and a new one) and generates
 * a series of "patches," which are instructions on how to update the real DOM
 * to match the new VDOM, minimizing direct DOM manipulation.
 */

#ifndef PATCH_H
#define PATCH_H

#include "../core/value.h"
#include "vdom.h"

/**
 * @brief Diffs two VDOM trees and generates a list of patches.
 * @param old_vnode The previous VDOM tree.
 * @param new_vnode The new VDOM tree.
 * @return An array `Value` where each element is an object `Value` describing a
 * patch (e.g., create node, remove node, update props).
 */
Value *webs_diff(VNode *old_vnode, VNode *new_vnode);

#endif // PATCH_H
