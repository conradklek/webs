/**
 * @file Manages the component instance, its lifecycle hooks, and the provide/inject dependency injection system.
 * This is the heart of the framework's component model, defining how components are created, updated, and destroyed.
 */

import { VNode } from './vdom.js';
import { isRef, state } from './reactivity.js';
import { isObject, isFunction, normalizeClass } from '../shared/utils.js';
import { createLogger } from '../shared/logger.js';
import { compile } from './compiler.js';

/**
 * @typedef {import('./vdom.js').Slots} Slots
 * @typedef {import('./vdom.js').Props} Props
 * @typedef {import('../server/server.js').OpenHandler} OpenHandler
 * @typedef {import('../server/server.js').MessageHandler} MessageHandler
 * @typedef {import('../server/server.js').CloseHandler} CloseHandler
 * @typedef {import('../server/server.js').ErrorHandler} ErrorHandler
 */

/**
 * The signature for the `onPropsReceived` lifecycle hook callback.
 * It's called when a component receives new props, before it re-renders.
 * @callback PropsReceivedHook
 * @param {Readonly<Record<string, any>>} newProps - The new props object that the component is receiving.
 * @param {Readonly<Record<string, any>>} oldProps - The previous props object.
 * @returns {void}
 */

/**
 * Defines the context object provided to server-side route handlers (`post`, `patch`, etc.)
 * that are exported from a component file.
 * @typedef {object} RouteHandlerContext
 * @property {Request & { user?: any, db?: any, params?: any }} req - The standard Request object, augmented with user session data, the database instance, and URL parameters.
 * @property {import('bun:sqlite').Database} db - The server-side database instance.
 * @property {import('../server/authentication.js').UserInfo} user - The currently authenticated user, if any.
 * @property {Record<string, string>} params - An object containing URL parameters from a dynamic route (e.g., `{ id: '123' }` for a route like `/users/:id`).
 * @property {import('../server/fs.server.js').ServerFsApi} fs - The file system API, sandboxed to the current user's private storage.
 */

/**
 * A union type representing all possible lifecycle hook names.
 * @typedef {'onBeforeMount' | 'onMounted' | 'onBeforeUpdate' | 'onUpdated' | 'onUnmounted' | 'onReady' | 'onPropsReceived'} LifecycleHook
 */

/**
 * Represents the internal instance of a component at runtime. This object holds all the state,
 * props, and context necessary for the component to render and update. It is created by the
 * renderer for each component in the VDOM tree.
 * @template T
 * @typedef {object} ComponentInstance
 * @property {number} uid - A unique identifier for this specific component instance.
 * @property {VNode} vnode - The virtual node representing this component in the VDOM tree.
 * @property {Component<T>} type - The original component definition object (the export from the `.webs` file).
 * @property {Slots} slots - The slots passed to the component from its parent.
 * @property {Props} attrs - Fallthrough attributes: props passed to the component that were not declared in its `props` definition.
 * @property {import('./reactivity.js').ReactiveProxy<Props>} props - The reactive props object.
 * @property {object} ctx - The public context proxy exposed to the component's render function. It provides access to props, setup state, and globals.
 * @property {object} internalCtx - The internal state returned from the `setup` function. This is not directly exposed to the template.
 * @property {boolean} isMounted - A flag indicating if the component is currently mounted to the DOM.
 * @property {VNode | null} subTree - The root VNode of the component's rendered template.
 * @property {(() => void) | null} update - The reactive effect runner function that triggers component re-renders.
 * @property {((_ctx: object) => VNode | null) | null} render - The compiled render function for the component's template.
 * @property {AppContext} appContext - The application-level context, containing global components and providers.
 * @property {ComponentInstance<any> | null} parent - The parent component instance.
 * @property {Record<string | symbol, any>} provides - Values provided by this component for its descendants via the provide/inject mechanism.
 * @property {Record<LifecycleHook, Function[]>} hooks - A record of registered lifecycle hooks for this instance.
 * @property {Node | null} lastEl - The last DOM element in the component's rendered output, used as an anchor for fragments.
 */

/**
 * Defines the options for a single component prop.
 * @typedef {object} PropOptions
 * @property {any} [default] - The default value for the prop if it is not provided by the parent. Can be a value or a factory function.
 * @example
 * // In a component definition:
 * export const props = {
 * // A simple prop with a default value
 * variant: { default: 'primary' },
 * // A prop with a factory function for a default object
 * config: { default: () => ({ theme: 'dark' }) }
 * };
 */

