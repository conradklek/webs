/**
 * @file Manages the core reactivity system. This system is responsible for tracking dependencies
 * between state and effects (like rendering or computations), and automatically re-running the
 * effects when the state they depend on changes. This enables a declarative programming model
 * where the UI automatically updates in response to state modifications.
 */

import { isObject } from '../shared/utils.js';
import { createLogger } from '../shared/logger.js';

/**
 * A function that can be provided to an effect to control when it re-runs.
 * If a scheduler is present, the effect's `run` function will not be called directly. Instead,
 * the scheduler will be called, and it becomes the scheduler's responsibility to eventually
 * call the effect's `run` function.
 * @callback EffectScheduler
 * @param {() => void} run - The function that executes the effect.
 * @returns {void}
 * @example
 * // A simple scheduler that batches updates using the microtask queue.
 * const scheduler = (run) => Promise.resolve().then(run);
 * effect(() => { console.log(state.count) }, { scheduler });
 */

/**
 * Represents an operation that is tracked for reactive dependencies. When any of its
 * dependencies change, the effect can be re-run to produce an updated result. This is the
 * core unit of the reactivity system.
 * @typedef {object} ReactiveEffect
 * @property {Function} fn - The function to execute that contains reactive dependencies.
 * @property {EffectScheduler} [scheduler] - A custom scheduler to control the timing of re-runs.
 * @property {boolean} active - A flag indicating if the effect is currently active and tracking dependencies.
 * @property {Set<ReactiveEffect>[]} deps - A collection of dependency sets this effect is subscribed to.
 * @property {() => any} run - Executes the effect's function, gathering dependencies, and returning the result.
 * @property {() => void} stop - Deactivates the effect, severing its connections to all dependencies.
 */

/**
 * A reactive object that wraps a single value. The framework tracks access to the `.value`
 * property, allowing effects to re-run when it changes.
 * @template T
 * @typedef {object} Ref
 * @property {T} value - The reactive value. Accessing this property tracks the dependency, and setting it triggers updates.
 * @property {true} __is_ref - An internal flag to identify this object as a Ref.
 */

/**
 * A special type of Ref that is read-only and whose value is calculated by a getter function.
 * The value is cached and only re-computed when one of its underlying reactive dependencies changes.
 * @template T
 * @typedef {object} ComputedRef
 * @property {T} value - The read-only computed value. Accessing this tracks dependencies on the underlying state.
 * @property {true} __is_ref - An internal flag to identify this object as a Ref.
 * @property {true} __is_computed - An internal flag to identify this object as a computed property.
 * @property {T} oldValue - The previous value of the computed property, accessible within watcher effects.
 */

/**
 * Represents an object or array that has been made fully reactive. Any access to its properties
 * (including nested properties) is tracked, and any mutation will trigger updates.
 * @template T
 * @typedef {T & {}} ReactiveProxy
 */

/**
 * The configuration object for creating a centralized `store`.
 * @template S The type of the state object.
 * @template G The type of the getters object.
 * @template A The type of the actions object.
 * @typedef {object} StoreOptions
 * @property {() => S} state - A function that returns the initial state object. Using a function ensures each store instance gets a fresh state object.
 * @property {G} [getters] - An object of functions that act as computed properties for the store. They receive the state as `this` and are read-only.
 * @property {A} [actions] - An object of functions that are used to modify the store's state. They also receive the state and other actions/getters as `this`.
 */

/**
 * Configuration options for creating an `effect`.
 * @typedef {object} EffectOptions
 * @property {EffectScheduler} [scheduler] - An optional scheduler function to control the timing of effect re-runs.
 */

/**
 * The type for a getter function used by a `computed` property.
 * @template T
 * @callback ComputedGetter
 * @returns {T} The calculated value.
 */

const logger = createLogger('[Reactivity]');

/**
 * @internal
 * @type {ReactiveEffect | null}
 */
let activeEffect = null;

/**
 * @internal
 * @type {ReactiveEffect[]}
 */
const effectStack = [];

/**
 * @internal
 * @type {WeakMap<object, Map<any, Set<ReactiveEffect>>>}
 */
const targetMap = new WeakMap();

/**
 * @internal
 * @type {WeakMap<object, any>}
 */
const proxyMap = new WeakMap();

