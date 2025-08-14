import { run_benchmark, setup_benchmark_reporter } from "../utils";
import { describe, test, expect } from "bun:test";
import { compile } from "./index";

setup_benchmark_reporter();
/**
 * @file This file contains performance benchmarks for the template compiler.
 * The goal is to measure how quickly the compiler can parse, transform,
 * and generate render functions from various template strings.
 */

describe("Compiler Performance", () => {
  test("benchmarks", () => {
    console.log("\n--- Running Compiler Benchmarks ---");

    const simpleTemplate = "<div><p>Hello, World!</p></div>";
    run_benchmark(
      "compiler: compile a simple static template",
      () => {
        compile({ template: simpleTemplate });
      },
      1000,
    );

    const dynamicTemplate =
      '<div><p :id="id" @click="handler">{{ message }}</p></div>';
    run_benchmark(
      "compiler: compile a simple dynamic template",
      () => {
        compile({ template: dynamicTemplate });
      },
      1000,
    );

    const complexTemplate = `
      <div :class="containerClass">
        <h1 w-if="showHeader">{{ title }}</h1>
        <p w-else>No title</p>
        <ul>
          <li w-for="item in items" :key="item.id">
            <span>{{ item.text }}</span>
            <button @click="removeItem(item.id)">Remove</button>
          </li>
        </ul>
        <input w-model="searchText" />
      </div>
    `;
    run_benchmark(
      "compiler: compile a feature-rich component",
      () => {
        compile({ template: complexTemplate });
      },
      100,
    );

    const manyNodesTemplate = `<div>${"<p>Static Node</p>".repeat(100)}</div>`;
    run_benchmark(
      "compiler: compile 100 static nodes",
      () => {
        compile({ template: manyNodesTemplate });
      },
      100,
    );

    const manyBindingsTemplate = `<div>${"<p>{{ i }}</p>".repeat(100)}</div>`;
    run_benchmark(
      "compiler: compile 100 interpolation bindings",
      () => {
        compile({ template: manyBindingsTemplate });
      },
      100,
    );

    const deepIfElseTemplate = `
      <div w-if="a">A</div>
      <div w-else-if="b">B</div>
      <div w-else-if="c">C</div>
      <div w-else-if="d">D</div>
      <div w-else-if="e">E</div>
      <div w-else>F</div>
    `;
    run_benchmark(
      "compiler: compile a deep w-if/w-else chain",
      () => {
        compile({ template: deepIfElseTemplate });
      },
      500,
    );

    console.log("---------------------------------\n");
    expect(true).toBe(true);
  });
});
