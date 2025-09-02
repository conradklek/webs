const isObject = (val) => val !== null && typeof val === 'object';

let activeEffect = null;

const watchStack = [];
const targetMap = new WeakMap();
const proxyMap = new WeakMap();

export const RAW_SYMBOL = Symbol('raw');

function track(target, key) {
  if (activeEffect) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()));
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, (dep = new Set()));
    }
    dep.add(activeEffect);
    activeEffect.deps.push(dep);
  }
}

function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const deps = depsMap.get(key);
  if (deps) {
    const effectsToRun = new Set(deps);
    effectsToRun.forEach((effect) => {
      if (effect.scheduler) {
        effect.scheduler();
      } else {
        effect.run();
      }
    });
  }
}

function cleanup(effect) {
  const { deps } = effect;
  for (let i = 0; i < deps.length; i++) {
    deps[i].delete(effect);
  }
  deps.length = 0;
}

function createReactiveEffect(fn, scheduler) {
  const effect = {
    fn,
    scheduler,
    active: true,
    deps: [],
    run() {
      if (!effect.active) return effect.fn();
      if (watchStack.includes(effect)) return;

      cleanup(effect);
      try {
        watchStack.push(effect);
        activeEffect = effect;
        return effect.fn();
      } finally {
        watchStack.pop();
        activeEffect = watchStack[watchStack.length - 1];
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

export function isRef(r) {
  return !!(r && r.__is_ref === true);
}

function createRef(value) {
  const wrapper = {
    _value: value,
    __is_ref: true,
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

function reactive(target) {
  if (!isObject(target)) return target;
  if (proxyMap.has(target)) return proxyMap.get(target);

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
  return proxy;
}

export function state(initialValue) {
  if (isObject(initialValue)) {
    return reactive(initialValue);
  }
  return createRef(initialValue);
}

export function watch(source, cbOrOptions, options) {
  let getter = source;
  let cb = null;
  let scheduler = null;

  if (typeof cbOrOptions === 'function') {
    cb = cbOrOptions;
    scheduler = options?.scheduler;
  } else {
    scheduler = cbOrOptions?.scheduler;
  }

  let oldValue;
  const effect = createReactiveEffect(getter, () => {
    const newValue = effect.run();
    if (cb) {
      if (newValue !== oldValue) {
        cb(newValue, oldValue);
        oldValue = newValue;
      }
    } else if (scheduler) {
      scheduler();
    }
  });

  oldValue = effect.run();

  const runner = effect.run.bind(effect);
  runner.watch = effect;
  return runner;
}

export function computed(getter) {
  let computedValue;
  let isDirty = true;

  const scheduler = () => {
    if (!isDirty) {
      isDirty = true;
      trigger(computedRef, 'value');
    }
  };

  const getterEffect = createReactiveEffect(getter, scheduler);

  const computedRef = {
    get value() {
      if (isDirty) {
        computedValue = getterEffect.run();
        isDirty = false;
      }
      track(computedRef, 'value');
      return computedValue;
    },
    __is_ref: true,
    __is_computed: true,
  };
  return computedRef;
}

export function store(options) {
  const store = reactive(options.state());
  const wrappedActions = {};
  const wrappedGetters = {};

  if (options.actions) {
    for (const key in options.actions) {
      wrappedActions[key] = options.actions[key].bind(store);
    }
  }

  if (options.getters) {
    for (const key in options.getters) {
      const computer = computed(() => options.getters[key].call(store));
      Object.defineProperty(wrappedGetters, key, {
        get: () => computer.value,
      });
    }
  }

  return new Proxy(store, {
    get(target, key, receiver) {
      if (key in wrappedGetters) {
        return wrappedGetters[key];
      }
      if (key in wrappedActions) {
        return wrappedActions[key];
      }
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      console.warn(
        `Attempted to directly set store property "${String(
          key,
        )}". Use an action to modify state.`,
      );
      return Reflect.set(target, key, value, receiver);
    },
  });
}

const baseHandlers = {
  get(target, key, receiver) {
    if (key === RAW_SYMBOL) return target;
    const value = Reflect.get(target, key, receiver);
    track(target, key);

    const unwrapped = isRef(value) ? value.value : value;

    return isObject(unwrapped) ? reactive(unwrapped) : unwrapped;
  },
  set(target, key, value, receiver) {
    const oldValue = target[key];
    const result = Reflect.set(target, key, value, receiver);
    if (oldValue !== value) {
      trigger(target, key);
    }
    return result;
  },
};

const arrayHandlers = {
  get(target, key, receiver) {
    const mutationMethods = ['push', 'pop', 'shift', 'unshift', 'splice'];
    if (mutationMethods.includes(key)) {
      return function (...args) {
        const result = Array.prototype[key].apply(target, args);
        trigger(target, 'length');
        return result;
      };
    }
    return baseHandlers.get(target, key, receiver);
  },
  set(target, key, value, receiver) {
    const hadKey = Object.prototype.hasOwnProperty.call(target, key);
    const oldValue = target[key];
    const result = Reflect.set(target, key, value, receiver);

    if (hadKey && value === oldValue) {
      return result;
    }

    trigger(target, key);

    trigger(target, 'length');

    return result;
  },
};

const collectionHandlers = {
  map: {
    get(target, key, receiver) {
      if (key === RAW_SYMBOL) return target;
      const value = Reflect.get(target, key, receiver);

      if (key === 'get') {
        return (k) => {
          track(target, k);
          return target.get(k);
        };
      }
      if (key === 'has') {
        return (k) => {
          track(target, k);
          return target.has(k);
        };
      }
      if (key === 'size') {
        track(target, 'size');
        return target.size;
      }
      if (
        ['forEach', 'keys', 'values', 'entries', Symbol.iterator].includes(key)
      ) {
        track(target, 'iterate');
      }

      if (key === 'set') {
        return (k, v) => {
          const had = target.has(k);
          const oldVal = target.get(k);
          const result = target.set(k, v);
          if (!had) {
            trigger(target, 'size');
          } else if (oldVal !== v) {
            trigger(target, k);
          }
          return result;
        };
      }
      if (key === 'delete') {
        return (k) => {
          const had = target.has(k);
          const result = target.delete(k);
          if (had) trigger(target, 'size');
          return result;
        };
      }

      return typeof value === 'function' ? value.bind(target) : value;
    },
  },
  set: {
    get(target, key, receiver) {
      if (key === RAW_SYMBOL) return target;

      if (key === 'size') {
        track(target, 'iterate');
        return Reflect.get(target, key, receiver);
      }

      const value = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      const boundFn = value.bind(target);

      switch (key) {
        case 'has':
          return (v) => {
            track(target, v);
            return boundFn(v);
          };
        case 'add':
          return (v) => {
            const had = target.has(v);
            const result = boundFn(v);
            if (!had) {
              trigger(target, v);
              trigger(target, 'iterate');
            }
            return result;
          };
        case 'delete':
          return (v) => {
            const had = target.has(v);
            const result = boundFn(v);
            if (had) {
              trigger(target, v);
              trigger(target, 'iterate');
            }
            return result;
          };
        case 'clear':
          return () => {
            const hadItems = target.size > 0;
            const items = hadItems ? [...target] : [];
            const result = boundFn();
            if (hadItems) {
              items.forEach((v) => trigger(target, v));
              trigger(target, 'iterate');
            }
            return result;
          };
        default:
          track(target, 'iterate');
          return boundFn;
      }
    },
  },
};
