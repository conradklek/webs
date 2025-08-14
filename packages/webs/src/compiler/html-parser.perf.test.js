import { run_benchmark, setup_benchmark_reporter } from "../utils";
import { parse_html, html_ast_cache } from "./html-parser";
import { describe, test, expect } from "bun:test";

setup_benchmark_reporter();

/**
 * @file This file contains performance benchmarks for the HTML parser.
 * We are measuring the speed of tokenizing and building the AST from raw HTML strings.
 */

describe("HTML Parser Performance", () => {

  test("benchmarks", () => {
    console.log("\n--- Running HTML Parser Benchmarks ---");

    const simpleHTML = `<div><p>Hello</p></div>`;
    run_benchmark(
      "html-parser: parse simple template",
      () => {
        html_ast_cache.clear();
        parse_html(simpleHTML);
      },
      1000,
    );

    const nestedHTML = `<div><div><div><div><p>Deeply Nested</p></div></div></div></div>`;
    run_benchmark(
      "html-parser: parse deeply nested template",
      () => {
        html_ast_cache.clear();
        parse_html(nestedHTML);
      },
      1000,
    );

    const largeHTML = `<ul>${"<li>Item</li>".repeat(100)}</ul>`;
    run_benchmark(
      "html-parser: parse template with 100 siblings",
      () => {
        html_ast_cache.clear();
        parse_html(largeHTML);
      },
      100,
    );

    const kitchenSinkHTML = `
      <main id="content" class="container">
        <!-- Main header -->
        <h1 :class="titleClass">Welcome to the App</h1>
        <p>This is a paragraph with some <strong>bold text</strong> and an <a href="/about">internal link</a>.</p>
        <div w-if="user.isLoggedIn">
          <p>Welcome back, {{ user.name }}!</p>
          <button @click="logout">Log Out</button>
        </div>
        <div w-else>
          <p>Please <a href="/login">log in</a> to continue.</p>
        </div>
      </main>
    `;
    run_benchmark(
      "html-parser: parse a 'kitchen sink' template",
      () => {
        html_ast_cache.clear();
        parse_html(kitchenSinkHTML);
      },
      500,
    );

    console.log("------------------------------------\n");
    expect(true).toBe(true);
  });
});
