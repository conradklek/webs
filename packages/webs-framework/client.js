import { state } from './webs-engine';
import { onUnmounted, createRenderer, createVnode } from './webs-renderer';
import { db, syncEngine } from './client-db';
import { fs } from './client-fs';
import { session } from './client-me';

export { session, db, fs, syncEngine };

export * from './webs-engine';
export * from './webs-renderer';
export * from './webs-compiler';

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

    if (route) route.path = url.pathname;
    window.__WEBS_STATE__ = { componentName: data.componentName };
    session.setUser(data.user);

    const componentLoader = componentManifestInstance.get(data.componentName);
    const componentModule = await componentLoader();
    const newComponentDef = componentModule.default;

    if (!isPopState) window.history.pushState({}, '', url.href);
    document.title = data.title;

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
  } catch (err) {
    console.error('[Router] Client-side navigation failed:', err);
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
      if (/^on[A-Z]/.test(key)) {
        const eventName = key.slice(2).toLowerCase();
        if (prevVal) el.removeEventListener(eventName, prevVal);
        if (nextVal) el.addEventListener(eventName, nextVal);
      } else if (key === 'class') {
        el.className = normalizeClass(nextVal) || '';
      } else if (key === 'transition-name') {
        el.style.viewTransitionName = nextVal;
      } else if (key in el) {
        try {
          if (el[key] !== nextVal) el[key] = nextVal;
        } catch (e) {
          /* empty */
        }
      } else {
        if (nextVal == null) el.removeAttribute(key);
        else el.setAttribute(key, nextVal);
      }
    },
    querySelector: (selector) => document?.querySelector(selector),
  });

  return function createApp(rootComponent, rootProps = {}) {
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
        const vnode = createVnode(rootComponent, rootProps);
        vnode.appContext = app._context;
        app._vnode = vnode;
        app._container = rootContainer;
        const rootInstance = app._context.hydrate(vnode, rootContainer);
        if (rootInstance) installNavigationHandler(app, components);
        return rootInstance;
      },
    };
    return app;
  };
})();

export async function hydrate(componentManifest, dbConfig = null) {
  if (typeof window === 'undefined') return;

  const websState = deserializeState(window.__WEBS_STATE__ || {});
  window.__WEBS_DB_CONFIG__ = dbConfig;
  syncEngine.start();

  if ('serviceWorker' in navigator && websState.swPath) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(websState.swPath).catch(console.error);
    });
  }

  const root = document.getElementById('root');
  if (!root) return console.error('[Hydration] #root element not found.');

  const { componentName, user = {}, params, componentState } = websState;
  if (!componentName)
    return console.error('[Hydration] No component name in state.');

  const componentLoader = componentManifest.get(componentName);
  if (!componentLoader)
    return console.error(
      `[Hydration] Component loader not found: "${componentName}".`,
    );

  const componentModule = await componentLoader();
  const rootComponent = componentModule.default;
  const props = { params, initialState: componentState || {}, user };

  const app = createApp(rootComponent, props);
  app.mount(root, componentManifest);

  session.setUser(websState.user);
  route.path = window.location.pathname;
}

function installNavigationHandler(app, componentManifest) {
  appInstance = app;
  componentManifestInstance = componentManifest;

  const prefetch = async (url) => {
    if (prefetchCache.has(url.href)) return;
    try {
      const res = await fetch(url.pathname + url.search, {
        headers: { 'X-Webs-Navigate': 'true' },
      });
      if (
        res.ok &&
        res.headers.get('content-type')?.includes('application/json')
      ) {
        prefetchCache.set(url.href, deserializeState(await res.json()));
      }
    } catch (e) {
      /* Prefetch errors are non-critical */
    }
  };

  window.addEventListener('mouseover', (e) => {
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

  window.addEventListener('click', (e) => {
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

export function useTable(tableName, initialData = []) {
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
