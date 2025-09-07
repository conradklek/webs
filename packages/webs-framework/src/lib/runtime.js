import { onUnmounted, createRenderer, createVnode } from './renderer.js';
import { db, fs, syncEngine } from './sync.js';
import { state } from './engine.js';
import { session } from './session.js';

export { session, db, fs, syncEngine };

export * from './engine';
export * from './compiler';
export * from './renderer';

const LOG_PREFIX = '[Debug] Runtime:';
const log = (...args) => console.log(LOG_PREFIX, ...args);
const error = (...args) => console.error(LOG_PREFIX, ...args);

let appInstance = null;
let componentManifestInstance = null;
const prefetchCache = new Map();

async function performNavigation(url, { isPopState = false } = {}) {
  try {
    let data;
    if (!isPopState && prefetchCache.has(url.href)) {
      data = prefetchCache.get(url.href);
      prefetchCache.delete(url.href);
    } else {
      const response = await fetch(url.pathname + url.search, {
        headers: { 'X-Webs-Navigate': 'true' },
      });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('application/json')
      ) {
        window.location.assign(url.href);
        return;
      }
      data = deserializeState(await response.json());
    }

    const componentLoader = componentManifestInstance.get(data.componentName);
    if (!componentLoader) {
      window.location.assign(url.href);
      return;
    }
    const componentModule = await componentLoader();
    const newComponentDef = componentModule.default;

    const oldVnode = appInstance._vnode;
    const newProps = {
      params: data.params,
      initialState: data.componentState || {},
      user: data.user || null,
    };
    appInstance._context.params = data.params;
    const newVnode = createVnode(newComponentDef, newProps);
    newVnode.appContext = appInstance._context;
    appInstance._context.patch(oldVnode, newVnode, appInstance._container);
    appInstance._vnode = newVnode;

    if (!isPopState) {
      window.history.pushState({}, '', url.href);
    }
    document.title = data.title;
    if (route) route.path = url.pathname;
    window.__WEBS_STATE__ = {
      componentName: data.componentName,
      swPath: websState.swPath,
    };
    session.setUser(data.user);
  } catch (err) {
    window.location.assign(url.href);
  }
}

export const router = {
  push(href) {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) {
      window.location.assign(href);
      return;
    }
    if (url.href !== window.location.href) {
      performNavigation(url);
    }
  },
};

function normalizeClass(value) {
  let res = '';
  if (typeof value === 'string') res = value;
  else if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeClass(item);
      if (normalized) res += normalized + ' ';
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const key in value) {
      if (value[key]) res += key + ' ';
    }
  }
  return res.trim();
}

export const createApp = (() => {
  const renderer = createRenderer({
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
      if (key === 'ref') {
        if (
          prevVal &&
          typeof prevVal === 'object' &&
          prevVal !== null &&
          'value' in prevVal
        ) {
          prevVal.value = null;
        }
        if (
          nextVal &&
          typeof nextVal === 'object' &&
          nextVal !== null &&
          'value' in nextVal
        ) {
          nextVal.value = el;
        }
        return;
      }

      if (/^on[A-Z]/.test(key)) {
        const eventName = key.slice(2).toLowerCase();
        let invokers = el._vei || (el._vei = {});
        let invoker = invokers[eventName];
        if (nextVal) {
          if (!invoker) {
            invoker = el._vei[eventName] = (e) => {
              if (e.timeStamp < invoker.attached) return;
              if (Array.isArray(invoker.value)) {
                invoker.value.forEach((fn) => fn(e));
              } else {
                invoker.value(e);
              }
            };
            invoker.value = nextVal;
            invoker.attached = performance.now();
            el.addEventListener(eventName, invoker);
          } else {
            invoker.value = nextVal;
          }
        } else if (invoker) {
          el.removeEventListener(eventName, invoker);
          invokers[eventName] = undefined;
        }
      } else if (key === 'class') {
        const newClassName = normalizeClass(nextVal) || '';
        if (el.className !== newClassName) {
          el.className = newClassName;
        }
      } else if (key === 'style') {
        if (typeof nextVal === 'string') {
          el.style.cssText = nextVal;
        } else if (typeof nextVal === 'object') {
          for (const styleKey in nextVal) {
            el.style[styleKey] = nextVal[styleKey];
          }
          if (prevVal && typeof prevVal === 'object') {
            for (const oldKey in prevVal) {
              if (!nextVal || !(oldKey in nextVal)) {
                el.style[oldKey] = '';
              }
            }
          }
        }
      } else if (key in el && typeof el[key] === 'boolean') {
        el[key] = !!nextVal;
      } else if (key in el) {
        if (el[key] !== nextVal) el[key] = nextVal;
      } else {
        if (typeof nextVal === 'boolean' || nextVal === 0 || nextVal === 1) {
          if (nextVal) {
            el.setAttribute(key, '');
          } else {
            el.removeAttribute(key);
          }
        } else if (nextVal == null) {
          el.removeAttribute(key);
        } else {
          el.setAttribute(key, String(nextVal));
        }
      }
    },
    querySelector: (selector) => document?.querySelector(selector),
  });

  return function createApp(
    rootComponent,
    rootProps = {},
    globalComponents = {},
  ) {
    const app = {
      _component: rootComponent,
      _container: null,
      _vnode: null,
      _context: {
        components: { ...rootComponent.components, ...globalComponents },
        provides: {},
        patch: renderer.patch,
        hydrate: renderer.hydrate,
        params: rootProps.params || {},
      },
      mount(rootContainer) {
        const vnode = createVnode(rootComponent, rootProps);
        vnode.appContext = app._context;
        app._vnode = vnode;
        app._container = rootContainer;
        const rootInstance = app._context.hydrate(vnode, rootContainer);
        if (rootInstance) installNavigationHandler(app);
        return rootInstance;
      },
    };
    return app;
  };
})();

