/**
 * @file Core application logic, including app creation, routing, and client-side hydration.
 */

import { createRenderer } from '../renderer/renderer.js';
import { createVnode } from './vdom.js';
import { ref } from './reactivity.js';
import { createLogger } from '../developer/logger.js';
import { normalizeClass } from '../utils/dom.js';
import { initDevTools } from '../developer/developer.js';
import { session } from '../client/runtime.js';
import { coreDB } from '../client/db.client.js';
import { syncEngine } from '../client/sync-engine.js';

/**
 * @typedef {import('./vdom.js').VNode} VNode
 * @typedef {import('../renderer/renderer.js').Component<any>} Component
 * @typedef {import('./component.js').ComponentInstance<any>} ComponentInstance
 * @typedef {import('../renderer/renderer.js').Renderer<any>} Renderer
 */
/**
 * @template T
 * @typedef {import('./reactivity.js').Ref<T>} Ref
 */

/**
 * @typedef {Element & { _vei?: Record<string, any> }} ElementWithVEI
 */

/**
 * @typedef {object} WebsState
 * @property {string} componentName
 * @property {string} [swPath]
 * @property {object} [user]
 * @property {object} [params]
 * @property {object} [componentState]
 * @property {object} [sourceToComponentMap]
 */

/**
 * @internal
 * @typedef {object} AppContext
 * @property {Record<string, Component>} components - Registered components.
 * @property {Record<string | symbol, any>} provides - Dependency injection container.
 * @property {Renderer['patch']} patch - The renderer's patch function.
 * @property {Renderer['hydrate']} hydrate - The renderer's hydrate function.
 * @property {object} params - Route parameters.
 * @property {object} [globals] - Global properties accessible in templates.
 */

/**
 * @internal
 * @typedef {object} App
 * @property {Component} _component - The root component definition.
 * @property {Element | null} _container - The root DOM container.
 * @property {VNode | null} _vnode - The root virtual node.
 * @property {AppContext} _context - The application context.
 * @property {(rootContainer: Element) => ComponentInstance | undefined | null} mount - Mounts the application.
 */

const logger = createLogger('[Core]');

/**
 * @internal
 * @type {App | null}
 * The singleton application instance.
 */
let appInstance = null;

/**
 * @internal
 * @type {Map<string, () => Promise<{default: Component}>> | null}
 * The manifest for dynamically loading components.
 */
let componentManifestInstance = null;

/**
 * @internal
 * @type {Map<string, any>}
 * Cache for pre-fetched page data during navigation.
 */
const prefetchCache = new Map();

/**
 * @internal
 * @type {object | null}
 * A map from source file paths to component names, used in development.
 */
let sourceToComponentMap = null;

/**
 * @description A reactive object representing the current route.
 * @type {Ref<{path: string}>}
 */
export const route = ref({ path: '/' });

/**
 * @internal
 * @description Handles the logic for client-side navigation, fetching data and patching the DOM.
 * @param {URL} url - The URL to navigate to.
 * @param {{isPopState?: boolean, fromClick?: boolean}} [options={}] - Navigation options.
 * @returns {Promise<void>}
 */
