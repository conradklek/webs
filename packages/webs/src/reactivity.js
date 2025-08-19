import { is_object } from "./utils";

let active_effect = null;
const effect_stack = [];
const target_map = new WeakMap();
const proxy_map = new WeakMap();

const RAW_SYMBOL = Symbol("raw");

/**
 * Creates a reactive effect that can be run and tracked.
 */
export const create_reactive_effect = (fn, scheduler) => {
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
};

export function cleanup(effect) {
  const { deps } = effect;
  for (let i = 0; i < deps.length; i++) {
    deps[i].delete(effect);
  }
  deps.length = 0;
}

/**
 * Dependency tracking.
 */
export function track(target, key) {
  if (active_effect) {
    let deps_map = target_map.get(target);
    if (!deps_map) target_map.set(target, (deps_map = new Map()));
    let dep = deps_map.get(key);
    if (!dep) deps_map.set(key, (dep = new Set()));
    dep.add(active_effect);
    active_effect.deps.push(dep);
  }
}

/**
 * Trigger re-runs of effects depending on target[key].
 */
export function trigger(target, key) {
  const deps_map = target_map.get(target);
  if (!deps_map) return;
  const deps = deps_map.get(key);
  if (deps) {
    const effects_to_run = [...deps];
    for (const effect of effects_to_run) {
      effect.scheduler ? effect.scheduler() : effect.run();
    }
  }
}

/**
 * Register an effect that runs immediately.
 */
export function effect(fn, options = {}) {
  const _effect = create_reactive_effect(fn, options.scheduler);
  _effect.run();
  const runner = _effect.run.bind(_effect);
  runner.effect = _effect;
  return runner;
}

/**
 * Reactive proxy factory.
 */
export function reactive(target) {
  if (!is_object(target)) return target;
  if (proxy_map.has(target)) return proxy_map.get(target);

  if (target instanceof Set) {
    const proxy = new Proxy(target, {
      get(target, key, receiver) {
        if (key === RAW_SYMBOL) return target;

        if (key === "add") {
          return (value) => {
            const had = target.has(value);
            const result = target.add(value);
            if (!had) trigger(target, "size");
            return result;
          };
        }

        if (key === "delete") {
          return (value) => {
            const had = target.has(value);
            const result = target.delete(value);
            if (had) trigger(target, "size");
            return result;
          };
        }

        if (key === "has") {
          return (value) => {
            track(target, "size");
            return target.has(value);
          };
        }

        if (key === "size") {
          track(target, "size");
          return Reflect.get(target, key, target);
        }

        if (
          key === Symbol.iterator ||
          key === "forEach" ||
          key === "values" ||
          key === "keys" ||
          key === "entries"
        ) {
          track(target, "iterate");
        }

        return Reflect.get(target, key, receiver);
      },
    });
    proxy_map.set(target, proxy);
    return proxy;
  }

  if (target instanceof Map) {
    const proxy = new Proxy(target, {
      get(target, key, receiver) {
        if (key === RAW_SYMBOL) return target;

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
          return Reflect.get(target, key, target);
        }

        if (
          key === Symbol.iterator ||
          key === "forEach" ||
          key === "values" ||
          key === "keys" ||
          key === "entries"
        ) {
          track(target, "iterate");
        }

        return Reflect.get(target, key, receiver);
      },
    });
    proxy_map.set(target, proxy);
    return proxy;
  }

  const proxy = new Proxy(target, {
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
  });
  proxy_map.set(target, proxy);
  return proxy;
}

/**
 * Computed properties.
 */
export function computed(getter) {
  let _value;
  let _dirty = true;
  let c;

  const scheduler = () => {
    if (!_dirty) {
      _dirty = true;
      trigger(c, "value");
    }
  };

  const getter_effect = create_reactive_effect(getter, scheduler);

  c = {
    get value() {
      if (_dirty) {
        _value = getter_effect.run();
        _dirty = false;
      }
      track(c, "value");
      return _value;
    },
    __is_ref: true,
    __is_computed: true,
  };
  return c;
}

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
