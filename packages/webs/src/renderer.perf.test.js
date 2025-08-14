import { describe, test, expect } from "bun:test";
import { create_renderer, h, DOM_element, DOM_text_node } from "./renderer";
import { run_benchmark, setup_benchmark_reporter } from "./utils";

setup_benchmark_reporter();

/**
 * @file This file contains performance benchmarks for the rendering system.
 */

const createMockHost = () => ({
  create_element: (tag) => new DOM_element(tag),
  create_text: (text) => new DOM_text_node(text),
  patch_prop: (el, key, _, nextVal) => {
    if (nextVal === null) el.remove_attribute(key);
    else el.set_attribute(key, nextVal);
  },
  insert: (el, parent, anchor) => parent.insert_before(el, anchor),
  remove: (el) => el?.parent_node?.remove_child(el),
  set_element_text: (el, text) => {
    el.text_content = text;
  },
});

describe("Renderer Performance", () => {
  test("benchmarks", () => {
    const renderer = create_renderer(createMockHost());
    const container = new DOM_element("div");

    console.log("\n--- Running Renderer Benchmarks ---");

    run_benchmark(
      "renderer: mount single element",
      () => {
        renderer.patch(null, h("div"), container);
      },
      5000,
    );

    run_benchmark(
      "renderer: mount element with 10 props",
      () => {
        renderer.patch(
          null,
          h("div", {
            "data-1": 1,
            "data-2": 2,
            "data-3": 3,
            "data-4": 4,
            "data-5": 5,
            "data-6": 6,
            "data-7": 7,
            "data-8": 8,
            "data-9": 9,
            "data-10": 10,
          }),
          container,
        );
      },
      1000,
    );

    run_benchmark(
      "renderer: mount deep tree (5 levels)",
      () => {
        renderer.patch(
          null,
          h("div", h("div", h("div", h("div", h("p", "hello"))))),
          container,
        );
      },
      1000,
    );

    const vnode1_patch_props = h("div", { id: "a", class: "foo" });
    renderer.patch(null, vnode1_patch_props, container);
    run_benchmark(
      "renderer: patch 2 props",
      () => {
        const vnode2_patch_props = h("div", { id: "b", class: "bar" });
        renderer.patch(vnode1_patch_props, vnode2_patch_props, container);
      },
      5000,
    );

    const vnode1_patch_text = h("div", "initial text");
    renderer.patch(null, vnode1_patch_text, container);
    run_benchmark(
      "renderer: patch text content",
      () => {
        const vnode2_patch_text = h("div", "updated text");
        renderer.patch(vnode1_patch_text, vnode2_patch_text, container);
      },
      5000,
    );

    const unkeyed_v1 = h(
      "div",
      Array.from({ length: 20 }, (_, i) => h("p", i)),
    );
    renderer.patch(null, unkeyed_v1, container);
    run_benchmark(
      "renderer: unkeyed add 5 children",
      () => {
        const unkeyed_v2 = h(
          "div",
          Array.from({ length: 25 }, (_, i) => h("p", i)),
        );
        renderer.patch(unkeyed_v1, unkeyed_v2, container);
      },
      1000,
    );

    const keyed_v1 = h(
      "div",
      Array.from({ length: 20 }, (_, i) => h("p", { key: i }, i)),
    );
    renderer.patch(null, keyed_v1, container);
    run_benchmark(
      "renderer: keyed remove 1 child",
      () => {
        const new_children = Array.from({ length: 20 }, (_, i) =>
          h("p", { key: i }, i),
        );
        new_children.splice(10, 1);
        const keyed_v2 = h("div", new_children);
        renderer.patch(keyed_v1, keyed_v2, container);
      },
      1000,
    );

    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const keyed_shuffle_v1 = h(
      "div",
      Array.from({ length: 100 }, (_, i) => h("p", { key: i }, i)),
    );
    renderer.patch(null, keyed_shuffle_v1, container);
    run_benchmark(
      "renderer: keyed shuffle 100 children",
      () => {
        const shuffled_children = shuffle(
          Array.from({ length: 100 }, (_, i) => h("p", { key: i }, i)),
        );
        const keyed_shuffle_v2 = h("div", shuffled_children);
        renderer.patch(keyed_shuffle_v1, keyed_shuffle_v2, container);
      },
      100,
    );

    console.log("---------------------------------\n");
    expect(true).toBe(true);
  });
});
