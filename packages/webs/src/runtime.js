import { create_renderer, create_vnode } from "./renderer";
import { reactive } from "./reactivity";
import { compile } from "./compiler";

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

  if (component_def.template && !component_def.render) {
    component_def.render = compile(component_def);
  }
}

function revive_special(node) {
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
}

function deserialize_state(input) {
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
  } catch { }
  return input;
}

export function create_app_api(renderer_options) {
  const renderer = create_renderer(renderer_options);

  return function create_app(root_component, root_props = {}) {
    compile_templates(root_component);
    let vnode;
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
      mount(root_container, is_hydrating = false) {
        vnode = create_vnode(root_component, root_props);
        vnode.app_context = app._context;

        if (is_hydrating) {
          app._context.hydrate(vnode, root_container);
        } else {
          root_container.innerHTML = "";
          app._context.patch(null, vnode, root_container);
        }

        app._container = root_container;
      },
    };
    return app;
  };
}

const is_on = (key) => /^on[A-Z]/.test(key);

const renderer_options = {
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
    if (parent) {
      parent.removeChild(child);
    }
  },
  patch_prop: (el, key, prev_val, next_val) => {
    if (is_on(key)) {
      const event_name = key.slice(2).toLowerCase();
      if (prev_val) el.removeEventListener(event_name, prev_val);
      if (next_val) el.addEventListener(event_name, next_val);
    } else {
      if (next_val == null) {
        el.removeAttribute(key);
      } else {
        el.setAttribute(key, next_val);
      }
    }
  },
  query_selector: (selector) => document?.querySelector(selector),
};

export const create_app = create_app_api(renderer_options);

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
        if (nextPart && !isNaN(parseInt(nextPart, 10))) {
          current[part] = [];
        } else {
          current[part] = {};
        }
      }
      current = current[part];
    }
    const lastPart = parts[parts.length - 1];
    current[lastPart] = decodeURIComponent(value);
  }
  return params;
}

export function create_router(routes) {
  if (typeof window === "undefined") return;

  const root = document.getElementById("root");
  if (!root) {
    console.error("Router creation failed: Root element not provided.");
    return;
  }

  const webs_state_raw = window.__WEBS_STATE__ || {};
  const webs_state = deserialize_state(webs_state_raw);

  const initial_params =
    webs_state.params || parse_query_string(window.location.search);

  if (webs_state.componentState) {
    window.__INITIAL_STATE__ = deserialize_state(webs_state.componentState);
  }

  const params = reactive(initial_params);
  let app;
  let current_route = {};

  function updateParams(search) {
    const newParams = parse_query_string(search);
    for (const key in params) {
      delete params[key];
    }
    for (const key in newParams) {
      params[key] = newParams[key];
    }
  }

  async function navigate(path) {
    const url = new URL(path, window.location.origin);
    history.pushState({}, "", url);
    await loadRoute(false);
  }

  async function loadRoute(shouldHydrate = true) {
    const to_path = window.location.pathname;
    const from_route = current_route;
    const route_loader = routes[to_path];

    if (!route_loader) {
      console.error(`No component found for path: ${to_path}`);
      root.innerHTML = `<div>404 - Not Found</div>`;
      return;
    }

    try {
      const module = await route_loader();
      const component = module.default;
      const middleware = module.middleware || [];

      const to_route = {
        path: to_path,
        params: parse_query_string(window.location.search),
        component: component,
        middleware: middleware,
      };

      let index = -1;
      const next = (path) => {
        if (path) {
          navigate(path);
          return;
        }
        index++;
        if (index < to_route.middleware.length) {
          to_route.middleware[index](to_route, from_route, next);
        } else {
          renderComponent(to_route.component, to_route.params, shouldHydrate);
        }
      };
      next();
    } catch (error) {
      console.error(
        `Failed to load route component for path: ${to_path}`,
        error,
      );
      root.innerHTML = `<div>Error loading page.</div>`;
    }
  }

  function renderComponent(PageComponent, routeParams, shouldHydrate) {
    updateParams(window.location.search);
    current_route = { path: window.location.pathname };

    const props = { params: reactive(routeParams) };
    if (shouldHydrate && webs_state.user) {
      props.user = webs_state.user;
    }

    app = create_app(PageComponent, props);
    app.mount(root, shouldHydrate);

    if (shouldHydrate && window.__WEBS_STATE__) {
      window.__WEBS_STATE__ = null;
    }
  }

  function handleLocalNavigation(event) {
    const anchorElement = event.target.closest("a");
    if (
      anchorElement &&
      anchorElement.host === window.location.host &&
      !anchorElement.hasAttribute("download") &&
      anchorElement.getAttribute("target") !== "_blank" &&
      anchorElement.getAttribute("rel") !== "external"
    ) {
      event.preventDefault();
      navigate(anchorElement.href);
    }
  }

  window.addEventListener("popstate", () => loadRoute(false));
  document.addEventListener("click", handleLocalNavigation);
  loadRoute();
}
