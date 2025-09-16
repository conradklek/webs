import { test, expect, describe } from 'bun:test';
import {
  ref,
  state,
  computed,
  effect,
  store,
  isRef,
  RAW_SYMBOL,
} from './reactivity.js';

describe('ref', () => {
  test('should create a ref and return its initial value', () => {
    const count = ref(0);
    expect(count.value).toBe(0);
    expect(isRef(count)).toBe(true);
  });

  test('should update the ref value and trigger an effect', () => {
    const count = ref(0);
    let doubleCount;
    effect(() => {
      doubleCount = count.value * 2;
    });
    count.value = 5;
    expect(doubleCount).toBe(10);
  });

  test('should not trigger effect if value is the same', () => {
    const count = ref(0);
    let callCount = 0;
    effect(() => {
      callCount++;
    });
    expect(callCount).toBe(1);
    count.value = 0;
    expect(callCount).toBe(1);
  });
});

describe('state', () => {
  test('should create a ref for a primitive value', () => {
    const count = state(0);
    expect(isRef(count)).toBe(true);
  });

  test('should create a reactive proxy for an object', () => {
    const user = state({ name: 'Webs', age: 1 });
    expect(isRef(user)).toBe(false);
    expect(user.name).toBe('Webs');
  });

  test('should update a reactive proxy and trigger an effect', () => {
    const user = state({ name: 'Webs', age: 1 });
    let newName;
    effect(() => {
      newName = user.name.toUpperCase();
    });
    user.name = 'Gemini';
    expect(newName).toBe('GEMINI');
  });

  test('should handle nested objects in a reactive proxy', () => {
    const profile = state({
      user: {
        name: 'Webs',
      },
    });
    let userName;
    effect(() => {
      userName = profile.user.name;
    });
    profile.user.name = 'John Doe';
    expect(userName).toBe('John Doe');
  });

  test('should handle adding a new property to a reactive object', () => {
    const user = state({ name: 'Webs' });
    let newPropValue;
    effect(() => {
      newPropValue = user.age;
    });
    expect(newPropValue).toBeUndefined();
    user.age = 5;
    expect(newPropValue).toBe(5);
  });
});

describe('computed', () => {
  test('should compute a value based on a ref dependency', () => {
    const count = ref(1);
    const double = computed(() => count.value * 2);
    expect(double.value).toBe(2);
    expect(isRef(double)).toBe(true);
  });

  test('should re-calculate when a dependency changes', () => {
    const count = ref(1);
    const double = computed(() => count.value * 2);
    count.value = 3;
    expect(double.value).toBe(6);
  });

  test('should not re-calculate if a dependency is not changed', () => {
    const count = ref(1);
    let calculations = 0;
    const double = computed(() => {
      calculations++;
      return count.value * 2;
    });
    double.value;
    double.value;
    expect(calculations).toBe(1);
    count.value = 5;
    double.value;
    expect(calculations).toBe(2);
  });

  test('should reactively update when a deeply nested state changes', () => {
    const user = state({ profile: { name: 'Webs' } });
    const greeting = computed(() => `Hello, ${user.profile.name}!`);
    expect(greeting.value).toBe('Hello, Webs!');
    user.profile.name = 'Jane Doe';
    expect(greeting.value).toBe('Hello, Jane Doe!');
  });

  test('should chain computed properties', () => {
    const count = ref(1);
    const double = computed(() => count.value * 2);
    const quadruple = computed(() => double.value * 2);
    expect(quadruple.value).toBe(4);
    count.value = 3;
    expect(quadruple.value).toBe(12);
  });
});

describe('store', () => {
  test('should create a store with state, getters, and actions', () => {
    const myStore = store({
      state: () => ({ count: 0 }),
      getters: {
        doubleCount() {
          return this.count * 2;
        },
      },
      actions: {
        increment() {
          this.count++;
        },
      },
    });
    expect(myStore.count).toBe(0);
    expect(myStore.doubleCount).toBe(0);
  });

  test('should update state via an action', () => {
    const myStore = store({
      state: () => ({ count: 0 }),
      actions: {
        increment() {
          this.count++;
        },
      },
    });
    myStore.increment();
    expect(myStore.count).toBe(1);
  });

  test('should reactively update getters', () => {
    const myStore = store({
      state: () => ({ count: 0 }),
      getters: {
        doubleCount() {
          return this.count * 2;
        },
      },
      actions: {
        increment() {
          this.count++;
        },
      },
    });
    expect(myStore.doubleCount).toBe(0);
    myStore.increment();
    expect(myStore.doubleCount).toBe(2);
  });

  test('actions can accept arguments', () => {
    const myStore = store({
      state: () => ({ count: 0 }),
      actions: {
        add(amount) {
          this.count += amount;
        },
      },
    });
    myStore.add(10);
    expect(myStore.count).toBe(10);
  });
});

