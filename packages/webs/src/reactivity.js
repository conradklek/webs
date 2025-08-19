/**
 * @fileoverview This file implements the core reactivity system for the framework.
 * It provides tools to create reactive objects, computed properties, and effects
 * that automatically track dependencies and re-run when those dependencies change.
 */

import { is_object } from "./utils";

/**
 * The currently running effect. This is the global "listener" that gets
 * associated with any reactive property that is accessed.
 * @type {object | null}
 */
let active_effect = null;

/**
 * A stack of effects. This is necessary to handle nested effects, ensuring
 * that the `active_effect` is correctly restored when an inner effect finishes.
 * @type {Array<object>}
 */
const effect_stack = [];

/**
 * A WeakMap to store all dependency relationships.
 * The structure is: `target -> Map(key -> Set(effects))`
 * @type {WeakMap<object, Map<any, Set<object>>>}
 */
const target_map = new WeakMap();

/**
 * A WeakMap to cache reactive proxies. This prevents creating multiple
 * proxies for the same raw object.
 * @type {WeakMap<object, Proxy>}
 */
const proxy_map = new WeakMap();

/**
 * A unique symbol to access the original, raw object from a reactive proxy.
 * @type {symbol}
 */
export const RAW_SYMBOL = Symbol("raw");

/**
 * Establishes a dependency between the `active_effect` and the given `target` and `key`.
 * When the property `target[key]` is accessed, this function is called.
 * @param {object} target - The raw object being accessed.
 * @param {string | symbol} key - The property key being accessed.
 */
export function track(target, key) {
  if (active_effect) {
    let deps_map = target_map.get(target);
    if (!deps_map) {
      target_map.set(target, (deps_map = new Map()));
    }
    let dep = deps_map.get(key);
    if (!dep) {
      deps_map.set(key, (dep = new Set()));
    }
    dep.add(active_effect);
    active_effect.deps.push(dep);
  }
}

/**
 * Finds and re-runs all effects that depend on the given `target` and `key`.
 * When the property `target[key]` is mutated, this function is called.
 * @param {object} target - The raw object that was mutated.
 * @param {string | symbol} key - The property key that was mutated.
 */
export function trigger(target, key) {
  const deps_map = target_map.get(target);
  if (!deps_map) return;

  const deps = deps_map.get(key);
  if (deps) {
    const effects_to_run = [...deps];
    for (const effect of effects_to_run) {
      if (effect.scheduler) {
        effect.scheduler();
      } else {
        effect.run();
      }
    }
  }
}

/**
 * Cleans up an effect by removing it from all its dependencies.
 * This is crucial to prevent memory leaks and unnecessary updates.
 * @param {object} effect - The effect to clean up.
 */
function cleanup(effect) {
  const { deps } = effect;
  for (let i = 0; i < deps.length; i++) {
    deps[i].delete(effect);
  }
  deps.length = 0;
}

/**
 * Creates a reactive effect that runs a function and tracks its dependencies.
 * @param {Function} fn - The function to run inside the effect.
 * @param {object} [options] - Configuration options for the effect.
 * @param {Function} [options.scheduler] - A custom scheduler to control when the effect runs.
 * @returns {Function} A runner function that can be called to manually re-run the effect.
 */
export function effect(fn, options = {}) {
  const _effect = create_reactive_effect(fn, options.scheduler);
  _effect.run();

  const runner = _effect.run.bind(_effect);
  runner.effect = _effect;
  return runner;
}

/**
 * Creates the internal effect object with run and stop capabilities.
 * @private
 */
function create_reactive_effect(fn, scheduler) {
  const effect = {
    fn,
    scheduler,
    active: true,
    deps: [],
    run() {
      if (!effect.active) return effect.fn();
      if (effect_stack.includes(effect)) return;

      cleanup(effect);
      try {
        effect_stack.push(effect);
        active_effect = effect;
        return effect.fn();
      } finally {
        effect_stack.pop();
        active_effect = effect_stack[effect_stack.length - 1];
      }
    },
    stop() {
      if (effect.active) {
        cleanup(effect);
        effect.active = false;
      }
    },
  };
  return effect;
}

/**
 * Creates a computed property, which is a ref-like object that lazily
 * evaluates a getter function and caches the result.
 * @param {Function} getter - The function to compute the value.
 * @returns {object} A computed ref object with a `.value` property.
 */
