import { is_object } from "./utils.js";

let active_effect = null;

const effect_stack = [];

const target_map = new WeakMap();

const RAW_SYMBOL = Symbol("raw");

/**
 * Creates a reactive effect that can be run and tracked.
 * @param {Function} fn - The function to be executed as the effect.
 * @param {object} scheduler - An optional scheduler to control when the effect is run.
 * @returns {object} The reactive effect object with run and stop methods.
 */
const create_reactive_effect = (fn, scheduler) => {
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

/**
 * Cleans up an effect by removing it from all its dependencies.
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
 * Tracks a property as a dependency of the currently active effect.
 * @param {object} target - The target object.
 * @param {string|symbol} key - The property key to track.
 */
function track(target, key) {
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
 * Triggers all effects that depend on a specific property.
 * @param {object} target - The target object.
 * @param {string|symbol} key - The property key that has changed.
 */
function trigger(target, key) {
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
 * Creates a reactive effect that runs immediately and re-runs when its dependencies change.
 * @param {Function} fn - The function to wrap in an effect.
 * @param {object} [options={}] - Options for the effect, like a scheduler.
 * @returns {Function} A runner function that can be used to manually trigger the effect.
 */
export function effect(fn, options = {}) {
  const _effect = create_reactive_effect(fn, options.scheduler);
  _effect.run();
  const runner = _effect.run.bind(_effect);
  runner.effect = _effect;
  return runner;
}

const proxy_map = new WeakMap();

/**
 * Creates a reactive proxy for an object.
 * @param {object} target - The object to make reactive.
 * @returns {Proxy} A reactive proxy of the original object.
 */
export function reactive(target) {
  if (!is_object(target)) return target;
  if (proxy_map.has(target)) return proxy_map.get(target);
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
 * Creates a computed property that caches its value and only re-computes when dependencies change.
 * @param {Function} getter - The function to compute the value.
 * @returns {object} A computed ref object with a `.value` property.
 */
export function computed(getter) {
  let _value;
  let _dirty = true;
  const runner = effect(getter, {
    scheduler: () => {
      if (!_dirty) {
        _dirty = true;
        trigger(c, "value");
      }
    },
  });
  const c = {
    get value() {
      if (_dirty) {
        _value = runner();
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