describe('array reactivity', () => {
  test('should react to a value change via index', () => {
    const arr = state(['a', 'b', 'c']);
    let firstItem;
    effect(() => {
      firstItem = arr[0];
    });
    arr[0] = 'z';
    expect(firstItem).toBe('z');
  });

  test('should react to a push operation', () => {
    const arr = state([]);
    let length;
    effect(() => {
      length = arr.length;
    });
    arr.push(1);
    expect(length).toBe(1);
    expect(arr[0]).toBe(1);
  });

  test('should react to a pop operation', () => {
    const arr = state([1, 2, 3]);
    let lastItem;
    effect(() => {
      lastItem = arr[arr.length - 1];
    });
    arr.pop();
    expect(lastItem).toBe(2);
    expect(arr.length).toBe(2);
  });

  test('should react to a length property change', () => {
    const arr = state([1, 2, 3, 4]);
    let length;
    effect(() => {
      length = arr.length;
    });
    arr.length = 2;
    expect(length).toBe(2);
    expect(arr[3]).toBeUndefined();
  });

  test('should react to a splice operation', () => {
    const arr = state([1, 2, 3, 4]);
    let firstItem;
    let length;
    effect(() => {
      firstItem = arr[0];
      length = arr.length;
    });
    arr.splice(0, 2, 5, 6);
    expect(firstItem).toBe(5);
    expect(length).toBe(4);
    expect(arr).toEqual([5, 6, 3, 4]);
  });
});

describe('map reactivity', () => {
  test('should react to a new key being set', () => {
    const map = state(new Map());
    let value;
    effect(() => {
      value = map.get('key1');
    });
    map.set('key1', 'value1');
    expect(value).toBe('value1');
  });

  test('should react to an existing key being updated', () => {
    const map = state(new Map([['key1', 'value1']]));
    let value;
    effect(() => {
      value = map.get('key1');
    });
    map.set('key1', 'new-value');
    expect(value).toBe('new-value');
  });

  test('should react to a key being deleted', () => {
    const map = state(new Map([['key1', 'value1']]));
    let hasKey;
    effect(() => {
      hasKey = map.has('key1');
    });
    map.delete('key1');
    expect(hasKey).toBe(false);
  });

  test('should react to the size property changing', () => {
    const map = state(new Map([['key1', 'value1']]));
    let size;
    effect(() => {
      size = map.size;
    });
    map.set('key2', 'value2');
    expect(size).toBe(2);
    map.delete('key1');
    expect(size).toBe(1);
  });
});

describe('set reactivity', () => {
  test('should react to a new value being added', () => {
    const set = state(new Set());
    let hasValue;
    effect(() => {
      hasValue = set.has('item1');
    });
    set.add('item1');
    expect(hasValue).toBe(true);
  });

  test('should react to a value being deleted', () => {
    const set = state(new Set(['item1']));
    let hasValue;
    effect(() => {
      hasValue = set.has('item1');
    });
    set.delete('item1');
    expect(hasValue).toBe(false);
  });

  test('should react to the size property changing', () => {
    const set = state(new Set(['item1']));
    let size;
    effect(() => {
      size = set.size;
    });
    set.add('item2');
    expect(size).toBe(2);
    set.delete('item1');
    expect(size).toBe(1);
  });
});

describe('misc', () => {
  test('should get the raw object from a reactive proxy via RAW_SYMBOL', () => {
    const obj = { name: 'Webs' };
    const reactiveObj = state(obj);
    expect(reactiveObj[RAW_SYMBOL]).toBe(obj);
  });

  test('should stop an effect and prevent further updates', () => {
    const count = ref(0);
    let dummy;
    const runner = effect(() => {
      dummy = count.value;
    });
    expect(dummy).toBe(0);
    count.value++;
    expect(dummy).toBe(1);
    runner.effect.stop();
    count.value++;
    expect(dummy).toBe(1);
  });
});

describe('effect scheduler', () => {
  test('should run effect with a scheduler', (done) => {
    const count = ref(0);
    const jobQueue = [];
    let dummy;

    const runner = effect(
      () => {
        dummy = count.value;
      },
      {
        scheduler: () => {
          jobQueue.push(runner);
        },
      },
    );

    expect(dummy).toBe(0);
    expect(jobQueue.length).toBe(0);

    count.value++;

    expect(dummy).toBe(0);
    expect(jobQueue.length).toBe(1);

    jobQueue[0]();
    expect(dummy).toBe(1);
    done();
  });
});

describe('state on nested structures', () => {
  test('should make newly added object properties reactive', () => {
    const user = state({ info: {} });
    let city;
    effect(() => {
      city = user.info.address?.city;
    });

    expect(city).toBeUndefined();

    user.info.address = { city: 'Chicago' };
    expect(city).toBe('Chicago');
  });

  test('should react to array mutation methods like unshift and reverse', () => {
    const arr = state([1, 2, 3]);
    let firstItem;
    let lastItem;

    effect(() => {
      firstItem = arr[0];
      lastItem = arr[arr.length - 1];
    });

    expect(firstItem).toBe(1);
    expect(lastItem).toBe(3);

    arr.unshift(0);
    expect(firstItem).toBe(0);
    expect(lastItem).toBe(3);
    expect(arr).toEqual([0, 1, 2, 3]);

    arr.reverse();
    expect(firstItem).toBe(3);
    expect(lastItem).toBe(0);
    expect(arr).toEqual([3, 2, 1, 0]);
  });
});