async function performNavigation(
  url,
  { isPopState = false, fromClick = false } = {},
) {
  logger.info(`Starting navigation to: ${url.href}`);
  try {
    let data;
    if (!isPopState && fromClick && prefetchCache.has(url.href)) {
      data = prefetchCache.get(url.href);
      prefetchCache.delete(url.href);
      logger.debug('Used prefetched data for navigation.');
    } else {
      logger.debug('Fetching navigation data from server... ');
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

    if (!componentManifestInstance) {
      throw new Error('Component manifest not available.');
    }

    const { componentName } = data;
    const componentLoader = componentManifestInstance.get(componentName);

    if (!componentLoader) {
      logger.error(
        `Component loader for "${componentName}" not found. Full page reload.`,
      );
      window.location.assign(url.href);
      return;
    }

    const newComponentModule = await componentLoader();
    const newComponentDef = newComponentModule.default;

    if (!appInstance || !appInstance._vnode || !appInstance._container) {
      throw new Error('App instance is not properly initialized.');
    }

    const oldVnode = appInstance._vnode;
    const newProps = {
      params: data.params,
      initialState: data.componentState || {},
      user: data.user || null,
      path: url.pathname,
    };
    logger.debug('New props for component update:', newProps);

    appInstance._context.params = data.params;

    const newVnode = createVnode(newComponentDef, newProps);
    newVnode.appContext = appInstance._context;

    route.value.path = url.pathname;
    if (
      session &&
      typeof (/** @type {any} */ (session).setUser) === 'function'
    ) {
      /** @type {any} */ (session).setUser(data.user);
    }

    logger.info('Patching DOM with new component vnode...');
    appInstance._context.patch(
      oldVnode,
      newVnode,
      appInstance._container,
      null,
      null,
    );
    appInstance._vnode = newVnode;
    logger.info('DOM patching complete.');

    if (!isPopState) {
      window.history.pushState({}, '', url.href);
    }
    document.title = data.title;

    /** @type {any} */ (window).__WEBS_STATE__ = {
      componentName: data.componentName,
      swPath: data.swPath,
      user: data.user,
      params: data.params,
      componentState: data.componentState,
    };
    logger.debug(
      'Updated window.__WEBS_STATE__',
      /** @type {any} */ (window).__WEBS_STATE__,
    );
  } catch (err) {
    logger.error(
      'Error during client-side navigation, falling back to full page reload.',
      err,
    );
    window.location.assign(url.href);
  }
}

/**
 * @description Client-side router for programmatic navigation.
 */
export const router = {
  /**
   * @description Navigates to a new URL.
   * @param {string} href - The destination URL.
   * @param {boolean} [fromClick=false] - Indicates if the navigation was triggered by a user click.
   */
  push(href, fromClick = false) {
    logger.debug(
      `Router push called with href: ${href}, fromClick: ${fromClick}`,
    );
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) {
      logger.debug(
        `External URL detected, performing full page load to: ${href}`,
      );
      window.location.assign(href);
      return;
    }
    if (url.href !== window.location.href) {
      logger.debug(`Internal navigation to: ${url.href}`);
      performNavigation(url, { fromClick });
    } else {
      logger.debug('URL is the same, no navigation needed.');
    }
  },
};

/**
 * @description Creates an application instance. This is the main entry point for the framework.
 */
