/**
 * @file ssr.h
 * @brief Defines the Server-Side Rendering (SSR) functionality.
 *
 * This module is responsible for rendering a VDOM tree directly to an HTML
 * string without a browser environment.
 */

#ifndef SSR_H
#define SSR_H

#include "vdom.h"

/**
 * @brief Renders a VDOM tree to an HTML string.
 * @param vnode The root `VNode` of the tree to render.
 * @return A new, heap-allocated string containing the HTML markup.
 * The caller is responsible for freeing this string.
 */
char *webs_ssr_render_vnode(VNode *vnode);

#endif // SSR_H
