/**
 * @file Manages component lifecycle hooks and the provide/inject dependency injection system.
 */

/**
 * @typedef {import('./component.js').ComponentInstance<any>} ComponentInstance
 */

/**
 * @internal
 * @type {ComponentInstance | null}
 * The currently active component instance during its setup phase. This is a global
 * mutable state that is managed by the renderer.
 */
let currentInstance = null;

/**
 * @internal
 * @type {ComponentInstance[]}
 * A stack to manage nested component instances, ensuring that lifecycle hooks
 * and provide/inject calls are associated with the correct component.
 */
const instanceStack = [];

/**
 * Provides a value that can be injected by any descendant component. This is useful
 * for passing data down the component tree without prop drilling.
 * @param {string | symbol} key - The injection key. Can be a string or a symbol.
 * @param {any} value - The value to provide.
 * @example
 * // In an ancestor component
 * import { provide } from '@conradklek/webs';
 * provide('theme', 'dark');
 *
 * // In a descendant component
 * import { inject } from '@conradklek/webs';
 * const theme = inject('theme'); // 'dark'
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
 * Injects a value provided by an ancestor component. It will search up the
 * component chain until it finds a provided value with the matching key.
 * @template T
 * @param {string | symbol} key - The injection key.
 * @param {T} [defaultValue] - A default value to return if no matching key is found.
 * @returns {T | undefined} The injected value, or the default value if provided and no value is found.
 */
export function inject(key, defaultValue) {
  if (!currentInstance) return defaultValue;

  /** @type {ComponentInstance | null} */
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
 * @description Sets the current active component instance. Called by the renderer.
 * @param {ComponentInstance | null} instance - The component instance to set as current.
 */
export function setCurrentInstance(instance) {
  currentInstance = instance;
}

/**
 * @internal
 * @description Pushes a component instance onto the stack and sets it as the current instance.
 * @param {ComponentInstance} instance - The component instance to push.
 */
export function pushInstance(instance) {
  instanceStack.push(instance);
  setCurrentInstance(instance);
}

/**
 * @internal
 * @description Pops the current component instance from the stack and restores the previous one.
 */
export function popInstance() {
  instanceStack.pop();
  setCurrentInstance(instanceStack[instanceStack.length - 1] || null);
}

/**
 * @internal
 * @description A factory function to create lifecycle hook registration functions.
 * @param {keyof ComponentInstance['hooks']} name - The name of the lifecycle hook.
 * @returns {(hook: Function) => void} A function that allows registering a hook.
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
 * @description Registers a hook to be called before the component is mounted to the DOM.
 * @param {() => void} hook - The function to call before mount.
 */
export const onBeforeMount = createLifecycleMethod('onBeforeMount');

/**
 * @description Registers a hook to be called after the component has been mounted to the DOM.
 * @param {() => void} hook - The function to call after the component is mounted.
 */
export const onMounted = createLifecycleMethod('onMounted');

/**
 * @description Registers a hook to be called before the component is updated due to reactive state changes.
 * @param {() => void} hook - The function to call before an update.
 */
export const onBeforeUpdate = createLifecycleMethod('onBeforeUpdate');

/**
 * @description Registers a hook to be called after the component has been updated and the DOM has been patched.
 * @param {() => void} hook - The function to call after an update.
 */
export const onUpdated = createLifecycleMethod('onUpdated');

/**
 * @description Registers a hook to be called just before the component is unmounted from the DOM.
 * This is the ideal place for cleanup, like clearing intervals or removing event listeners.
 * @param {() => void} hook - The function to call before unmounting.
 */
export const onUnmounted = createLifecycleMethod('onUnmounted');

/**
 * @description Registers a hook to be called when the application is fully hydrated and ready on the client.
 * This hook only runs on the client-side.
 * @param {() => void} hook - The function to call when the app is ready.
 */
export const onReady = createLifecycleMethod('onReady');

/**
 * @callback PropsReceivedHook
 * @param {Readonly<Record<string, any>>} newProps - The new props object.
 * @param {Readonly<Record<string, any>>} oldProps - The previous props object.
 * @returns {void}
 */

/**
 * @description Registers a hook that is called when a component receives new props from its parent.
 * Note: This hook runs *before* the component re-renders.
 * @param {PropsReceivedHook} hook - The function to call with new and old props.
 */
export const onPropsReceived = createLifecycleMethod('onPropsReceived');
