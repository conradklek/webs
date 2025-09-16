/**
 * @file Manages the component instance, lifecycle hooks, and provide/inject system.
 */

import { VNode } from './vdom.js';
import { isRef } from './reactivity.js';
import { isObject, isFunction } from '../utils/lang.js';
import { createLogger } from './logger.js';
import { compile } from '../renderer/compiler.js';
import { normalizeClass } from '../utils/dom.js';

/**
 * @typedef {import('../renderer/renderer.dom.js').Component<any>} Component
 * @typedef {import('../renderer/renderer.dom.js').AppContext} AppContext
 * @typedef {import('../renderer/renderer.dom.js').Slots} Slots
 * @typedef {import('../renderer/renderer.dom.js').Props} Props
 * @typedef {import('./reactivity.js').ReactiveEffect} ReactiveEffect
 */

/**
 * @template T
 * @typedef {object} ComponentInstance
 * @property {number} uid - A unique ID for the instance.
 * @property {VNode} vnode - The VNode that created this instance.
 * @property {Component} type - The component definition.
 * @property {Slots} slots - Resolved slots.
 * @property {Record<string, any>} attrs - Fallthrough attributes.
 * @property {Record<string, any>} props - Resolved props.
 * @property {object} ctx - The public context proxy for the render function.
 * @property {object} internalCtx - The internal state from setup and props.
 * @property {boolean} isMounted - Whether the component is currently mounted.
 * @property {VNode | null} subTree - The VNode representing the component's rendered output.
 * @property {ReactiveEffect['run'] | null} update - The reactive effect runner for updates.
 * @property {((_ctx: object) => VNode | null)} render - The compiled render function.
 * @property {AppContext} appContext - The application context.
 * @property {ComponentInstance<any> | null} parent - The parent component instance.
 * @property {{[key: string]: any; [key: symbol]: any}} provides - Provided values for dependency injection.
 * @property {Record<string, ((...args: any[]) => any)[]>} hooks - Registered lifecycle hooks.
 * @property {Node | null} lastEl - The last DOM node in the component's rendered tree.
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
  // @ts-ignore - The index signature handles both string and symbol.
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
    // @ts-ignore - The index signature handles both string and symbol.
    if (instance.provides && key in instance.provides) {
      // @ts-ignore
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
 * @typedef {'onBeforeMount' | 'onMounted' | 'onBeforeUpdate' | 'onUpdated' | 'onUnmounted' | 'onReady' | 'onPropsReceived'} LifecycleHook
 */

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
      `SSR: Creating component instance for <${/**@type {Component}*/ (vnode.type).name}>`,
    );
  } else {
    logger.info(
      `Creating component instance for <${/**@type {Component}*/ (vnode.type).name}>`,
    );
  }

  /** @type {ComponentInstance<any>} */
  const instance = {
    uid: instanceIdCounter++,
    vnode,
    type: /**@type {Component}*/ (vnode.type),
    slots: /** @type {Slots} */ (vnode.children) || {},
    attrs: {},
    props: {},
    ctx: {},
    internalCtx: {},
    isMounted: false,
    subTree: null,
    update: null,
    render: () => null,
    appContext,
    parent,
    provides: parent
      ? parent.provides
      : Object.create(appContext.provides || null),
    hooks: {},
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

  instance.props = resolvedProps;

  let setupResult = {};
  if (setup) {
    const setupContext = {
      attrs: instance.attrs,
      slots: instance.slots,
      params: instance.appContext.params || {},
    };
    pushInstance(instance);
    setupResult = setup(resolvedProps, setupContext) || {};
    popInstance();
  }

  if (!isSsr) {
    const serverState = (vnode.props || {}).initialState || {};
    const finalState = { ...resolvedProps, ...setupResult };
    applyServerState(finalState, serverState);
    instance.internalCtx = finalState;
  } else {
    instance.internalCtx = { ...resolvedProps, ...setupResult };
  }

  instance.ctx = new Proxy(
    {},
    {
      has: (_, key) =>
        !!(
          key in instance.internalCtx ||
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
        if (key in instance.internalCtx) {
          const val = /** @type {any} */ (instance.internalCtx)[key];
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
          const allProps = { ...instance.props };
          for (const propKey in allProps) {
            if (isRef(allProps[propKey])) {
              allProps[propKey] = allProps[propKey].value;
            }
          }
          return allProps;
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
        if (key in instance.internalCtx) {
          const s = /** @type {any} */ (instance.internalCtx)[key];
          if (isRef(s)) {
            s.value = value;
          } else {
            /** @type {any} */ (instance.internalCtx)[key] = value;
          }
          return true;
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
