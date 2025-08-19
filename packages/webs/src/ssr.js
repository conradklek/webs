/**
 * @fileoverview Implements the server-side rendering (SSR) logic. It takes a
 * virtual DOM tree (VNode) and renders it to an HTML string.
 */

import {
  create_component,
  Fragment,
  Text,
  Comment,
  Teleport,
} from "./renderer";
import { void_elements, is_string, is_object, is_function } from "./utils";
import { compile } from "./compiler.js";

/**
 * Renders a root VNode to an HTML string for server-side rendering.
 * @param {object} vnode - The root VNode of the application.
 * @returns {Promise<{html: string, componentState: object}>} An object containing the rendered HTML and the initial state.
 */
export async function render_to_string(vnode) {
  try {
    if (vnode && vnode.type) {
      compile_templates(vnode.type);
    }
    const context = { component_state: {} };
    const html = await render_vnode(vnode, null, context);
    return { html, componentState: context.component_state };
  } catch (e) {
    console.error(`[SSR Error] ${e.message}\n${e.stack}`);
    const html = `<div style="color:red; background:lightyellow; border: 1px solid red; padding: 1rem;">SSR Error: ${escape_html(e.message)}</div>`;
    return { html, componentState: {} };
  }
}

/**
 * The core recursive function that renders a single VNode to an HTML string.
 * @private
 */
async function render_vnode(vnode, parent_component, context) {
  if (vnode == null) return "";
  if (is_string(vnode) || typeof vnode === "number")
    return escape_html(String(vnode));
  if (!is_object(vnode) || !vnode.type)
    return `<!-- invalid vnode detected -->`;

  const { type, props, children } = vnode;

  switch (type) {
    case Text:
      const content = escape_html(children);
      return props && props["w-dynamic"]
        ? `<!--[-->${content}<!--]-->`
        : content;
    case Comment:
      return `<!--${escape_html(children)}-->`;
    case Fragment:
    case Teleport:
      return render_children(children, parent_component, context);
    default:
      if (is_string(type)) {
        const tag = type.toLowerCase();
        let html = `<${tag}${render_props(props)}>`;
        if (!void_elements.has(tag)) {
          html +=
            (await render_children(children, parent_component, context)) ||
            "<!--w-->";
          html += `</${tag}>`;
        }
        return html;
      } else if (is_object(type)) {
        if (!type.render) compile_templates(type);

        const instance = create_component(
          vnode,
          parent_component,
          true /* is_ssr */,
        );
        if (!parent_component && context) {
          context.component_state = instance.internal_ctx;
        }

        if (is_function(instance.render)) {
          const sub_tree = instance.render.call(instance.ctx, instance.ctx);
          return await render_vnode(sub_tree, instance, context);
        }
        return `<!-- component failed to render -->`;
      }
      return `<!-- invalid vnode type -->`;
  }
}

/**
 * Renders an array of child VNodes to an HTML string.
 * @private
 */
async function render_children(children, parent_component, context) {
  if (!children) return "";
  const child_array = Array.isArray(children) ? children : [children];
  let result = "";
  for (const child of child_array) {
    result += await render_vnode(child, parent_component, context);
  }
  return result;
}

/**
 * Renders a VNode's props into an HTML attribute string.
 * @private
 */
function render_props(props) {
  let result = "";
  for (const key in props) {
    if (key === "key" || key.startsWith("on") || key === "w-dynamic") continue;
    const value = props[key];
    if (value === true || value === "") {
      result += ` ${key}`;
    } else if (value != null && value !== false) {
      result += ` ${key}="${escape_html(value)}"`;
    }
  }
  return result;
}

/**
 * Escapes special HTML characters to prevent XSS attacks.
 * @private
 */
function escape_html(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (match) => {
    switch (match) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return match;
    }
  });
}

/**
 * Recursively compiles templates and flattens the component registry.
 * @private
 */
function compile_templates(component_def) {
  if (component_def.components) {
    for (const key in component_def.components) {
      const sub_component = component_def.components[key];
      compile_templates(sub_component);
      if (sub_component.components) {
        Object.assign(component_def.components, sub_component.components);
      }
    }
  }
  if (!component_def.render && component_def.template) {
    component_def.render = compile(component_def);
  }
}
