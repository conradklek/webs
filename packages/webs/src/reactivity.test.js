import { test, expect, describe } from "bun:test";
import {
  reactive,
  effect,
  computed,
  create_reactive_effect,
  cleanup,
  track,
  trigger,
} from "./reactivity";

describe("Reactivity System", () => {
  describe("reactive()", () => {
    test("should return a proxy for an object", () => {
      const original = { a: 1 };
      const observed = reactive(original);
      expect(observed).not.toBe(original);
      expect(observed.a).toBe(1);
    });

    test("should handle nested objects", () => {
      const state = reactive({ nested: { count: 0 } });
      let dummy;

      effect(() => {
        dummy = state.nested.count;
      });

      expect(dummy).toBe(0);
      state.nested.count++;
      expect(dummy).toBe(1);
    });

    test("should not wrap non-objects", () => {
      const num = reactive(123);
      const str = reactive("hello");
      const bool = reactive(true);
      expect(num).toBe(123);
      expect(str).toBe("hello");
      expect(bool).toBe(true);
    });
  });

  describe("effect()", () => {
    test("should run and track dependencies", () => {
      const state = reactive({ count: 0 });
      let dummy;

      effect(() => {
        dummy = state.count;
      });

      expect(dummy).toBe(0);
      state.count++;
      expect(dummy).toBe(1);
    });

    test("should not trigger for unrelated property changes", () => {
      const state = reactive({ a: 1, b: 2 });
      let dummy;
      let effectRunCount = 0;

      effect(() => {
        dummy = state.a;
        effectRunCount++;
      });

      expect(effectRunCount).toBe(1);
      state.b = 3;
      expect(effectRunCount).toBe(1);
      expect(dummy).toBe(1);
    });

    test("should allow stopping the effect", () => {
      const state = reactive({ count: 0 });
      let dummy;
      const runner = effect(() => {
        dummy = state.count;
      });

      expect(dummy).toBe(0);
      runner.effect.stop();
      state.count++;
      expect(dummy).toBe(0);
    });
  });

  describe("computed()", () => {
    test("should cache its value", () => {
      let getterCallCount = 0;
      const state = reactive({ a: 1, b: 2 });
      const getter = () => {
        getterCallCount++;
        return state.a + state.b;
      };
      const computedSum = computed(getter);

      expect(computedSum.value).toBe(3);
      expect(computedSum.value).toBe(3);
      expect(getterCallCount).toBe(1);

      state.a = 2;
      expect(computedSum.value).toBe(4);
      expect(getterCallCount).toBe(2);
    });

    test("should work with effects", () => {
      const state = reactive({ a: 1 });
      const c = computed(() => state.a);
      let dummy;
      effect(() => {
        dummy = c.value;
      });
      expect(dummy).toBe(1);
      state.a = 2;
      expect(dummy).toBe(2);
    });
  });

  describe("Core Internals: track(), trigger(), cleanup()", () => {
    test("track() and trigger() should work together", () => {
      const target = { count: 0 };
      let runCount = 0;
      const fn = () => {
        runCount++;
        track(target, "count");
      };
      const reactiveEffect = create_reactive_effect(fn, null);
      reactiveEffect.run();

      expect(runCount).toBe(1);
      trigger(target, "count");
      expect(runCount).toBe(2);
    });

    test("cleanup() should remove an effect from its dependencies", () => {
      const target = { count: 0 };
      let runCount = 0;
      const fn = () => {
        runCount++;
        track(target, "count");
      };

      const reactiveEffect = create_reactive_effect(fn, null);
      reactiveEffect.run();

      expect(runCount).toBe(1);
      expect(reactiveEffect.deps.length).toBe(1);

      cleanup(reactiveEffect);
      expect(reactiveEffect.deps.length).toBe(0);

      trigger(target, "count");
      expect(runCount).toBe(1);
    });

    test("create_reactive_effect() should respect the scheduler", () => {
      const state = reactive({ count: 0 });
      let effectRunCount = 0;
      let schedulerRunCount = 0;

      const scheduler = () => {
        schedulerRunCount++;
      };

      effect(
        () => {
          effectRunCount++;
          return state.count;
        },
        { scheduler },
      );

      expect(effectRunCount).toBe(1);
      expect(schedulerRunCount).toBe(0);

      state.count++;

      expect(effectRunCount).toBe(1);
      expect(schedulerRunCount).toBe(1);
    });
  });

  describe("Performance Benchmarks", () => {
    test("creating a reactive proxy", () => {
      reactive({ a: 1, b: 2, c: { d: 3 } });
    });

    test("running an effect with a simple dependency", () => {
      const state = reactive({ count: 0 });
      effect(() => {
        const a = state.count;
      });
      state.count++;
    });

    test("running an effect with multiple dependencies", () => {
      const state = reactive({ a: 1, b: 2, c: 3 });
      effect(() => {
        const x = state.a;
        const y = state.b;
        const z = state.c;
      });
      state.b++;
    });

    test("using a computed property", () => {
      const state = reactive({ a: 1, b: 2 });
      const sum = computed(() => state.a + state.b);
      const val = sum.value;
      state.a = 5;
      const newVal = sum.value;
    });
  });
});
