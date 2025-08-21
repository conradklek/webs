import { create_renderer, create_vnode } from "./renderer";
import { compile } from "./compiler";

function normalize_class(value) {
  let res = "";
  if (typeof value === "string") {
    res = value;
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalize_class(value[i]);
      if (normalized) {
        res += normalized + " ";
      }
    }
  } else if (typeof value === "object" && value !== null) {
    for (const key in value) {
      if (value[key]) {
        res += key + " ";
      }
    }
  }
  return res.trim();
}

export function create_app_api(renderer_options) {
  const renderer = create_renderer(renderer_options);

  return function create_app(root_component, root_props = {}) {
    compile_templates(root_component);
    const app = {
      _component: root_component,
      _container: null,
      _vnode: null, // Keep a reference to the current root VNode
      _context: {
        components: root_component.components || {},
        provides: {},
        patch: renderer.patch,
        hydrate: renderer.hydrate,
        params: root_props.params || {},
        transition_queued: false,
        with_transition: (update_fn) => {
          if (!document.startViewTransition) {
            console.warn("View Transitions API not supported in this browser.");
            update_fn();
            return;
          }
          app._context.transition_queued = true;
          update_fn();
        },
      },
      mount(root_container, components) {
        console.log("[App] Mounting app to container.");
        const vnode = create_vnode(root_component, root_props);
        vnode.app_context = app._context;

        // Store references on the app object
        app._vnode = vnode;
        app._container = root_container;

        const root_instance = app._context.hydrate(vnode, root_container);

        if (root_instance) {
          // Pass the whole app object to the navigation handler
          install_navigation_handler(app, components);
        } else {
          console.error(
            "Hydration did not return a root instance. Navigation handler not installed.",
          );
        }
        return root_instance;
      },
    };
    return app;
  };
}

export const create_app = create_app_api({
  create_element: (tag) => document?.createElement(tag),
  create_text: (text) => document?.createTextNode(text),
  create_comment: (text) => document?.createComment(text),
  set_element_text: (el, text) => {
    el.textContent = text;
  },
  insert: (child, parent, anchor = null) => {
    parent.insertBefore(child, anchor);
  },
  remove: (child) => {
    const parent = child.parentNode;
    if (parent) parent.removeChild(child);
  },
  patch_prop: (el, key, prev_val, next_val) => {
    if (/^on[A-Z]/.test(key)) {
      const event_name = key.slice(2).toLowerCase();
      if (prev_val) el.removeEventListener(event_name, prev_val);
      if (next_val) el.addEventListener(event_name, next_val);
    } else if (key === "class") {
      el.className = normalize_class(next_val) || "";
    } else if (key === "transition-name") {
      el.style.viewTransitionName = next_val;
    } else {
      if (next_val == null) {
        el.removeAttribute(key);
      } else {
        el.setAttribute(key, next_val);
      }
    }
  },
  query_selector: (selector) => document?.querySelector(selector),
});

export async function hydrate(components) {
  if (typeof window === "undefined") return;

  const root = document.getElementById("root");
  if (!root) {
    return console.error("Hydration failed: #root element not found.");
  }

  const webs_state = deserialize_state(window.__WEBS_STATE__ || {});
  const { component_name, user, params, componentState } = webs_state;

  if (!component_name) {
    console.error("Hydration failed: No component name provided in state.");
    return;
  }

  const component_loader = components.get(component_name);
  if (!component_loader) {
    console.error(
      `Hydration failed: No component loader found for "${component_name}".`,
    );
    return;
  }

  try {
    const component_module = await component_loader();
    const root_component = component_module.default;

    if (
      !root_component ||
      typeof root_component !== "object" ||
      !root_component.name ||
      !root_component.template
    ) {
      console.error(
        `Hydration failed: Default export from component "${component_name}" is not a valid component.`,
      );
      return;
    }

    const props = {
      user,
      params,
      initial_state: componentState,
    };

    const app = create_app(root_component, props);
    app.mount(root, components);

    window.__WEBS_STATE__ = null;
  } catch (error) {
    console.error(`Failed to hydrate component "${component_name}":`, error);
  }
}

function install_navigation_handler(app, components) {
  window.addEventListener("click", async (e) => {
    const link = e.target.closest("a");
    if (
      !link ||
      link.target ||
      link.hasAttribute("download") ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) {
      return;
    }

    e.preventDefault();

    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    ) {
      return;
    }

    try {
      const response = await fetch(url.pathname + url.search, {
        headers: { "X-Webs-Navigate": "true" },
      });
      if (!response.ok) {
        window.location.assign(url.href);
        return;
      }
      const data = deserialize_state(await response.json());

      const component_loader = components.get(data.component_name);
      if (!component_loader) {
        throw new Error(
          `Component loader not found for: ${data.component_name}`,
        );
      }
      const component_module = await component_loader();
      const new_component_def = component_module.default;

      // *** THE FIX IS HERE ***
      // Compile the newly loaded component's template into a render function.
      compile_templates(new_component_def);

      // Use the framework's own tools to perform the update.
      app._context.with_transition(() => {
        window.history.pushState({}, "", url.href);
        document.title = data.title;

        const old_vnode = app._vnode;
        const new_props = {
          user: data.user,
          params: data.params,
          initial_state: data.componentState,
        };

        // Create a new VNode for the new page.
        const new_vnode = create_vnode(new_component_def, new_props);
        new_vnode.app_context = app._context;

        // Use the patch function to intelligently swap the components.
        app._context.patch(old_vnode, new_vnode, app._container);

        // Update the app's reference to the current VNode.
        app._vnode = new_vnode;
      });
    } catch (err) {
      console.error("Client-side navigation failed:", err);
      window.location.assign(url.href);
    }
  });
}

function compile_templates(component_def) {
  if (!component_def) return;
  if (component_def.components) {
    for (const key in component_def.components) {
      const sub_component = component_def.components[key];
      compile_templates(sub_component);
      if (sub_component.components) {
        Object.assign(component_def.components, sub_component.components);
      }
    }
  }
  if (component_def.template && !component_def.render) {
    component_def.render = compile(component_def);
  }
}

function deserialize_state(input) {
  const revive_special = (node) => {
    if (node && typeof node === "object" && "__type" in node) {
      if (node.__type === "Set" && Array.isArray(node.values)) {
        return new Set(node.values.map(revive_special));
      }
      if (node.__type === "Map" && Array.isArray(node.entries)) {
        return new Map(
          node.entries.map(([k, v]) => [revive_special(k), revive_special(v)]),
        );
      }
    }
    return node;
  };
  const walk = (val) => {
    const revived = revive_special(val);
    if (revived !== val) return revived;
    if (Array.isArray(val)) return val.map(walk);
    if (val && typeof val === "object") {
      const out = {};
      for (const k in val) out[k] = walk(val[k]);
      return out;
    }
    return val;
  };
  try {
    if (input && typeof input === "object") return walk(input);
    if (typeof input === "string") return walk(JSON.parse(input));
  } catch (e) {
    console.error("Failed to deserialize state:", e);
  }
  return input;
}

export function parse_query_string(queryString) {
  const params = {};
  const searchParams = new URLSearchParams(queryString);
  for (const [key, value] of searchParams.entries()) {
    const parts = key.replace(/\]/g, "").split("[");
    let current = params;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const nextPart = parts[i + 1];
      if (!current[part]) {
        current[part] = nextPart && !isNaN(parseInt(nextPart, 10)) ? [] : {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = decodeURIComponent(value);
  }
  return params;
}
