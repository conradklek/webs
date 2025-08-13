import { reactive, computed } from "./reactivity.js";

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