/**
 * A symbol used to retrieve the original, raw (non-reactive) object from a reactive proxy.
 * This is useful for performance-critical code or when you need to pass data to external
 * libraries that shouldn't trigger reactive updates.
 * @type {symbol}
 * @example
 * const user = state({ name: 'webs' });
 * const rawUser = user[RAW_SYMBOL]; // rawUser is the original { name: 'webs' } object
 * console.log(user.name); // Access is tracked
 * console.log(rawUser.name); // Access is NOT tracked
 */
export const RAW_SYMBOL = Symbol('raw');

/**
 * @internal
 * @param {object} target
 * @param {string | symbol | number} key
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
 * @param {object} target
 * @param {string | symbol | number} key
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
      effect.scheduler(effect.run);
    } else {
      logger.debug('Running effect:', effect);
      effect.run();
    }
  });
}

/**
 * @internal
 * @param {ReactiveEffect} effect
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
 * @example
 * const count = ref(0);
 * const plain = { value: 0 };
 * isRef(count); // true
 * isRef(plain); // false
 */
export function isRef(r) {
  return !!(r && r.__is_ref === true);
}

/**
 * Creates a reactive reference (ref) which encapsulates a value.
 * This allows the framework's reactivity system to track dependencies and
 * trigger updates when the `.value` property is accessed or mutated.
 * Use `ref` for primitive values (string, number, boolean) that need to be reactive.
 * @template T
 * @param {T} value - The initial value.
 * @returns {Ref<T>} A reactive ref object.
 * @example
 * const count = ref(0);
 *
 * effect(() => {
 * // This effect will re-run whenever count.value changes.
 * console.log(`The count is: ${count.value}`);
 * });
 *
 * count.value++; // Logs: "The count is: 1"
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
 * @template {object} T
 * @param {T} target
 * @returns {ReactiveProxy<T>}
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
 * If the initial value is an object or an array, it returns a deep reactive proxy.
 * If the initial value is a primitive, it returns a `ref`. This is the primary way
 * to declare reactive state in a component.
 * @template T
 * @param {T} initialValue - The initial state value.
 * @returns {T extends object ? ReactiveProxy<T> : Ref<T>} A reactive state container.
 * @example
 * // For primitives, returns a ref
 * const count = state(0);
 * count.value++;
 *
 * // For objects, returns a reactive proxy
 * const user = state({ name: 'webs', nested: { id: 1 } });
 * user.name = 'Gemini';
 * user.nested.id++; // nested properties are also reactive
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
 * Creates a centralized state management store, ideal for sharing state across
 * multiple components without prop drilling. It combines state, computed getters, and
 * actions into a single reactive object.
 * @template {object} S
 * @template {Record<string, (...args: any[]) => any>} [G={}]
 * @template {Record<string, (...args: any[]) => any>} [A={}]
 * @param {StoreOptions<S, G, A>} options - The store configuration.
 * @returns {ReactiveProxy<S> & G & A} A reactive store instance.
 * @example
 * // In a central file, e.g., 'src/stores/counter.js'
 * export const counterStore = store({
 * state: () => ({
 * count: 0,
 * lastChanged: null
 * }),
 * getters: {
 * double() {
 * // `this` refers to the store's state
 * return this.count * 2;
 * }
 * },
 * actions: {
 * increment() {
 * // `this` can access state, other getters, and other actions
 * this.count++;
 * this.lastChanged = new Date();
 * },
 * add(amount) {
 * this.count += amount;
 * }
 * }
 * });
 *
 * // In a component:
 * // import { counterStore } from '../stores/counter.js';
 * counterStore.increment();
 * console.log(counterStore.double); // 2
 */
