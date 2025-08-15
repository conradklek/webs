import { create_renderer, create_vnode } from "./renderer";
import { reactive } from "./reactivity";
import { compile } from "./compiler";

/**
 * Recursively compiles templates for a component and its sub-components.
 * If a component has a template string but no render function, this will compile
 * the template into a render function.
 * @param {object} component_def - The component definition object.
 */
function compile_templates(component_def) {
  if (component_def.template && !component_def.render) {
    component_def.render = compile(component_def);
  }
  if (component_def.components) {
    for (const key in component_def.components) {
      compile_templates(component_def.components[key]);
    }
  }
}

/**
 * Creates a factory for generating app instances.
 * @param {object} renderer_options - Configuration for the renderer.
 * @returns {function} A function to create a new app instance.
 */
export function create_app_api(renderer_options) {
  const renderer = create_renderer(renderer_options);

  /**
   * Creates a new application instance.
   * @param {object} root_component - The root component for the application.
   * @param {object} [root_props={}] - The initial props for the root component.
   * @returns {object} The application instance with a mount method.
   */
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
        params: root_props.params || {},
      },
      /**
       * Mounts the application to a container element.
       * @param {Element} root_container - The DOM element to mount the app into.
       */
      mount(root_container) {
        root_container.innerHTML = "";
        vnode = create_vnode(root_component);
        vnode.app_context = app._context;
        app._context.patch(null, vnode, root_container);
        app._container = root_container;
      },
      // The `update` method was removed as it was only used for the
      // custom HMR implementation. Bun's HMR handles this with a full reload.
    };
    return app;
  };
}

const is_on = (key) => /^on[A-Z]/.test(key);

const renderer_options = {
  create_element: (tag) => document.createElement(tag),
  create_text: (text) => document.createTextNode(text),
  create_comment: (text) => document.createComment(text),
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
  query_selector: (selector) => document.querySelector(selector),
};

export const create_app = create_app_api(renderer_options);

/**
 * Parses a URL query string into a nested object.
 * Supports nested keys like 'user[name]=John'.
 * @param {string} queryString - The query string to parse (e.g., window.location.search).
 * @returns {object} An object representation of the query string parameters.
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

/**
 * Creates and manages a client-side router.
 * Handles navigation, route loading, middleware, and component rendering.
 * @param {object} routes - An object where keys are paths and values are component definitions.
 * A route definition can also include middleware.
 * e.g., { '/': { component: HomeComponent, middleware: [auth] } }
 */
export function create_router(routes) {
  if (typeof window === "undefined") return;

  const root = document.getElementById("root");
  if (!root) {
    console.error("Router creation failed: Root element not provided.");
    return;
  }
  const initialParams =
    window.__INITIAL_PARAMS__ || parse_query_string(window.location.search);
  const params = reactive(initialParams);
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
    await loadRoute();
  }

  async function loadRoute() {
    const to_path = window.location.pathname;
    const from_route = current_route;
    const route_definition = routes[to_path];
    if (!route_definition) {
      console.error(`No component found for path: ${to_path}`);
      root.innerHTML = `<div>404 - Not Found</div>`;
      return;
    }
    const to_route = {
      path: to_path,
      params: parse_query_string(window.location.search),
      component: route_definition.component || route_definition,
      middleware: route_definition.middleware || [],
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
        renderComponent(to_route.component);
      }
    };
    next();
  }

  function renderComponent(PageComponent) {
    updateParams(window.location.search);
    current_route = { path: window.location.pathname };
    if (!app) {
      app = create_app(PageComponent, { params });
      app.mount(root);
    } else {
      app = create_app(PageComponent, { params });
      app.mount(root);
    }
  }

  function handleLocalNavigation(event) {
    const anchorElement = event.target.closest("a");
    if (anchorElement && anchorElement.host === window.location.host) {
      event.preventDefault();
      navigate(anchorElement.href);
    }
  }

  window.addEventListener("popstate", loadRoute);
  document.addEventListener("click", handleLocalNavigation);
  loadRoute();
}
