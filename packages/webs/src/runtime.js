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
      _context: {
        components: root_component.components || {},
        provides: {},
        patch: renderer.patch,
        hydrate: renderer.hydrate,
        params: root_props.params || {},
      },
      mount(root_container) {
        const vnode = create_vnode(root_component, root_props);
        vnode.app_context = app._context;
        app._context.hydrate(vnode, root_container);
        app._container = root_container;
        return vnode;
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

  const component_loader = components[component_name];
  if (!component_loader) {
    console.error(
      `Hydration failed: No component loader found for "${component_name}".`,
    );
    return;
  }

  try {
    const component_module = await component_loader();
    const root_component = component_module.default;

    const props = {
      user,
      params,
      initial_state: componentState,
    };

    const app = create_app(root_component, props);
    app.mount(root);

    window.__WEBS_STATE__ = null;
    console.log(
      `[Hydration] Page component "${component_name}" hydrated successfully.`,
    );
  } catch (error) {
    console.error(`Failed to hydrate component "${component_name}":`, error);
  }
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