/**
 * The context object passed to a component's `setup` function.
 * @typedef {object} SetupContext
 * @property {Readonly<Record<string, any>>} attrs - A non-reactive object of fallthrough attributes. These are attributes passed from the parent that are not declared as props.
 * @property {Readonly<Slots>} slots - An object representing the content passed into the component's slots from its parent.
 * @property {Readonly<Record<string, any>>} params - Route parameters from the URL if the component is rendered by the router.
 */

/**
 * The main definition object for a component. This is what you export from a `.webs` file's `<script>` block.
 * @template T
 * @typedef {object} Component
 * @property {string} name - The unique name of the component, automatically derived from its file path.
 * @property {Record<string, PropOptions>} [props] - An object defining the props the component accepts.
 * @property {(props: Readonly<Props>, context: SetupContext) => object | void} [setup] - The composition function where you define reactive state, computed properties, and lifecycle hooks.
 * @property {string | (() => string)} [template] - The HTML template for the component, injected by the compiler.
 * @property {() => VNode | null} [render] - An optional manual render function. If provided, it overrides the `template`.
 * @property {Record<string, Component<any>>} [components] - An object of components to be registered for local use within this component's template.
 * @property {Record<string, (context: object, ...args: any[]) => any>} [actions] - Server-side functions that can be called from the client using the `action()` composable.
 * @property {(context: RouteHandlerContext) => Promise<Response | object | void>} [post] - A server-side handler for POST requests to the component's route.
 * @property {(context: RouteHandlerContext) => Promise<Response | object | void>} [patch] - A server-side handler for PATCH requests.
 * @property {(context: RouteHandlerContext) => Promise<Response | object | void>} [put] - A server-side handler for PUT requests.
 * @property {(context: RouteHandlerContext) => Promise<Response | object | void>} [del] - A server-side handler for DELETE requests.
 * @property {OpenHandler} [onOpen] - A server-side handler for WebSocket open events.
 * @property {MessageHandler} [onMessage] - A server-side handler for WebSocket message events.
 * @property {CloseHandler} [onClose] - A server-side handler for WebSocket close events.
 * @property {ErrorHandler} [onError] - A server-side handler for WebSocket error events.
 */

/**
 * Represents the application-level context that is shared across all components in an app.
 * @typedef {object} AppContext
 * @property {Record<string, Component<any>>} [components] - Globally registered components.
 * @property {object} [globals] - Global properties accessible in all component templates.
 * @property {Record<string | symbol, any>} [provides] - Globally provided values for dependency injection.
 * @property {Record<string, any>} [params] - Route parameters from the current URL.
 * @property {(n1: VNode | null, n2: VNode | null, container: Element, anchor?: Node | null, parentComponent?: ComponentInstance<any> | null) => void} [patch] - The internal DOM patching function.
 * @property {(vnode: VNode, container: Element) => ComponentInstance<any> | undefined | null} [hydrate] - The internal hydration function.
 */

/**
 * @typedef {object} RendererOptions
 * @property {(tag: string) => Element} createElement
 * @property {(text: string) => globalThis.Text} createText
 * @property {(text: string) => globalThis.Comment} createComment
 * @property {(el: Element, text: string) => void} setElementText
 * @property {(child: Node, parent: Element, anchor?: Node | null) => void} insert
 * @property {(child: Node) => void} remove
 * @property {(el: Element, key: string, prevValue: any, nextValue: any) => void} patchProp
 * @property {(selector: string) => Element | null} querySelector
 */

/**
 * @template T
 * @typedef {object} Renderer
 * @property {(n1: VNode | null, n2: VNode | null, container: Element, anchor?: Node | null, parentComponent?: ComponentInstance<any> | null) => void} patch
 * @property {(vnode: VNode, container: Element) => ComponentInstance<any> | undefined | null} hydrate
 */

/**
 * @typedef {Window & { __WEBS_DEVELOPER__?: { events: { emit: (event: string, data: any) => void; } } }} DevtoolsWindow
 */

const logger = createLogger('[Component]');
let instanceIdCounter = 0;

/**
 * @internal
 * @type {ComponentInstance<any> | null}
 */
let currentInstance = null;

