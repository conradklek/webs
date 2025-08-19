/**
 * @fileoverview This file contains the framework's client-side runtime. It's
 * responsible for creating an application instance, mounting it to the DOM,
 * handling hydration from SSR, and managing the client-side router.
 */

import { create_renderer, create_vnode } from "./renderer";
import { reactive } from "./reactivity";
import { compile } from "./compiler";

/**
 * Creates a factory for generating application instances. This allows for creating
 * multiple app instances with different renderer options.
 * @param {object} renderer_options - Platform-specific DOM manipulation functions.
 * @returns {function} A `create_app` function.
 */
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
      /**
       * Mounts the application to a container element.
       * @param {HTMLElement} root_container - The DOM element to mount the app into.
       * @param {boolean} [is_hydrating=false] - If true, attempts to hydrate existing SSR content.
       */
      mount(root_container, is_hydrating = false) {
        const vnode = create_vnode(root_component, root_props);
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

/**
 * The primary `create_app` function for browser environments, pre-configured
 * with DOM-specific renderer options.
 */
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

/**
 * Initializes a client-side router that handles navigation and component loading.
 * @param {object} routes - An object mapping URL paths to dynamic component import functions.
 * e.g., { "/": () => import("./pages/Home.js") }
 */
export function create_router(routes) {
  if (typeof window === "undefined") return;

  const root = document.getElementById("root");
  if (!root)
    return console.error("Router creation failed: #root element not found.");

  const webs_state = deserialize_state(window.__WEBS_STATE__ || {});

  if (webs_state.componentState) {
    window.__INITIAL_STATE__ = webs_state.componentState;
  }
  const initial_params =
    webs_state.params || parse_query_string(window.location.search);

  let current_route = {};

  /**
   * Programmatically navigates to a new path.
   * @param {string} path - The destination URL.
   * @private
   */
  async function navigate(path) {
    history.pushState({}, "", path);
    await loadRoute(false);
  }

  /**
   * Loads and renders the component for the current URL.
   * @param {boolean} [shouldHydrate=true] - Whether this is the initial hydrating render.
   * @private
   */
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
        component,
        middleware,
      };

      let index = -1;
      const next = (path) => {
        if (path) return navigate(path);
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

  /**
   * Creates a new app instance and mounts the component.
   * @private
   */
  function renderComponent(PageComponent, routeParams, shouldHydrate) {
    current_route = { path: window.location.pathname };
    const props = { params: reactive(routeParams) };
    if (shouldHydrate && webs_state.user) {
      props.user = webs_state.user;
    }
    const app = create_app(PageComponent, props);
    app.mount(root, shouldHydrate);
    if (shouldHydrate) window.__WEBS_STATE__ = null;
  }

  window.addEventListener("popstate", () => loadRoute(false));
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a");
    if (
      anchor &&
      anchor.host === window.location.host &&
      !anchor.hasAttribute("download") &&
      anchor.target !== "_blank"
    ) {
      event.preventDefault();
      navigate(anchor.href);
    }
  });

  loadRoute();
}

/**
 * Recursively traverses a component definition and compiles any `template` strings
 * into `render` functions. It also flattens nested component registrations.
 * @param {object} component_def - The component definition object.
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
  if (component_def.template && !component_def.render) {
    component_def.render = compile(component_def);
  }
}

/**
 * Deserializes state from the server, reviving special object types like Set and Map.
 * @param {*} input - The serialized state (can be an object or JSON string).
 * @returns {*} The deserialized state.
 * @private
 */
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

/**
 * Parses a URL query string into a nested object.
 * @param {string} queryString - The query string (e.g., `window.location.search`).
 * @returns {object} The parsed parameters object.
 */
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
