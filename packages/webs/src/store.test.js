import { describe, test, expect } from "bun:test";
import { create_store } from "./store";
import { effect } from "./reactivity";

describe("Store", () => {
  test("should create a store with initial state", () => {
    const store = create_store({
      state: () => ({ count: 0, message: "hello" }),
    });
    expect(store.count).toBe(0);
    expect(store.message).toBe("hello");
  });

  test("state should be reactive", () => {
    const store = create_store({ state: () => ({ count: 0 }) });
    let dummy;
    effect(() => {
      dummy = store.count;
    });

    expect(dummy).toBe(0);
    store.count++;
    expect(dummy).toBe(1);
  });

  test("actions should mutate state", () => {
    const store = create_store({
      state: () => ({ count: 0 }),
      actions: {
        increment() {
          this.count++;
        },
        add(amount) {
          this.count += amount;
        },
      },
    });

    store.increment();
    expect(store.count).toBe(1);
    store.add(5);
    expect(store.count).toBe(6);
  });

  test("getters should compute derived state and be reactive", () => {
    const store = create_store({
      state: () => ({ count: 5 }),
      getters: {
        doubled() {
          return this.count * 2;
        },
      },
    });

    let dummy;
    effect(() => {
      dummy = store.doubled;
    });

    expect(store.doubled).toBe(10);
    expect(dummy).toBe(10);

    store.count = 10;
    expect(store.doubled).toBe(20);
    expect(dummy).toBe(20);
  });

  test("store should handle a combination of state, actions, and getters", () => {
    const store = create_store({
      state: () => ({ firstName: "John", lastName: "Doe" }),
      actions: {
        setFirstName(name) {
          this.firstName = name;
        },
      },
      getters: {
        fullName() {
          return `${this.firstName} ${this.lastName}`;
        },
      },
    });

    expect(store.fullName).toBe("John Doe");
    store.setFirstName("Jane");
    expect(store.fullName).toBe("Jane Doe");
  });

  test("getters and actions should have priority over state properties with the same name", () => {
    const store = create_store({
      state: () => ({
        myProp: "state value",
        otherProp: "state value 2",
      }),
      getters: {
        myProp() {
          return "getter value";
        },
      },
      actions: {
        otherProp() {
          return "action value";
        },
      },
    });

    expect(store.myProp).toBe("getter value");
    expect(typeof store.otherProp).toBe("function");
    expect(store.otherProp()).toBe("action value");
  });
});