/**
 * @internal
 * @type {ComponentInstance<any>[]}
 */
const instanceStack = [];

/**
 * Provides a value that can be injected by any descendant component in the component tree.
 * This is useful for passing data down through multiple levels of components without prop drilling.
 * Must be called within a component's `setup` function.
 *
 * @param {string | symbol} key - The unique injection key. Can be a string or a Symbol.
 * @param {any} value - The value to provide. This can be any value, including reactive state.
 * @example
 * // In a parent component (e.g., TheApp.webs)
 * import { provide, state } from '@conradklek/webs';
 *
 * export function setup() {
 * const theme = state({ color: 'dark' });
 * provide('theme', theme);
 * }
 */
export function provide(key, value) {
  if (!currentInstance) return;

  if (currentInstance.provides === currentInstance.parent?.provides) {
    currentInstance.provides = Object.create(
      currentInstance.parent?.provides || null,
    );
  }
  currentInstance.provides[key] = value;
}

/**
 * Injects a value provided by an ancestor component.
 * Must be called within a component's `setup` function.
 *
 * @template T
 * @param {string | symbol} key - The injection key that matches the key used in `provide`.
 * @param {T} [defaultValue] - An optional default value to return if no matching key is found in the ancestor tree.
 * @returns {T | undefined} The injected value, or the default value if not found.
 * @example
 * // In a child component
 * import { inject } from '@conradklek/webs';
 *
 * export function setup() {
 * const theme = inject('theme'); // Injects the theme object from the parent
 * // Now `theme.value.color` can be used.
 *
 * // With a default value
 * const analyticsId = inject('analyticsId', 'default-id');
 * }
 */
export function inject(key, defaultValue) {
  if (!currentInstance) return defaultValue;

  /** @type {ComponentInstance<any> | null} */
  let instance = currentInstance;
  while (instance) {
    if (instance.provides && key in instance.provides) {
      return instance.provides[key];
    }
    instance = instance.parent;
  }

  return defaultValue;
}

/**
 * @internal
 * Sets the currently active component instance.
 * @param {ComponentInstance<any> | null} instance
 */
export function setCurrentInstance(instance) {
  currentInstance = instance;
}

/**
 * @internal
 * Pushes an instance onto the stack, making it the current instance.
 * @param {ComponentInstance<any>} instance
 */
export function pushInstance(instance) {
  instanceStack.push(instance);
  setCurrentInstance(instance);
}

/**
 * @internal
 * Pops an instance from the stack, restoring the previous instance as current.
 */
export function popInstance() {
  instanceStack.pop();
  setCurrentInstance(instanceStack[instanceStack.length - 1] || null);
}

/**
 * @internal
 * Generic factory function for creating lifecycle hook registration methods.
 * @param {LifecycleHook} name
 * @returns {(hook: Function) => void}
 */
function createLifecycleMethod(name) {
  return (hook) => {
    if (!currentInstance) return;
    const inst = currentInstance;
    if (!inst.hooks[name]) {
      inst.hooks[name] = [];
    }
    /** @type {Function[]} */ (inst.hooks[name]).push(hook);
  };
}

/**
 * Registers a callback to be executed right before the component is mounted to the DOM.
 * @param {() => void} hook - The callback function to execute.
 * @example
 * onBeforeMount(() => {
 * console.log('Component is about to be mounted!');
 * });
 */
export const onBeforeMount = createLifecycleMethod('onBeforeMount');

/**
 * Registers a callback to be executed after the component has been mounted to the DOM.
 * This is the ideal hook for performing DOM manipulations or fetching initial data.
 * @param {() => void} hook - The callback function to execute.
 * @example
 * onMounted(() => {
 * const element = document.getElementById('my-element');
 * console.log('Component has been mounted:', element);
 * });
 */
export const onMounted = createLifecycleMethod('onMounted');

/**
 * Registers a callback to be executed right before the component re-renders due to a reactive state change.
 * @param {() => void} hook - The callback function to execute.
 */
export const onBeforeUpdate = createLifecycleMethod('onBeforeUpdate');

/**
 * Registers a callback to be executed after the component has re-rendered.
 * @param {() => void} hook - The callback function to execute.
 */
export const onUpdated = createLifecycleMethod('onUpdated');