export async function hydrate(componentManifest, dbConfig = null) {
  log('Starting client-side hydration...');
  if (typeof window === 'undefined') {
    log('Not in a browser environment. Aborting hydration.');
    return;
  }

  const websState = deserializeState(window.__WEBS_STATE__ || {});

  if (dbConfig) {
    log('Database configuration found. Setting global DB config.');
    window.__WEBS_DB_CONFIG__ = dbConfig;
  } else {
    log('No database configuration provided.');
  }

  log('Starting sync engine...');
  syncEngine.start();

  if ('serviceWorker' in navigator && websState.swPath) {
    log(`Attempting to register service worker at: ${websState.swPath}`);
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(websState.swPath)
        .then((registration) => {
          log(
            'Service Worker registered successfully with scope:',
            registration.scope,
          );
        })
        .catch((err) => {
          error('Service Worker registration failed:', err);
        });
    });
  } else {
    log('Service worker not supported or no swPath provided in state.');
  }

  const root = document.getElementById('root');
  if (!root) {
    error('Root element #root not found. Aborting hydration.');
    return;
  }

  const { componentName, user = {}, params, componentState } = websState;
  if (!componentName) {
    error('No componentName found in __WEBS_STATE__. Aborting hydration.');
    return;
  }
  log(`Root component to hydrate: ${componentName}`);

  componentManifestInstance = componentManifest;
  const componentLoader = componentManifest.get(componentName);
  if (!componentLoader) {
    error(`Component loader for "${componentName}" not found in manifest.`);
    return;
  }

  const componentModule = await componentLoader();
  const rootComponent = componentModule.default;
  if (!rootComponent) {
    error(
      `Module for "${componentName}" loaded, but it has no default export.`,
    );
    return;
  }

  const props = { params, initialState: componentState || {}, user };
  log('Creating app instance with props:', props);

  const app = createApp(rootComponent, props, rootComponent.components || {});
  app.mount(root);
  log('App mounted successfully.');

  session.setUser(websState.user);
  route.path = window.location.pathname;
}

function installNavigationHandler(app) {
  appInstance = app;

  const prefetch = async (url) => {
    if (prefetchCache.has(url.href)) return;
    const res = await fetch(url.pathname + url.search, {
      headers: { 'X-Webs-Navigate': 'true' },
    });
    if (
      res.ok &&
      res.headers.get('content-type')?.includes('application/json')
    ) {
      prefetchCache.set(url.href, deserializeState(await res.json()));
    }
  };

  const eventTarget = app._container;

  eventTarget.addEventListener('mouseover', (e) => {
    const link = e.target.closest('a');
    if (
      !link ||
      link.target ||
      link.hasAttribute('download') ||
      e.metaKey ||
      e.ctrlKey
    )
      return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) prefetch(url);
  });

  eventTarget.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (
      !link ||
      link.target ||
      link.hasAttribute('download') ||
      e.metaKey ||
      e.ctrlKey
    )
      return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    e.preventDefault();
    router.push(href);
  });

  window.addEventListener('popstate', () => {
    const url = new URL(window.location.href);
    if (route) route.path = url.pathname;
    performNavigation(url, { isPopState: true });
  });
}

function deserializeState(input) {
  try {
    if (typeof input === 'string') return JSON.parse(input);
    return input;
  } catch (e) {
    return input;
  }
}

export const route = state({ path: '/' });

export function action(actionName, componentName) {
  if (typeof window === 'undefined')
    return { call: () => Promise.resolve(null), state: {} };

  const s = state({ data: null, error: null, isLoading: false });

  const call = async (...args) => {
    s.isLoading = true;
    s.error = null;
    s.data = null;
    try {
      const finalCompName =
        componentName || window.__WEBS_STATE__?.componentName;
      const res = await fetch(`/__actions__/${finalCompName}/${actionName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!res.ok)
        throw new Error((await res.text()) || `Action failed: ${res.status}`);
      s.data = await res.json();
    } catch (err) {
      s.error = err.message;
    } finally {
      s.isLoading = false;
    }
  };
  return { call, state: s };
}

export function table(tableName, initialData = []) {
  const table = db(tableName);
  if (typeof window === 'undefined') {
    const mock = state({ data: initialData, isLoading: false, error: null });
    mock.hydrate = async () => {};
    mock.put = async () => {};
    mock.destroy = async () => {};
    return mock;
  }

  const s = state({
    data: initialData,
    isLoading: initialData === null,
    error: null,
  });

  const fetchData = async () => {
    try {
      s.isLoading = true;
      s.data = await table.getAll();
    } catch (e) {
      s.error = e;
    } finally {
      s.isLoading = false;
    }
  };

  const unsubscribe = table.subscribe(fetchData);
  onUnmounted(unsubscribe);

  s.hydrate = async (serverData) => {
    if (serverData && serverData.length > 0) {
      await table.bulkPut(serverData);
    }
    await fetchData();
  };
  s.put = table.put;
  s.destroy = table.delete;

  fetchData();

  return s;
}
