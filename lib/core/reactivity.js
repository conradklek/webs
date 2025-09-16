/**
 * @file Manages the core reactivity system, including refs, effects, and reactive proxies.
 */

import { isObject } from '../utils/lang.js';
import { createLogger } from './logger.js';

const logger = createLogger('[Reactivity]');

/**
 * @callback EffectScheduler
 * @returns {void}
 */

/**
 * @typedef {object} ReactiveEffect
 * @property {Function} fn - The function to execute.
 * @property {EffectScheduler} [scheduler] - A scheduler to control when the effect runs.
 * @property {boolean} active - Whether the effect is currently active.
 * @property {Set<ReactiveEffect>[]} deps - The dependencies this effect is subscribed to.
 * @property {() => any} run - Executes the effect function.
 * @property {() => void} stop - Deactivates the effect and cleans up its dependencies.
 */

/**
 * @template T
 * @typedef {object} Ref
 * @property {T} value - The reactive value.
 * @property {true} __is_ref - A flag to identify this as a Ref.
 */

/**
 * @template T
 * @typedef {object} ComputedRef
 * @property {T} value - The read-only computed value.
 * @property {true} __is_ref - A flag to identify this as a Ref.
 * @property {true} __is_computed - A flag to identify this as a computed property.
 * @property {T} oldValue - The previous value of the computed property.
 */

/**
 * @template T
 * @typedef {T & {}} ReactiveProxy
 */

/**
 * @internal
 * @type {ReactiveEffect | null}
 * The currently running effect. Dependencies are tracked against this effect.
 */
let activeEffect = null;

/**
 * @internal
 * @type {ReactiveEffect[]}
 * A stack of active effects, used to handle nested effects correctly.
 */
const effectStack = [];

/**
 * @internal
 * @type {WeakMap<object, Map<any, Set<ReactiveEffect>>>}
 * Maps a reactive object to a map of its properties and the effects that depend on them.
 * WeakMap: target -> Map: key -> Set: effects
 */
const targetMap = new WeakMap();

/**
 * @internal
 * @type {WeakMap<object, any>}
 * Caches reactive proxies to ensure the same object always returns the same proxy.
 */
const proxyMap = new WeakMap();

/**
 * A symbol used to retrieve the original, raw object from a reactive proxy.
 * @type {symbol}
 */
export const RAW_SYMBOL = Symbol('raw');

/**
 * @internal
 * Tracks a dependency between a reactive property and the currently active effect.
 * @param {object} target - The reactive object being accessed.
 * @param {string | symbol | number} key - The property key being accessed.
 */
function track(target, key) {
  if (activeEffect) {
    logger.debug(`Tracking dependency for key: "${String(key)}"`);
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      depsMap = new Map();
      targetMap.set(target, depsMap);
      logger.debug(`- Created new dependency map for target:`, target);
    }
    let dep = depsMap.get(key);
    if (!dep) {
      dep = new Set();
      depsMap.set(key, dep);
      logger.debug(`- Created new dependency set for key: "${String(key)}"`);
    }
    dep.add(/** @type {ReactiveEffect} */ (activeEffect));
    /** @type {ReactiveEffect} */ (activeEffect).deps.push(dep);
    logger.debug(`- Added effect to dependency set for key: "${String(key)}"`);
  }
}

/**
 * @internal
 * Triggers all effects that depend on a specific reactive property.
 * @param {object} target - The reactive object that was mutated.
 * @param {string | symbol | number} key - The property key that was mutated.
 */
