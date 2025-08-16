import {
  create_component,
  Fragment,
  Text,
  Comment,
  Teleport,
} from "./renderer";
import { is_string, is_object, is_function } from "./utils";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

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

async function render_children(children, parent_component, context) {
  if (!children) return "";
  const child_array = Array.isArray(children) ? children : [children];
  let result = "";
  for (const child of child_array) {
    result += await render_vnode(child, parent_component, context);
  }
  return result;
}

async function render_vnode(vnode, parent_component, context) {
  if (vnode == null) return "";
  if (is_string(vnode) || typeof vnode === "number") {
    return escape_html(String(vnode));
  }
  if (!is_object(vnode) || !vnode.type) {
    return `<!-- invalid vnode detected -->`;
  }

  const { type, props, children } = vnode;

  switch (type) {
    case Text:
      const is_dynamic = props && props["w-dynamic"];
      const content = escape_html(children);
      return is_dynamic ? `<!--[-->${content}<!--]-->` : content;
    case Comment:
      return `<!--${escape_html(children)}-->`;
    case Fragment:
    case Teleport:
      return render_children(children, parent_component, context);
    default:
      if (is_string(type)) {
        const tag = type.toLowerCase();
        let html = `<${tag}${render_props(props)}>`;
        if (!VOID_ELEMENTS.has(tag)) {
          html += await render_children(children, parent_component, context);
          html += `</${tag}>`;
        }
        return html;
      } else if (is_object(type)) {
        const instance = create_component(
          vnode,
          parent_component,
          true /* is_ssr */,
        );

        if (!parent_component && context) {
          context.component_state = instance.internal_ctx;
        }

        if (!instance.render && type.template) {
          const { compile } = await import("./compiler.js");
          instance.render = compile(type);
        }
        if (is_function(instance.render)) {
          const sub_tree = instance.render.call(instance.ctx, instance.ctx);
          return await render_vnode(sub_tree, instance, context);
        } else {
          console.warn(
            `Component "${type.name || "Anonymous"}" is missing a render function or template.`,
          );
          return `<!-- component failed to render -->`;
        }
      } else {
        return `<!-- invalid vnode type: ${String(type)} -->`;
      }
  }
}

/**
 * The main entry point for server-side rendering.
 * @param {VNode} vnode The root VNode of the application.
 * @returns {Promise<{html: string, componentState: object}>} A promise that resolves to the HTML and initial component state.
 */
export async function render_to_string(vnode) {
  try {
    const context = { component_state: {} };
    const html = await render_vnode(vnode, null, context);
    return { html, componentState: context.component_state };
  } catch (e) {
    console.error(`[SSR Error] ${e.message}`);
    console.error(e.stack);
    const html = `<div style="color:red; background:lightyellow; border: 1px solid red; padding: 1rem;">SSR Error: ${escape_html(e.message)}</div>`;
    return { html, componentState: {} };
  }
}