export function computed(getter) {
  let computed_value;
  let is_dirty = true;

  const scheduler = () => {
    if (!is_dirty) {
      is_dirty = true;
      trigger(computed_ref, "value");
    }
  };

  const getter_effect = create_reactive_effect(getter, scheduler);

  const computed_ref = {
    get value() {
      if (is_dirty) {
        computed_value = getter_effect.run();
        is_dirty = false;
      }
      track(computed_ref, "value");
      return computed_value;
    },
    __is_ref: true,
    __is_computed: true,
  };
  return computed_ref;
}

/**
 * Creates a reactive proxy for a given target object.
 * Returns the target itself if it's not an object.
 * Caches proxies to ensure the same proxy is returned for the same object.
 * @param {object} target - The object to make reactive.
 * @returns {Proxy | object} The reactive proxy or the original target.
 */
export function reactive(target) {
  if (!is_object(target)) return target;
  if (proxy_map.has(target)) return proxy_map.get(target);

  let handlers;
  if (target instanceof Map) {
    handlers = collectionHandlers.map;
  } else if (target instanceof Set) {
    handlers = collectionHandlers.set;
  } else {
    handlers = baseHandlers;
  }

  const proxy = new Proxy(target, handlers);
  proxy_map.set(target, proxy);
  return proxy;
}

const baseHandlers = {
  get(target, key, receiver) {
    if (key === RAW_SYMBOL) return target;
    const value = Reflect.get(target, key, receiver);
    track(target, key);
    return is_object(value) ? reactive(value) : value;
  },
  set(target, key, value, receiver) {
    const old_value = target[key];
    const result = Reflect.set(target, key, value, receiver);
    if (old_value !== value) {
      trigger(target, key);
    }
    return result;
  },
};

const collectionHandlers = {
  map: {
    get(target, key, receiver) {
      if (key === RAW_SYMBOL) return target;
      const value = Reflect.get(target, key, receiver);

      if (key === "get") {
        return (k) => {
          track(target, k);
          return target.get(k);
        };
      }
      if (key === "has") {
        return (k) => {
          track(target, k);
          return target.has(k);
        };
      }
      if (key === "size") {
        track(target, "size");
        return target.size;
      }
      if (
        ["forEach", "keys", "values", "entries", Symbol.iterator].includes(key)
      ) {
        track(target, "iterate");
      }

      if (key === "set") {
        return (k, v) => {
          const had = target.has(k);
          const old_val = target.get(k);
          const result = target.set(k, v);
          if (!had) {
            trigger(target, "size");
          } else if (old_val !== v) {
            trigger(target, k);
          }
          return result;
        };
      }
      if (key === "delete") {
        return (k) => {
          const had = target.has(k);
          const result = target.delete(k);
          if (had) trigger(target, "size");
          return result;
        };
      }

      return typeof value === "function" ? value.bind(target) : value;
    },
  },
  set: {
    get(target, key, receiver) {
      if (key === RAW_SYMBOL) return target;
      const value = Reflect.get(target, key, receiver);

      if (key === "has") {
        return (v) => {
          track(target, "size");
          return target.has(v);
        };
      }
      if (key === "size") {
        track(target, "size");
        return target.size;
      }
      if (
        ["forEach", "keys", "values", "entries", Symbol.iterator].includes(key)
      ) {
        track(target, "iterate");
      }

      if (key === "add") {
        return (v) => {
          const had = target.has(v);
          const result = target.add(v);
          if (!had) trigger(target, "size");
          return result;
        };
      }
      if (key === "delete") {
        return (v) => {
          const had = target.has(v);
          const result = target.delete(v);
          if (had) trigger(target, "size");
          return result;
        };
      }

      return typeof value === "function" ? value.bind(target) : value;
    },
  },
};

/**
 * Creates a centralized store for state management, built on the reactivity system.
 * @param {object} options - The store configuration.
 * @param {Function} options.state - A function that returns the initial state object.
 * @param {object} [options.actions] - An object of functions that can mutate the state.
 * @param {object} [options.getters] - An object of functions for computed values derived from the state.
 * @returns {Proxy} A reactive store instance.
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
      console.warn(
        `Attempted to directly set store property "${String(key)}". Use an action to modify state.`,
      );
      return Reflect.set(target, key, value, receiver);
    },
  });
}
