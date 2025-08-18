import {
  create_component,
  Fragment,
  Text,
  Comment,
  Teleport,
} from "./renderer";
import { is_string, is_object, is_function } from "./utils";
import { compile } from "./compiler.js";

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

/**
 * Recursively compiles templates and flattens the component registry.
 * This function traverses a component definition from the "leaves" of the
 * component tree upwards. It compiles the template if a render function
 * doesn't already exist.
 *
 * CRITICAL FIX: It flattens the component registry by merging child components
 * into their parent's `components` object using `Object.assign`. This ensures
 * that when a parent component is compiled and rendered on the server, it has
 * full awareness of all possible descendant components, preventing "invalid vnode"
 * errors and ensuring components like `CardFooter` are rendered correctly during SSR.
 *
 * @param {object} component_def - The component definition object.
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
        if (!type.render) {
          console.warn(
            `Component "${type.name || "Anonymous"}" was not compiled correctly before SSR.`,
          );
          compile_templates(type);
        }

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
    if (vnode && vnode.type) {
      compile_templates(vnode.type);
    }
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