/**
 * Registers a callback to be executed right before the component is unmounted from the DOM.
 * This is the place to clean up subscriptions, timers, or event listeners.
 * @param {() => void} hook - The callback function to execute.
 * @example
 * onUnmounted(() => {
 * console.log('Cleaning up component...');
 * mySubscription.unsubscribe();
 * });
 */
export const onUnmounted = createLifecycleMethod('onUnmounted');

/**
 * Registers a callback to be executed after the component's `setup` function has completed,
 * but before any lifecycle hooks.
 * @param {() => void} hook - The callback function to execute.
 */
export const onReady = createLifecycleMethod('onReady');

/**
 * Registers a callback to be executed when the component receives new props.
 * @param {PropsReceivedHook} hook - The callback function, which receives new and old props.
 */
export const onPropsReceived = createLifecycleMethod('onPropsReceived');

/**
 * @internal
 * Merges props from a VNode with fallthrough attributes.
 * @param {Props} vnodeProps
 * @param {Props} fallthroughAttrs
 * @returns {Props}
 */
export function mergeProps(vnodeProps, fallthroughAttrs) {
  const merged = { ...vnodeProps };
  for (const key in fallthroughAttrs) {
    if (key === 'class' && fallthroughAttrs[key]) {
      merged.class = normalizeClass([vnodeProps.class, fallthroughAttrs.class]);
    } else if (key === 'style' && fallthroughAttrs[key]) {
      merged.style = {
        ...(isObject(vnodeProps.style) ? vnodeProps.style : {}),
        ...(isObject(fallthroughAttrs.style) ? fallthroughAttrs.style : {}),
      };
    } else if (!(key in merged)) {
      merged[key] = fallthroughAttrs[key];
    }
  }
  return merged;
}

/**
 * @internal
 * Recursively applies state from the server to the client-side state during hydration.
 * @param {object} targetState
 * @param {object} serverState
 */
export function applyServerState(targetState, serverState) {
  logger.debug('Applying server state...', {
    targetState: { ...targetState },
    serverState: { ...serverState },
  });
  if (!isObject(targetState) || !isObject(serverState)) return;

  for (const key in serverState) {
    if (!Object.prototype.hasOwnProperty.call(serverState, key)) continue;
    const serverVal = /** @type {any} */ (serverState)[key];
    const existing = /** @type {Record<string, any>} */ (targetState)[key];

    if (isRef(existing)) {
      if (existing.value !== serverVal) {
        logger.debug(`Updating ref for key: ${key}`, {
          from: existing.value,
          to: serverVal,
        });
        if (isObject(existing.value) && isObject(serverVal)) {
          applyServerState(existing.value, serverVal);
        } else {
          existing.value = serverVal;
        }
      }
    } else if (Array.isArray(existing) && Array.isArray(serverVal)) {
      logger.debug(`Updating array for key: ${key}`);
      existing.length = 0;
      existing.push(...serverVal);
    } else if (
      isObject(existing) &&
      isObject(serverVal) &&
      !Array.isArray(existing)
    ) {
      logger.debug(`Recursively applying state for key: ${key}`);
      applyServerState(existing, serverVal);
    } else {
      logger.debug(`Directly setting state for key: ${key}`);
      /** @type {any} */ (targetState)[key] = serverVal;
    }
  }
}

/**
 * @internal
 * Creates a component instance from a VNode.
 * @param {VNode} vnode
 * @param {ComponentInstance<any> | null} parent
 * @param {boolean} isSsr
 * @returns {ComponentInstance<any>}
 */
