import { reactive, computed } from "./reactivity.js";

/**
 * Creates a centralized store for state management.
 * The store's state is reactive, and it can be augmented with actions and getters.
 * @param {object} options - The store configuration.
 * @param {Function} options.state - A function that returns the initial state object.
 * @param {object} [options.actions] - An object of functions that can mutate the state. `this` is bound to the store instance.
 * @param {object} [options.getters] - An object of functions for computed values derived from the state. `this` is bound to the store instance.
 * @returns {Proxy} A reactive store instance that provides access to state, getters, and actions.
 */
export function create_store(options) {
  const store = reactive(options.state());
  const wrapped_actions = {};
  const wrapped_getters = {};
  if (options.actions) {
    for (const key in options.actions) {
      wrapped_actions[key] = options.actions[key].bind(store);
    }
  }
  if (options.getters) {
    for (const key in options.getters) {
      const computer = computed(() => options.getters[key].call(store));
      Object.defineProperty(wrapped_getters, key, {
        get: () => computer.value,
      });
    }
  }
  return new Proxy(store, {
    get(target, key, receiver) {
      if (key in wrapped_getters) {
        return wrapped_getters[key];
      }
      if (key in wrapped_actions) {
        return wrapped_actions[key];
      }
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      return Reflect.set(target, key, value, receiver);
    },
  });
}