function trigger(target, key) {
  logger.debug(`Triggering effects for key: "${String(key)}"`);
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    logger.debug('- No dependency map found, skipping trigger.');
    return;
  }

  const effectsToRun = new Set();
  const dep = depsMap.get(key);
  if (dep) {
    logger.debug('- Found direct dependencies.');
    dep.forEach((effect) => effectsToRun.add(effect));
  }

  if (Array.isArray(target) && key === 'length') {
    logger.debug(
      '- Array length change detected, checking for out-of-bounds dependencies.',
    );
    depsMap.forEach((dep, depKey) => {
      if (typeof depKey === 'number' && depKey >= target.length) {
        dep.forEach((effect) => effectsToRun.add(effect));
      }
    });
  }

  if (effectsToRun.size > 0) {
    logger.info(`Running ${effectsToRun.size} effects.`);
  }

  effectsToRun.forEach((effect) => {
    if (effect.scheduler) {
      logger.debug('Executing scheduler for effect:', effect);
      effect.scheduler();
    } else {
      logger.debug('Running effect:', effect);
      effect.run();
    }
  });
}

/**
 * @internal
 * Removes an effect from all of its dependency sets.
 * @param {ReactiveEffect} effect - The effect to clean up.
 */
function cleanup(effect) {
  logger.debug('Cleaning up dependencies for effect:', effect);
  const { deps } = effect;
  for (let i = 0; i < deps.length; i++) {
    const dep = deps[i];
    if (dep) dep.delete(effect);
  }
  deps.length = 0;
  logger.debug('Cleanup complete.');
}

/**
 * Checks if a value is a ref.
 * @param {any} r - The value to check.
 * @returns {r is Ref<any>} `true` if the value is a ref, otherwise `false`.
 */
export function isRef(r) {
  return !!(r && r.__is_ref === true);
}

/**
 * Creates a reactive reference (ref) from a value.
 * @template T
 * @param {T} value - The initial value.
 * @returns {Ref<T>} A reactive ref object.
 * @example
 * const count = ref(0);
 * console.log(count.value); // 0
 * count.value++;
 */
export function ref(value) {
  logger.debug('Creating new ref.');
  return createRef(value);
}

/**
 * @internal
 * @template T
 * @param {T} value
 * @returns {Ref<T>}
 */
function createRef(value) {
  const wrapper = {
    _value: value,
    __is_ref: /** @type {const} */ (true),
    get value() {
      track(this, 'value');
      return this._value;
    },
    set value(newValue) {
      if (newValue !== this._value) {
        this._value = newValue;
        trigger(this, 'value');
      }
    },
  };
  return wrapper;
}

/**
 * @internal
 * Creates a reactive proxy for an object.
 * @template {object} T
 * @param {T} target - The object to make reactive.
 * @returns {ReactiveProxy<T>} A reactive proxy of the target.
 */
function reactive(target) {
  if (!isObject(target) && !Array.isArray(target)) return target;
  if (proxyMap.has(target)) return proxyMap.get(target);

  /** @type {ProxyHandler<any>} */
  let handlers;
  if (Array.isArray(target)) {
    handlers = arrayHandlers;
  } else if (target instanceof Map) {
    handlers = collectionHandlers.map;
  } else if (target instanceof Set) {
    handlers = collectionHandlers.set;
  } else {
    handlers = baseHandlers;
  }

  const proxy = new Proxy(target, handlers);
  proxyMap.set(target, proxy);
  logger.debug('Created new reactive proxy.', {
    originalTarget: target,
    proxy,
  });
  return proxy;
}

/**
 * Creates a reactive state object or ref.
 * If the initial value is an object or an array, it returns a reactive proxy.
 * Otherwise, it returns a ref.
 * @template T
 * @param {T} initialValue - The initial state value.
 * @returns {T extends object ? ReactiveProxy<T> : Ref<T>}
 * @example
 * const counter = state(0); // Returns a Ref
 * const user = state({ name: 'webs' }); // Returns a reactive Proxy
 */
export function state(initialValue) {
  logger.debug('Creating new state object/ref.');
  if (isObject(initialValue) || Array.isArray(initialValue)) {
    return /** @type {T extends object ? ReactiveProxy<T> : Ref<T>} */ (
      reactive(initialValue)
    );
  }
  return /** @type {T extends object ? ReactiveProxy<T> : Ref<T>} */ (
    createRef(initialValue)
  );
}

