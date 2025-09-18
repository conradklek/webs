/**
 * @file Manages the component instance, lifecycle hooks, and provide/inject system.
 */

import { VNode } from './vdom.js';
import { isRef, state } from './reactivity.js';
import { isObject, isFunction } from '../utils/lang.js';
import { createLogger } from '../developer/logger.js';
import { compile } from '../renderer/compiler.js';
import { normalizeClass } from '../utils/dom.js';

/**
 * @typedef {import('./vdom.js').Slots} Slots
 * @typedef {import('./vdom.js').Props} Props
 * @typedef {import('../server/server.js').OpenHandler} OpenHandler
 * @typedef {import('../server/server.js').MessageHandler} MessageHandler
 * @typedef {import('../server/server.js').CloseHandler} CloseHandler
 * @typedef {import('../server/server.js').ErrorHandler} ErrorHandler
 */

/**
 * @callback PropsReceivedHook
 * @param {Readonly<Record<string, any>>} newProps - The new props object.
 * @param {Readonly<Record<string, any>>} oldProps - The previous props object.
 * @returns {void}
 */

/**
 * @typedef {object} RouteHandlerContext
 * @property {Request & { user?: any, db?: any, params?: any }} req - The request object.
 * @property {import('bun:sqlite').Database} db - The database instance.
 * @property {import('../server/authentication.js')} user - The authenticated user.
 * @property {Record<string, string>} params - URL parameters.
 * @property {import('../server/fs.server.js').ServerFsApi} fs - The user's file system API.
 */

/**
 * @typedef {'onBeforeMount' | 'onMounted' | 'onBeforeUpdate' | 'onUpdated' | 'onUnmounted' | 'onReady' | 'onPropsReceived'} LifecycleHook
 */

/**
 * @template T
 * @typedef {object} ComponentInstance
 * @property {number} uid - A unique identifier for the component instance.
 * @property {VNode} vnode - The virtual node representing this component.
 * @property {Component<T>} type - The component definition object.
 * @property {Slots} slots - The slots passed to the component.
 * @property {Props} attrs - Fallthrough attributes.
 * @property {import('./reactivity.js').ReactiveProxy<Props>} props - The reactive props object.
 * @property {object} ctx - The public context proxy for the render function.
 * @property {object} internalCtx - The internal state and setup result.
 * @property {boolean} isMounted - Whether the component is currently mounted.
 * @property {VNode | null} subTree - The root VNode of the component's rendered template.
 * @property {(() => void) | null} update - The effect runner function for updates.
 * @property {((_ctx: object) => VNode | null) | null} render - The compiled render function for the component.
 * @property {AppContext} appContext - The application-level context.
 * @property {ComponentInstance<any> | null} parent - The parent component instance.
 * @property {Record<string | symbol, any>} provides - Provided values for dependency injection.
 * @property {{
 * onBeforeMount?: Function[],
 * onMounted?: Function[],
 * onBeforeUpdate?: Function[],
 * onUpdated?: Function[],
 * onUnmounted?: Function[],
 * onReady?: Function[],
 * onPropsReceived?: PropsReceivedHook[]
 * }} hooks - Registered lifecycle hooks.
 * @property {Node | null} lastEl - The last DOM element in the component's rendered output.
 */

/**
 * @typedef {object} PropOptions
 * @property {any} [default] - The default value for the prop.
 */

/**
 * @typedef {object} SetupContext
 * @property {Readonly<Record<string, any>>} attrs
 * @property {Readonly<Slots>} slots
 * @property {Readonly<Record<string, any>>} params
 */

/**
 * @template T
 * @typedef {object} Component
 * @property {string} name
 * @property {Record<string, PropOptions>} [props]
 * @property {(props: Readonly<Props>, context: SetupContext) => object | void} [setup]
 * @property {string | (() => string)} [template]
 * @property {() => VNode | null} [render]
 * @property {Record<string, Component<any>>} [components]
 * @property {Record<string, (context: object, ...args: any[]) => any>} [actions]
 * @property {(context: RouteHandlerContext) => Promise<Response | object | void>} [post]
 * @property {(context: RouteHandlerContext) => Promise<Response | object | void>} [patch]
 * @property {(context: RouteHandlerContext) => Promise<Response | object | void>} [put]
 * @property {(context: RouteHandlerContext) => Promise<Response | object | void>} [del]
 * @property {OpenHandler} [onOpen]
 * @property {MessageHandler} [onMessage]
 * @property {CloseHandler} [onClose]
 * @property {ErrorHandler} [onError]
 */

/**
 * @typedef {object} AppContext
 * @property {Record<string, Component<any>>} [components]
 * @property {object} [globals]
 * @property {Record<string | symbol, any>} [provides]
 * @property {Record<string, any>} [params]
 * @property {(n1: VNode | null, n2: VNode | null, container: Element, anchor?: Node | null, parentComponent?: ComponentInstance<any> | null) => void} [patch]
 * @property {(vnode: VNode, container: Element) => ComponentInstance<any> | undefined | null} [hydrate]
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
 * Provides a value that can be injected by any descendant component.
 * @param {string | symbol} key - The injection key.
 * @param {any} value - The value to provide.
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
 * @template T
 * @param {string | symbol} key - The injection key.
 * @param {T} [defaultValue] - A default value to return if no matching key is found.
 * @returns {T | undefined} The injected value.
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
 * @param {ComponentInstance<any> | null} instance
 */
export function setCurrentInstance(instance) {
  currentInstance = instance;
}

/**
 * @internal
 * @param {ComponentInstance<any>} instance
 */
export function pushInstance(instance) {
  instanceStack.push(instance);
  setCurrentInstance(instance);
}

/**
 * @internal
 */
export function popInstance() {
  instanceStack.pop();
  setCurrentInstance(instanceStack[instanceStack.length - 1] || null);
}

/**
 * @internal
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

export const onBeforeMount = createLifecycleMethod('onBeforeMount');
export const onMounted = createLifecycleMethod('onMounted');
export const onBeforeUpdate = createLifecycleMethod('onBeforeUpdate');
export const onUpdated = createLifecycleMethod('onUpdated');
export const onUnmounted = createLifecycleMethod('onUnmounted');
export const onReady = createLifecycleMethod('onReady');
export const onPropsReceived = createLifecycleMethod('onPropsReceived');

/**
 * @internal
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
