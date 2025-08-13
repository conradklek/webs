import { create_vnode, create_component } from "./renderer.js";
import { is_object, is_string } from "./utils.js";
import { compile } from "./compiler.js";

/**
 * Renders a virtual DOM node to an HTML string.
 * This function recursively traverses the vnode tree and constructs the corresponding HTML.
 * @param {object} vnode - The virtual DOM node to render.
 * @returns {string} The HTML string representation of the vnode.
 */
function render_vnode(vnode) {
  if (!vnode) return "";
  const { type, props, children } = vnode;
  if (is_string(type)) {
    let attrs = "";
    if (props) {
      for (const key in props) {
        if (key.startsWith("on") || key === "key") continue;
        attrs += ` ${key}="${String(props[key])}"`;
      }
    }
    const child_html = is_string(children)
      ? children
      : (children || []).map(render_vnode).join("");

    return `<${type}${attrs}>${child_html}</${type}>`;
  } else if (is_object(type)) {
    const instance = create_component(vnode, null, true);
    const render = instance.render || compile(instance.type);
    const sub_tree = render.call(instance.ctx, instance.ctx);
    return render_vnode(sub_tree);
  } else if (typeof type === "symbol") {
    switch (type.description) {
      case "Text":
        return is_string(children) ? children : String(children ?? "");
      case "Comment":
        return `<!--${children || ""}-->`;
      case "Fragment":
        return (children || []).map(render_vnode).join("");
      default:
        return "";
    }
  } else {
    return "";
  }
}

/**
 * Renders a root component to an HTML string for server-side rendering (SSR).
 * @param {object} root_component - The root component of the application.
 * @param {object} [context={}] - An optional context object available to all components.
 * Can be used to pass server-side data like user session or request params.
 * @returns {string} The full HTML string for the application.
 */
export function render_to_string(root_component, context = {}) {
  const vnode = create_vnode(root_component);
  vnode.app_context = {
    params: context.params || {},
    globals: {
      $user: context.user || null,
    },
  };
  return render_vnode(vnode);
}