/**
 * @template S, G, A
 * @typedef {object} StoreOptions
 * @property {() => S} state - A function that returns the initial state object.
 * @property {G} [getters] - An object of computed properties for the store.
 * @property {A} [actions] - An object of methods to mutate the store's state.
 */

/**
 * Creates a centralized state management store.
 * @template {object} S
 * @template {object} G
 * @template {object} A
 * @param {StoreOptions<S, G, A>} options - The store configuration.
 * @returns {ReactiveProxy<S> & G & A} A reactive store instance.
 */
export function store(options) {
  const store = reactive(options.state());
  /** @type {Record<string, Function>} */
  const wrappedActions = {};
  /** @type {Record<string, any>} */
  const wrappedGetters = {};

  if (options.actions) {
    for (const key in options.actions) {
      wrappedActions[key] = /** @type {any} */ (options.actions)[key].bind(
        store,
      );
    }
  }

  if (options.getters) {
    for (const key in options.getters) {
      const computedFn = computed(() =>
        /** @type {any} */ (options.getters)[key].call(store),
      );
      Object.defineProperty(wrappedGetters, key, {
        get: () => computedFn.value,
      });
    }
  }

  return /** @type {ReactiveProxy<S> & G & A} */ (
    new Proxy(store, {
      get(target, key, receiver) {
        if (typeof key === 'string' && key in wrappedGetters) {
          return wrappedGetters[key];
        }
        if (typeof key === 'string' && key in wrappedActions) {
          return wrappedActions[key];
        }
        return Reflect.get(target, key, receiver);
      },
      set(target, key, value, receiver) {
        return Reflect.set(target, key, value, receiver);
      },
    })
  );
}

/**
 * @internal
 * Base handlers for reactive object proxies.
 * @type {ProxyHandler<object>}
 */
const baseHandlers = {
  get(target, key, receiver) {
    if (key === RAW_SYMBOL) return target;
    const value = Reflect.get(target, key, receiver);
    track(target, key);
    const unwrapped = isRef(value) ? value.value : value;
    return isObject(unwrapped) || Array.isArray(unwrapped)
      ? reactive(unwrapped)
      : unwrapped;
  },
  set(target, key, value, receiver) {
    const oldValue = Reflect.get(target, key, receiver);
    const result = Reflect.set(target, key, value, receiver);
    if (oldValue !== value) {
      trigger(target, key);
    }
    return result;
  },
};

/**
 * @internal
 * A map of array mutation methods that should trigger a length change.
 */
const arrayMutationMethods = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
]);

/**
 * @internal
 * Handlers for reactive array proxies.
 * @type {ProxyHandler<any[]>}
 */
const arrayHandlers = {
  get(target, key, receiver) {
    if (key === RAW_SYMBOL) return target;

    if (typeof key === 'string' || typeof key === 'number') {
      track(target, key);
    }

    const value = Reflect.get(target, key, receiver);

    if (typeof value === 'function' && arrayMutationMethods.has(String(key))) {
      // @ts-ignore
      return function (...args) {
        const result = Reflect.apply(value, target, args);
        trigger(target, 'length');
        for (let i = 0; i < target.length; i++) {
          trigger(target, i);
        }
        return result;
      };
    }

    return isObject(value) || Array.isArray(value) ? reactive(value) : value;
  },
  set(target, key, value, receiver) {
    const oldValue = Reflect.get(target, key, receiver);
    const hadKey = Object.prototype.hasOwnProperty.call(target, key);
    const result = Reflect.set(target, key, value, receiver);

    if (!hadKey) {
      if (typeof key === 'string' && /^\d+$/.test(key)) {
        trigger(target, 'length');
      }
      trigger(target, key);
    } else if (oldValue !== value) {
      trigger(target, key);
    }
    return result;
  },
};

/**
 * @internal
 * Handlers for reactive Map and Set proxies.
 * @type {{map: ProxyHandler<Map<any, any>>, set: ProxyHandler<Set<any>>}}
 */
