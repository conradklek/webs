import {
  onUnmounted,
  createRenderer,
  createVnode,
  onPropsReceived,
} from './renderer.js';
import { db, fs, syncEngine } from './sync.js';
import { ai } from './ai/ai.service.js';
import { state, ref } from './engine.js';
import { session } from './session.js';
import { normalizeClass, createLogger } from './shared.js';
import { initDevTools } from './dev.js';

const logger = createLogger('[Runtime]');

export { session, db, fs, syncEngine, ai };

export * from './engine';
export * from './compiler';
export * from './renderer';

let appInstance = null;
let componentManifestInstance = null;
const prefetchCache = new Map();

export const route = ref({ path: '/' });

async function performNavigation(
  url,
  { isPopState = false, fromClick = false } = {},
) {
  logger.log(`Starting navigation to: ${url.href}`);
  try {
    let data;
    if (!isPopState && fromClick && prefetchCache.has(url.href)) {
      data = prefetchCache.get(url.href);
      prefetchCache.delete(url.href);
      logger.debug('Used prefetched data for navigation.');
    } else {
      logger.debug('Fetching navigation data from server...');
      const response = await fetch(url.pathname + url.search, {
        headers: { 'X-Webs-Navigate': 'true' },
      });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('application/json')
      ) {
        logger.warn(
          'Navigation fetch failed or returned non-JSON. Full page reload.',
        );
        window.location.assign(url.href);
        return;
      }
      data = deserializeState(await response.json());
      logger.debug('Successfully fetched navigation data:', data);
    }

    const componentLoader = componentManifestInstance.get(data.componentName);
    if (!componentLoader) {
      logger.error(
        `Component loader for "${data.componentName}" not found. Full page reload.`,
      );
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
    logger.debug('New props for component update:', newProps);

    appInstance._context.params = data.params;
    const newVnode = createVnode(newComponentDef, newProps);
    newVnode.appContext = appInstance._context;

    logger.log('Patching DOM with new component vnode...');
    appInstance._context.patch(oldVnode, newVnode, appInstance._container);
    appInstance._vnode = newVnode;
    logger.log('DOM patching complete.');

    if (!isPopState) {
      window.history.pushState({}, '', url.href);
    }
    document.title = data.title;

    window.__WEBS_STATE__ = {
      componentName: data.componentName,
      swPath: data.swPath,
      user: data.user,
      params: data.params,
      componentState: data.componentState,
    };
    logger.log('Updated window.__WEBS_STATE__', window.__WEBS_STATE__);

    session.setUser(data.user);
  } catch (err) {
    logger.error(
      'Error during client-side navigation, falling back to full page reload.',
      err,
    );
    window.location.assign(url.href);
  }
}

export const router = {
  push(href, fromClick = false) {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) {
      window.location.assign(href);
      return;
    }
    if (url.href !== window.location.href) {
      performNavigation(url, { fromClick });
    }
  },
};

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
        logger.log('Mounting application...', {
          rootComponent: rootComponent.name,
          rootProps,
        });
        const vnode = createVnode(rootComponent, rootProps);
        vnode.appContext = app._context;
        app._vnode = vnode;
        app._container = rootContainer;
        const rootInstance = app._context.hydrate(vnode, rootContainer);
        if (rootInstance) {
          installNavigationHandler(app);
        }
        return rootInstance;
      },
    };
    return app;
  };
})();

export async function hydrate(componentManifest, dbConfig = null) {
  logger.log('Starting client-side hydration...');
  if (typeof window === 'undefined') {
    logger.log('Not in a browser environment. Aborting hydration.');
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    initDevTools();
  }

  const websState = deserializeState(window.__WEBS_STATE__ || {});
  logger.log(
    'Initial __WEBS_STATE__ from server:',
    JSON.parse(JSON.stringify(websState)),
  );

  if (dbConfig) {
    logger.log('Database configuration found. Setting global DB config.');
    window.__WEBS_DB_CONFIG__ = dbConfig;
  } else {
    logger.log('No database configuration provided.');
  }

  logger.log('Starting sync engine...');
  syncEngine.start();

  if ('serviceWorker' in navigator && websState.swPath) {
    logger.log(`Attempting to register service worker at: ${websState.swPath}`);
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(websState.swPath)
        .then((registration) => {
          logger.log(
            'Service Worker registered successfully with scope:',
            registration.scope,
          );
        })
        .catch((err) => {
          logger.error('Service Worker registration failed:', err);
        });
    });
  } else {
    logger.log('Service worker not supported or no swPath provided in state.');
  }

  const root = document.getElementById('root');
  if (!root) {
    logger.error('Root element #root not found. Aborting hydration.');
    return;
  }

  const { componentName, user = {}, params, componentState } = websState;
  if (!componentName) {
    logger.error(
      'No componentName found in __WEBS_STATE__. Aborting hydration.',
    );
    return;
  }
  logger.log(`Root component to hydrate: ${componentName}`);

  componentManifestInstance = componentManifest;
  const componentLoader = componentManifest.get(componentName);
  if (!componentLoader) {
    logger.error(
      `Component loader for "${componentName}" not found in manifest.`,
    );
    return;
  }

  const componentModule = await componentLoader();
  const rootComponent = componentModule.default;
  if (!rootComponent) {
    logger.error(
      `Module for "${componentName}" loaded, but it has no default export.`,
    );
    return;
  }

  const props = { params, initialState: componentState || {}, user };
  logger.log(
    'Creating app instance with props:',
    JSON.parse(JSON.stringify(props)),
  );

  const app = createApp(rootComponent, props, rootComponent.components || {});
  app.mount(root);
  logger.log('App mounted successfully.');

  if (window.__WEBS_DEVELOPER__) {
    window.__WEBS_DEVELOPER__.registerApp(appInstance);
  }

  session.setUser(websState.user);
  route.value.path = window.location.pathname;
}

function installNavigationHandler(app) {
  appInstance = app;

  const prefetch = async (url) => {
    const hasExtension = /\.[^/]+$/.test(url.pathname);
    if (hasExtension && !url.pathname.endsWith('.html')) return;

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
    router.push(href, true);
  });

  window.addEventListener('popstate', () => {
    const url = new URL(window.location.href);
    route.value.path = url.pathname;
    performNavigation(url, { isPopState: true, fromClick: false });
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
    const localData = await table.getAll();
    if (localData.length === 0 && serverData && serverData.length > 0) {
      await table.bulkPut(serverData);
    }
    await fetchData();
  };

  s.put = table.put;
  s.destroy = table.delete;

  fetchData();

  return s;
}