export const createApp = (() => {
  const renderer = createRenderer({
    createElement: (tag) => document.createElement(tag),
    createText: (text) => document.createTextNode(text),
    createComment: (text) => document.createComment(text),
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
    patchProp: (/** @type {ElementWithVEI} */ el, key, prevVal, nextVal) => {
      if (key === 'ref') {
        if (prevVal && typeof prevVal === 'object' && 'value' in prevVal) {
          prevVal.value = null;
        }
        if (nextVal && typeof nextVal === 'object' && 'value' in nextVal) {
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
            invoker = el._vei[eventName] = (
              /** @type {{ timeStamp: number; }} */ e,
            ) => {
              if (e.timeStamp < invoker.attached) return;
              if (Array.isArray(invoker.value)) {
                invoker.value.forEach((/** @type {(arg0: any) => void} */ fn) =>
                  fn(e),
                );
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
          /** @type {HTMLElement} */ (el).style.cssText = nextVal;
        } else if (nextVal && typeof nextVal === 'object') {
          for (const styleKey in nextVal) {
            /** @type {any} */ (/** @type {HTMLElement} */ (el).style)[
              styleKey
            ] = nextVal[styleKey];
          }
          if (prevVal && typeof prevVal === 'object') {
            for (const oldKey in prevVal) {
              if (!(oldKey in nextVal)) {
                /** @type {any} */ (/** @type {HTMLElement} */ (el).style)[
                  oldKey
                ] = '';
              }
            }
          }
        }
      } else if (
        key in el &&
        typeof (/** @type {any} */ (el)[key]) === 'boolean'
      ) {
        /** @type {any} */ (el)[key] = !!nextVal;
      } else if (key in el) {
        if (/** @type {any} */ (el)[key] !== nextVal)
          /** @type {any} */ (el)[key] = nextVal;
      } else {
        if (nextVal === true || nextVal === '') {
          el.setAttribute(key, '');
        } else if (nextVal == null || nextVal === false) {
          el.removeAttribute(key);
        } else {
          el.setAttribute(key, String(nextVal));
        }
      }
    },
    querySelector: (selector) => document.querySelector(selector),
  });

  /**
   * @param {Component} rootComponent - The root component for the application.
   * @param {object} [rootProps={}] - Initial props for the root component.
   * @param {Record<string, Component>} [globalComponents={}] - Components to register globally.
   * @returns {App} The application instance.
   */
  return function createApp(
    rootComponent,
    rootProps = {},
    globalComponents = {},
  ) {
    /** @type {App} */
    const app = {
      _component: rootComponent,
      _container: null,
      _vnode: null,
      _context: {
        components: { ...rootComponent.components, ...globalComponents },
        provides: {},
        patch: renderer.patch,
        hydrate: renderer.hydrate,
        params: /** @type {any} */ (rootProps).params || {},
      },
      /**
       * @param {Element} rootContainer
       */
      mount(rootContainer) {
        logger.info('Mounting application...', {
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
    appInstance = app;
    return app;
  };
})();

/**
 * @internal
 * @description In development mode, connects to the Hot Module Replacement WebSocket server.
 */
function connectToHmrServer() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/api/hmr`;
  const hmrSocket = new WebSocket(url);

  hmrSocket.onmessage = async () => {
    logger.info('HMR message received from server, forcing reload.');
    window.location.reload();
  };

  hmrSocket.onopen = () => {
    logger.info('HMR WebSocket connected.');
  };

  hmrSocket.onclose = () => {
    logger.warn('HMR WebSocket disconnected. Attempting to reconnect in 2s...');
    setTimeout(connectToHmrServer, 2000);
  };

  hmrSocket.onerror = (err) => {
    logger.error('HMR WebSocket error:', err);
  };
}

/**
 * @description Initializes the application on the client-side by hydrating server-rendered HTML.
 * @param {Map<string, () => Promise<{default: Component}>>} componentManifest - A map of component names to their async loaders.
 * @param {object | null} [dbConfig=null] - Database configuration.
 * @returns {Promise<void>}
 */
export async function hydrate(componentManifest, dbConfig = null) {
  logger.info('Starting client-side hydration... ');
  if (typeof window === 'undefined') {
    logger.info('Not in a browser environment. Aborting hydration.');
    return;
  }
  componentManifestInstance = componentManifest;

  /** @type {WebsState} */
  const websState = deserializeState(
    /** @type {any} */ (window).__WEBS_STATE__ || {},
  );
  logger.debug(
    'Initial __WEBS_STATE__ from server:',
    JSON.parse(JSON.stringify(websState)),
  );

  if (dbConfig) {
    logger.info('Database configuration found. Setting global DB config.');
    /** @type {any} */ (window).__WEBS_DB_CONFIG__ = dbConfig;
  } else {
    logger.info('No database configuration provided.');
  }

  if (websState.sourceToComponentMap) {
    sourceToComponentMap = websState.sourceToComponentMap;
    logger.debug(
      'Source-to-component mapping loaded from server state.',
      sourceToComponentMap,
    );
  }

  coreDB.setSyncEngine(syncEngine);
  syncEngine.init(coreDB);

  logger.info('Starting sync engine...');
  syncEngine.start();

  if ('serviceWorker' in navigator && websState.swPath) {
    logger.info(
      `Attempting to register service worker at: ${websState.swPath}`,
    );
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(websState.swPath || '')
        .then((registration) => {
          logger.info(
            'Service Worker registered successfully with scope:',
            registration.scope,
          );
        })
        .catch((err) => {
          logger.error('Service Worker registration failed:', err);
        });
    });
  } else {
    logger.info('Service worker not supported or no swPath provided in state.');
  }
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Development mode detected. Initializing HMR connection...');
    connectToHmrServer();
  }

  const startHydrationProcess = async () => {
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

    const rootComponentLoader = componentManifest.get(componentName);

    if (!rootComponentLoader) {
      logger.error(
        `Could not find component loader for "${componentName}". This may be a bundling or routing error on the server.`,
      );
      return;
    }

    try {
      const rootModule = await rootComponentLoader();
      const rootComponent = rootModule.default;

      if (!rootComponent) {
        logger.error('Failed to load root component for hydration.');
        return;
      }

      const props = { params, initialState: componentState || {}, user };
      const rootVnode = createVnode(rootComponent, props);

      logger.info(
        'Creating app instance with props:',
        JSON.parse(JSON.stringify(props)),
      );

      const app = createApp(
        rootComponent,
        props,
        rootComponent.components || {},
      );
      app._vnode = rootVnode;
      app._container = root;

      app._context.hydrate(rootVnode, root);
      logger.info('App mounted successfully.');

      installNavigationHandler(app);

      if (/** @type {any} */ (window).__WEBS_DEVELOPER__) {
        initDevTools();
        /** @type {any} */ (window).__WEBS_DEVELOPER__.registerApp(appInstance);
      }
      if (
        session &&
        typeof (/** @type {any} */ (session).setUser) === 'function'
      ) {
        /** @type {any} */ (session).setUser(websState.user);
      }
      route.value.path = window.location.pathname;
    } catch (err) {
      logger.error('Failed to load components for hydration:', err);
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startHydrationProcess);
  } else {
    setTimeout(startHydrationProcess, 0);
  }
}

/**
 * @internal
 * @description Sets up event listeners on the root container for client-side navigation.
 * @param {App} app - The application instance.
 */
function installNavigationHandler(app) {
  appInstance = app;

  /** @param {URL} url */
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
  if (!eventTarget) return;

  eventTarget.addEventListener(
    'mouseover',
    /** @type {EventListener} */ (
      (e) => {
        const event = /** @type {MouseEvent} */ (e);
        if (!(event.target instanceof Element)) return;
        const link = event.target.closest('a');
        if (
          !link ||
          link.target ||
          link.hasAttribute('download') ||
          event.metaKey ||
          event.ctrlKey
        )
          return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        const url = new URL(href, window.location.origin);
        if (url.origin === window.location.origin) prefetch(url);
      }
    ),
  );

  eventTarget.addEventListener(
    'click',
    /** @type {EventListener} */ (
      (e) => {
        const event = /** @type {MouseEvent} */ (e);
        if (!(event.target instanceof Element)) return;
        const link = event.target.closest('a');
        if (
          !link ||
          link.target ||
          link.hasAttribute('download') ||
          event.metaKey ||
          event.ctrlKey
        )
          return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return;

        event.preventDefault();
        router.push(href, true);
      }
    ),
  );

  window.addEventListener('popstate', () => {
    const url = new URL(window.location.href);
    performNavigation(url, { isPopState: true, fromClick: false });
  });
}

/**
 * @internal
 * @description Safely deserializes a value which may be a JSON string.
 * @param {any} input - The value to deserialize.
 * @returns {any} The deserialized object.
 */
function deserializeState(input) {
  try {
    if (typeof input === 'string') return JSON.parse(input);
    return input;
  } catch (e) {
    logger.error('Failed to deserialize state:', e);
    return input;
  }
}