const collectionHandlers = {
  map: {
    get(target, key, _receiver) {
      if (key === RAW_SYMBOL) return target;
      if (key === 'size') {
        track(target, 'size');
        return Reflect.get(target, 'size', target);
      }

      const value = Reflect.get(target, key, target);

      if (typeof value === 'function') {
        switch (key) {
          case 'get':
            return (/** @type {any} */ k) => {
              track(target, k);
              const res = target.get(k);
              return isObject(res) ? reactive(res) : res;
            };
          case 'has':
            return (/** @type {any} */ k) => {
              track(target, k);
              return target.has(k);
            };
          case 'set':
            return (/** @type {any} */ k, /** @type {any} */ v) => {
              const had = target.has(k);
              const oldValue = target.get(k);
              const result = target.set(k, v);
              if (!had) {
                trigger(target, 'size');
              }
              if (!had || oldValue !== v) {
                trigger(target, k);
              }
              return result;
            };
          case 'delete':
            return (/** @type {any} */ k) => {
              const had = target.has(k);
              const result = target.delete(k);
              if (had) {
                trigger(target, 'size');
                trigger(target, k);
              }
              return result;
            };
          case 'clear':
            return () => {
              const hadItems = target.size > 0;
              const result = target.clear();
              if (hadItems) {
                trigger(target, 'size');
              }
              return result;
            };
          default:
            return value.bind(target);
        }
      }
      return value;
    },
    set: (target, key, value, receiver) => {
      return Reflect.set(target, key, value, receiver);
    },
  },
  set: {
    get(target, key) {
      if (key === RAW_SYMBOL) return target;
      if (key === 'size') {
        track(target, 'size');
        return Reflect.get(target, key, target);
      }

      const value = Reflect.get(target, key, target);
      if (typeof value === 'function') {
        switch (key) {
          case 'has':
            return (/** @type {any} */ v) => {
              track(target, v);
              return target.has(v);
            };
          case 'add':
            return (/** @type {any} */ v) => {
              const had = target.has(v);
              const result = target.add(v);
              if (!had) {
                trigger(target, 'size');
                trigger(target, v);
              }
              return result;
            };
          case 'delete':
            return (/** @type {any} */ v) => {
              const had = target.has(v);
              const result = target.delete(v);
              if (had) {
                trigger(target, 'size');
                trigger(target, v);
              }
              return result;
            };
          case 'clear':
            return () => {
              const hadItems = target.size > 0;
              const result = target.clear();
              if (hadItems) {
                trigger(target, 'size');
              }
              return result;
            };
          default:
            return value.bind(target);
        }
      }
      return value;
    },
    set: (target, key, value, receiver) => {
      return Reflect.set(target, key, value, receiver);
    },
  },
};

/**
 * @internal
 * Creates a reactive effect runner.
 * @param {Function} fn - The function to be executed inside the effect.
 * @param {EffectScheduler} [scheduler] - An optional scheduler function.
 * @returns {ReactiveEffect} The created effect object.
 */
function createReactiveEffect(fn, scheduler) {
  /** @type {ReactiveEffect} */
  const effect = {
    fn,
    scheduler,
    active: true,
    deps: [],
    run() {
      logger.debug('Running effect function...');
      if (!effect.active) {
        logger.debug('- Effect is inactive, skipping.');
        return effect.fn();
      }
      if (effectStack.includes(effect)) {
        logger.debug('- Effect already in stack, avoiding infinite loop.');
        return;
      }

      cleanup(effect);
      try {
        effectStack.push(effect);
        activeEffect = effect;
        const result = effect.fn();
        logger.debug('- Effect function completed.');
        return result;
      } finally {
        effectStack.pop();
        activeEffect = effectStack[effectStack.length - 1] || null;
        logger.debug('- Restored active effect from stack.');
      }
    },
    stop() {
      if (effect.active) {
        logger.info('Stopping effect...');
        cleanup(effect);
        effect.active = false;
        logger.info('Effect stopped successfully.');
      } else {
        logger.warn('Attempted to stop an inactive effect.');
      }
    },
  };
  return effect;
}

