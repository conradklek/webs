import { is_object, is_string, void_elements } from "./utils.js";
import {
  Fragment,
  Text,
  Comment,
  create_component,
  create_vnode,
} from "./renderer.js";
import { compile } from "./compiler/index.js";

/**
 * Renders a virtual node (VNode) to an HTML string.
 * This is the core of the SSR logic.
 * @param {object} vnode - The virtual node to render.
 * @param {object} context - The application context for the component.
 * @returns {Promise<string>} A promise that resolves to the HTML string.
 */
async function render_vnode_to_string(vnode, context) {
  const { type, props, children } = vnode;

  switch (type) {
    case Text:
      return children;
    case Comment:
      return `<!--${children}-->`;
    case Fragment:
      return render_children_to_string(children, context);
    default:
      if (is_object(type)) {
        return render_component_to_string(vnode, context);
      } else if (is_string(type)) {
        let attrs = "";
        if (props) {
          for (const key in props) {
            if (key.startsWith("on")) continue;
            const value = props[key];
            if (value === "" || value === true) {
              attrs += ` ${key}`;
            } else {
              attrs += ` ${key}="${String(value)}"`;
            }
          }
        }

        if (void_elements.has(type)) {
          return `<${type}${attrs}>`;
        }

        const inner_html = children
          ? await render_children_to_string(children, context)
          : "";
        return `<${type}${attrs}>${inner_html}</${type}>`;
      }
  }
  return "";
}

/**
 * Renders an array of child VNodes to a single HTML string.
 * @param {Array|string} children - The children to render.
 * @param {object} context - The application context.
 * @returns {Promise<string>} A promise that resolves to the combined HTML string of all children.
 */
async function render_children_to_string(children, context) {
  if (is_string(children)) return children;
  if (!Array.isArray(children)) return "";

  const child_promises = children.map((child) =>
    is_object(child)
      ? render_vnode_to_string(child, context)
      : Promise.resolve(String(child)),
  );
  const rendered_children = await Promise.all(child_promises);
  return rendered_children.join("");
}

/**
 * Renders a component VNode to its HTML string representation.
 * @param {object} vnode - The component's virtual node.
 * @param {object} parent_context - The context from the parent component or app.
 * @returns {Promise<string>} A promise that resolves to the component's HTML string.
 */
async function render_component_to_string(vnode, parent_context) {
  const instance = create_component(vnode, null, true /* is_ssr */);
  instance.app_context = { ...instance.app_context, ...parent_context };

  const component = instance.type;

  if (!component.render) {
    if (component.template) {
      component.render = compile(component);
    } else {
      console.warn(
        `SSR: Component ${component.name} is missing a render function or template.`,
      );
      return "";
    }
  }

  const sub_tree = component.render.call(instance.ctx, instance.ctx);

  return render_vnode_to_string(sub_tree, instance.app_context);
}

/**
 * Public API for Server-Side Rendering.
 * Takes a root component and initial context and returns its HTML representation.
 * @param {object} root_component - The root component object.
 * @param {object} initial_context - The initial context (e.g., user, params).
 * @returns {Promise<string>} A promise that resolves to the full HTML string for the app.
 */
export async function render_to_string(root_component, initial_context = {}) {
  try {
    const root_vnode = create_vnode(root_component);
    return await render_component_to_string(root_vnode, initial_context);
  } catch (error) {
    console.error("Error during SSR:", error);
    return "<div>Error rendering on the server.</div>";
  }
}
