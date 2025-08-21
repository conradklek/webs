import { createRenderer, createVnode } from "./renderer";
import { compile } from "./compiler";

function normalizeClass(value) {
  let res = "";
  if (typeof value === "string") {
    res = value;
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
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

export function createAppApi(rendererOptions) {
  const renderer = createRenderer(rendererOptions);

  return function createApp(rootComponent, rootProps = {}) {
    compileTemplates(rootComponent);
    const app = {
      _component: rootComponent,
      _container: null,
      _vnode: null,
      _context: {
        components: rootComponent.components || {},
        provides: {},
        patch: renderer.patch,
        hydrate: renderer.hydrate,
        params: rootProps.params || {},
      },
      mount(rootContainer, components) {
        console.log("[App] Mounting app to container.");
        const vnode = createVnode(rootComponent, rootProps);
        vnode.appContext = app._context;

        app._vnode = vnode;
        app._container = rootContainer;

        const rootInstance = app._context.hydrate(vnode, rootContainer);

        if (rootInstance) {
          installNavigationHandler(app, components);
        } else {
          console.error(
            "Hydration did not return a root instance. Navigation handler not installed.",
          );
        }
        return rootInstance;
      },
    };
    return app;
  };
}

export const createApp = createAppApi({
  createElement: (tag) => document?.createElement(tag),
  createText: (text) => document?.createTextNode(text),
  createComment: (text) => document?.createComment(text),
  setElementText: (el, text) => {
    el.textContent = text;
  },
  insert: (child, parent, anchor = null) => {
    parent.insertBefore(child, anchor);
  },
  remove: (child) => {
    const parent = child.parentNode;
    if (parent) parent.removeChild(child);
  },
  patchProp: (el, key, prevVal, nextVal) => {
    if (/^on[A-Z]/.test(key)) {
      const eventName = key.slice(2).toLowerCase();
      if (prevVal) el.removeEventListener(eventName, prevVal);
      if (nextVal) el.addEventListener(eventName, nextVal);
    } else if (key === "class") {
      el.className = normalizeClass(nextVal) || "";
    } else if (key === "transition-name") {
      el.style.viewTransitionName = nextVal;
    } else {
      if (nextVal == null) {
        el.removeAttribute(key);
      } else {
        el.setAttribute(key, nextVal);
      }
    }
  },
  querySelector: (selector) => document?.querySelector(selector),
});

export async function hydrate(components) {
  if (typeof window === "undefined") return;

  if (process.env.NODE_ENV !== "production") {
    if (!window.__WEBS_DEVELOPER__) {
      const listeners = [];
      window.__WEBS_DEVELOPER__ = {
        componentInstances: new Map(),
        subscribe(fn) {
          listeners.push(fn);
          return () => {
            const index = listeners.indexOf(fn);
            if (index > -1) listeners.splice(index, 1);
          };
        },
        notify() {
          listeners.forEach((fn) => fn());
        },
      };
      console.log(
        "[Dev] Tools available within the browser extension",
      );
    }
  }

  const root = document.getElementById("root");
  if (!root) {
    return console.error("Hydration failed: #root element not found.");
  }

  const websState = deserializeState(window.__WEBS_STATE__ || {});
  const { componentName, user, params, componentState } = websState;

  if (!componentName) {
    console.error("Hydration failed: No component name provided in state.");
    return;
  }

  const componentLoader = components.get(componentName);
  if (!componentLoader) {
    console.error(
      `Hydration failed: No component loader found for "${componentName}".`,
    );
    return;
  }

  try {
    const componentModule = await componentLoader();
    const rootComponent = componentModule.default;

    if (
      !rootComponent ||
      typeof rootComponent !== "object" ||
      !rootComponent.name ||
      !rootComponent.template
    ) {
      console.error(
        `Hydration failed: Default export from component "${componentName}" is not a valid component.`,
      );
      return;
    }

    const props = {
      user,
      params,
      initialState: componentState,
    };

    const app = createApp(rootComponent, props);
    app.mount(root, components);

    window.__WEBS_STATE__ = null;
  } catch (error) {
    console.error(`Failed to hydrate component "${componentName}":`, error);
  }
}

function installNavigationHandler(app, components) {
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
      const data = deserializeState(await response.json());

      const componentLoader = components.get(data.componentName);
      if (!componentLoader) {
        throw new Error(
          `Component loader not found for: ${data.componentName}`,
        );
      }
      const componentModule = await componentLoader();
      const newComponentDef = componentModule.default;

      compileTemplates(newComponentDef);

      window.history.pushState({}, "", url.href);
      document.title = data.title;

      const oldVnode = app._vnode;
      const newProps = {
        user: data.user,
        params: data.params,
        initialState: data.componentState,
      };

      const newVnode = createVnode(newComponentDef, newProps);
      newVnode.appContext = app._context;

      app._context.patch(oldVnode, newVnode, app._container);

      app._vnode = newVnode;
    } catch (err) {
      console.error("Client-side navigation failed:", err);
      window.location.assign(url.href);
    }
  });
}

function compileTemplates(componentDef) {
  if (!componentDef) return;
  if (componentDef.components) {
    for (const key in componentDef.components) {
      const subComponent = componentDef.components[key];
      compileTemplates(subComponent);
      if (subComponent.components) {
        Object.assign(componentDef.components, subComponent.components);
      }
    }
  }
  if (componentDef.template && !componentDef.render) {
    componentDef.render = compile(componentDef);
  }
}

function deserializeState(input) {
  const reviveSpecial = (node) => {
    if (node && typeof node === "object" && "__type" in node) {
      if (node.__type === "Set" && Array.isArray(node.values)) {
        return new Set(node.values.map(reviveSpecial));
      }
      if (node.__type === "Map" && Array.isArray(node.entries)) {
        return new Map(
          node.entries.map(([k, v]) => [reviveSpecial(k), reviveSpecial(v)]),
        );
      }
    }
    return node;
  };
  const walk = (val) => {
    const revived = reviveSpecial(val);
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