/**
 * @typedef {object} EffectOptions
 * @property {EffectScheduler} [scheduler] - An optional scheduler function.
 */

/**
 * Runs a function and reactively tracks its dependencies.
 * @param {Function | Ref<any> | ReactiveProxy<any>} source - The function to run and track, or a reactive source to watch.
 * @param {Function} [callback] - The callback function to run when the source changes.
 * @param {EffectOptions} [options] - Optional effect options.
 * @returns {(() => any) & { effect: ReactiveEffect }} A function to stop the effect.
 * @example
 * const count = state(0);
 * effect(() => console.log(count.value)); // Single function effect
 * const user = state({ name: 'Webs' });
 * effect(() => user.name, (newName, oldName) => console.log(newName)); // Watch pattern
 */
export function effect(source, callback, options) {
  logger.info('Creating new effect.');
  let runner;
  const isWatcher = typeof callback === 'function';

  if (isWatcher) {
    /** @type {any} */
    let oldValue;
    const getter = () => {
      return typeof source === 'function'
        ? source()
        : isRef(source)
          ? source.value
          : source;
    };

    const computedRef = computed(getter);

    runner = createReactiveEffect(() => {
      const newValue = computedRef.value;
      if (newValue !== oldValue) {
        logger.debug('Effect callback triggered due to value change.');
        callback(newValue, oldValue);
        oldValue = newValue;
      }
    }, options?.scheduler);
  } else {
    if (typeof source !== 'function') {
      logger.error(
        'Invalid source provided. effect with a single argument must be a function.',
      );
      throw new Error('effect with a single argument must be a function.');
    }
    // In this case, `callback` is the options object
    const effectOptions = /** @type {EffectOptions | undefined} */ (callback);
    runner = createReactiveEffect(source, effectOptions?.scheduler);
  }
  runner.run();
  const runnerWrapper =
    /** @type {(() => any) & { effect: ReactiveEffect }} */ (
      () => runner.run()
    );
  runnerWrapper.effect = runner;
  logger.info('Effect created and ran for the first time.');
  return runnerWrapper;
}

/**
 * @template T
 * @callback ComputedGetter
 * @returns {T}
 */

/**
 * Creates a computed property that reactively calculates its value.
 * @template T
 * @param {ComputedGetter<T>} getter - The function to compute the value.
 * @returns {ComputedRef<T>} A read-only ref whose value is the result of the getter.
 * @example
 * const count = ref(1);
 * const double = computed(() => count.value * 2);
 * console.log(double.value); // 2
 */
export function computed(getter) {
  logger.debug('Creating new computed property.');
  /** @type {T | undefined} */
  let computedValue;
  /** @type {any} */
  let oldValue;
  let isDirty = true;

  const scheduler = () => {
    if (!isDirty) {
      isDirty = true;
      trigger(computedRef, 'value');
      logger.debug('Scheduler: marked computed property as dirty.');
    }
  };

  const getterEffect = createReactiveEffect(getter, scheduler);

  const computedRef = {
    get value() {
      if (isDirty) {
        logger.debug('Computed property is dirty, recalculating value.');
        oldValue = computedValue;
        computedValue = getterEffect.run();
        isDirty = false;
      }
      track(computedRef, 'value');
      logger.debug(
        `Computed value accessed, tracking dependency. Current value: ${JSON.stringify(computedValue)}`,
      );
      return /** @type {T} */ (computedValue);
    },
    get oldValue() {
      logger.debug(
        `Old computed value accessed. Old value: ${JSON.stringify(oldValue)}`,
      );
      return /** @type {T} */ (oldValue);
    },
    __is_ref: /** @type {const} */ (true),
    __is_computed: /** @type {const} */ (true),
  };
  logger.debug('Computed property created.');
  return computedRef;
}