export function createComponent(vnode, parent, isSsr = false) {
  const parentAppContext = parent ? parent.appContext : {};
  const appContext = vnode.appContext || parentAppContext;
  if (!appContext.globals) appContext.globals = {};
  if (!appContext.provides) appContext.provides = {};

  if (isSsr) {
    logger.debug(
      `SSR: Creating component instance for <${/**@type {Component<any>}*/ (vnode.type).name}>`,
    );
  } else {
    logger.info(
      `Creating component instance for <${/**@type {Component<any>}*/ (vnode.type).name}>`,
    );
  }

  /** @type {ComponentInstance<any>} */
  const instance = {
    uid: instanceIdCounter++,
    vnode,
    type: /**@type {Component<any>}*/ (vnode.type),
    slots: /** @type {Slots} */ (vnode.children) || {},
    attrs: {},
    props: {},
    ctx: {},
    internalCtx: {},
    isMounted: false,
    subTree: null,
    update: null,
    render: null,
    appContext,
    parent,
    provides: parent
      ? parent.provides
      : Object.create(appContext.provides || null),
    hooks: {
      onBeforeMount: [],
      onMounted: [],
      onBeforeUpdate: [],
      onUpdated: [],
      onUnmounted: [],
      onReady: [],
      onPropsReceived: [],
    },
    lastEl: null,
  };

  const { props: propsOptions, setup } = instance.type;
  const vnodeProps = vnode.props || {};
  const resolvedProps = {};

  for (const key in vnodeProps) {
    if (
      propsOptions &&
      Object.prototype.hasOwnProperty.call(propsOptions, key)
    ) {
      /** @type {any} */ (resolvedProps)[key] = vnodeProps[key];
    } else {
      /** @type {any} */ (instance.attrs)[key] = vnodeProps[key];
    }
  }

  if (propsOptions) {
    for (const key in propsOptions) {
      if (!Object.prototype.hasOwnProperty.call(resolvedProps, key)) {
        const options = propsOptions[key];
        const def = options?.hasOwnProperty('default')
          ? options.default
          : undefined;
        /** @type {any} */ (resolvedProps)[key] = isFunction(def) ? def() : def;
      }
    }
  }

  instance.props = state(resolvedProps);

  let setupResult = {};
  if (setup) {
    const setupContext = {
      attrs: instance.attrs,
      slots: instance.slots,
      params: instance.appContext.params || {},
    };
    pushInstance(instance);
    setupResult = setup(instance.props, setupContext) || {};
    popInstance();
  }

  instance.internalCtx = setupResult;

  if (!isSsr) {
    const serverState = (vnode.props || {}).initialState || {};
    const stateForHydration = { ...instance.internalCtx, ...instance.props };
    applyServerState(stateForHydration, serverState);
  }

  instance.ctx = new Proxy(
    {},
    {
      has: (_, key) =>
        !!(
          (instance.internalCtx && key in instance.internalCtx) ||
          (instance.props && key in instance.props) ||
          key === '$attrs' ||
          key === '$slots' ||
          key === '$props' ||
          (instance.appContext.params && key === 'params') ||
          (instance.type.components && key in instance.type.components) ||
          (instance.appContext.components &&
            key in instance.appContext.components) ||
          (instance.appContext.globals && key in instance.appContext.globals)
        ),
      get: (_, key) => {
        if (instance.internalCtx && key in instance.internalCtx) {
          const val = /** @type {any} */ (instance.internalCtx)[key];
          return isRef(val) ? val.value : val;
        }
        if (instance.props && key in instance.props) {
          const val = /** @type {any} */ (instance.props)[key];
          return isRef(val) ? val.value : val;
        }

        if (instance.appContext.params && key === 'params') {
          return instance.appContext.params;
        }
        if (key === '$attrs') {
          return instance.attrs;
        }
        if (key === '$slots') {
          return instance.slots;
        }
        if (key === '$props') {
          return instance.props;
        }

        if (isSsr) {
          const allComponents = {
            ...(instance.type.components || {}),
            ...(instance.appContext.components || {}),
          };
          if (key in allComponents) {
            return allComponents[/** @type {string} */ (key)];
          }
        }

        if (instance.type.components && key in instance.type.components)
          return instance.type.components[/** @type {string} */ (key)];
        if (
          instance.appContext.components &&
          key in instance.appContext.components
        )
          return instance.appContext.components[/** @type {string} */ (key)];
        if (instance.appContext.globals && key in instance.appContext.globals)
          return /** @type {any} */ (instance.appContext.globals)[key];

        return undefined;
      },
      set: (_, key, value) => {
        if (isSsr) return false;
        if (instance.internalCtx && key in instance.internalCtx) {
          const s = /** @type {any} */ (instance.internalCtx)[key];
          if (isRef(s)) {
            s.value = value;
          } else {
            /** @type {any} */ (instance.internalCtx)[key] = value;
          }
          return true;
        }
        if (instance.props && key in instance.props) {
          logger.warn(
            `Attempted to mutate prop "${String(key)}". Props are readonly.`,
          );
        }
        return false;
      },
    },
  );

  instance.render = compile(instance.type, {
    globalComponents: instance.appContext.components,
  });

  return instance;
}