export function store(options) {
  const state = reactive(options.state());
  /** @type {Record<string | symbol, any>} */
  const methodsAndGetters = {};

  const proxy = new Proxy(state, {
    get(target, key, receiver) {
      if (key in methodsAndGetters) {
        return methodsAndGetters[key];
      }
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      if (key in methodsAndGetters) {
        logger.warn(
          `Attempted to overwrite store getter or action: "${String(key)}"`,
        );
        return false;
      }
      return Reflect.set(target, key, value, receiver);
    },
    has(target, key) {
      return key in methodsAndGetters || Reflect.has(target, key);
    },
    ownKeys(target) {
      return [...Reflect.ownKeys(target), ...Object.keys(methodsAndGetters)];
    },
    getOwnPropertyDescriptor(target, key) {
      if (key in methodsAndGetters) {
        return Object.getOwnPropertyDescriptor(methodsAndGetters, key);
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });

  if (options.getters) {
    for (const key in options.getters) {
      const getterFn = options.getters[key];
      const computedFn = computed(() => getterFn?.call(proxy));
      Object.defineProperty(methodsAndGetters, key, {
        get: () => computedFn.value,
        enumerable: true,
        configurable: true,
      });
    }
  }

  if (options.actions) {
    for (const key in options.actions) {
      const actionFn = options.actions[key];
      methodsAndGetters[key] = actionFn?.bind(proxy);
    }
  }

  return /** @type {ReactiveProxy<S> & G & A} */ (proxy);
}

/**
 * @internal
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
      /**
       * @param {...any} args
       */
      return function (...args) {
        const result = /** @type {(...args: any[]) => any} */ (value).apply(
          target,
          args,
        );
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
 * @param {Function} fn
 * @param {EffectScheduler} [scheduler]
 * @returns {ReactiveEffect}
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
 * Runs a function and reactively tracks its dependencies. When the dependencies change,
 * the function runs again. `effect` is the foundation for rendering, computed properties, and watchers.
 *
 * It has two main signatures:
 * 1. **Autorun:** Takes a single function that is run immediately and then again whenever its dependencies change.
 * 2. **Watcher:** Takes a source (getter function or reactive object) and a callback. The callback only runs when the source's value changes.
 *
 * @param {Function | Ref<any> | ReactiveProxy<any>} source - The function to run and track, or a reactive source to watch.
 * @param {Function} [callback] - The callback to run when the source changes. Receives `(newValue, oldValue)`.
 * @param {EffectOptions} [options] - Optional effect configuration.
 * @returns {() => void} A function that can be called to manually stop the effect.
 * @example
 * // 1. Autorun example (common for rendering logic)
 * const count = state(0);
 * effect(() => console.log(count.value)); // Logs 0, then logs again on every change to count.value
 * count.value++; // Logs 1
 *
 * // 2. Watcher example (for specific side effects)
 * const user = state({ name: 'Webs' });
 * effect(
 * () => user.name, // The source to watch
 * (newName, oldName) => { // The callback
 * console.log(`Name changed from ${oldName} to ${newName}`);
 * }
 * );
 * user.name = 'Gemini'; // Logs: "Name changed from Webs to Gemini"
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
    const effectOptions = /** @type {EffectOptions | undefined} */ (callback);
    runner = createReactiveEffect(source, effectOptions?.scheduler);
  }
  runner.run();
  const stop = () => runner.stop();
  logger.info('Effect created and ran for the first time.');
  return stop;
}

/**
 * Creates a computed property that reactively calculates its value based on other
 * reactive state. The result is cached and only re-evaluated when its dependencies change.
 * @template T
 * @param {ComputedGetter<T>} getter - The function to compute the value.
 * @returns {ComputedRef<T>} A read-only ref whose value is the result of the getter.
 * @example
 * const count = ref(1);
 * const user = state({ firstName: 'John', lastName: 'Doe' });
 *
 * const double = computed(() => count.value * 2);
 * console.log(double.value); // 2
 *
 * const fullName = computed(() => `${user.firstName} ${user.lastName}`);
 * console.log(fullName.value); // "John Doe"
 *
 * user.firstName = 'Jane';
 * console.log(fullName.value); // "Jane Doe" (automatically updated)
 */
export function computed(getter) {
  logger.debug('Creating new computed property.');
  /** @type {any} */
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
        `Computed value accessed, tracking dependency. Current value: ${JSON.stringify(
          computedValue,
        )}`,
      );
      return computedValue;
    },
    get oldValue() {
      logger.debug(
        `Old computed value accessed. Old value: ${JSON.stringify(oldValue)}`,
      );
      return oldValue;
    },
    __is_ref: /** @type {const} */ (true),
    __is_computed: /** @type {const} */ (true),
  };
  logger.debug('Computed property created.');
  return /** @type {ComputedRef<any>} */ (/** @type {unknown} */ (computedRef));
}
