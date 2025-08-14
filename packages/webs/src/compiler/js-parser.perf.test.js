import { run_benchmark, setup_benchmark_reporter } from "../utils";
import { describe, test, expect } from "bun:test";
import {
  tokenize_expression,
  parse_expression,
  js_token_cache,
} from "./js-parser";

setup_benchmark_reporter();

/**
 * @file This file contains performance benchmarks for the JavaScript expression parser.
 * This is critical for the performance of dynamic attributes and interpolations.
 */

describe("JS Expression Parser Performance", () => {
  test("benchmarks", () => {
    console.log("\n--- Running JS Parser Benchmarks ---");

    const simpleExpr = `myVar`;
    run_benchmark(
      "js-parser: parse simple identifier",
      () => {
        js_token_cache.clear();
        parse_expression(tokenize_expression(simpleExpr));
      },
      5000,
    );

    const binaryExpr = `a + b * c / 2 - d`;
    run_benchmark(
      "js-parser: parse binary expression",
      () => {
        js_token_cache.clear();
        parse_expression(tokenize_expression(binaryExpr));
      },
      1000,
    );

    const complexExpr = `user.name.first ? user.getGreeting(true) : 'Default Greeting'`;
    run_benchmark(
      "js-parser: parse complex member access and ternary",
      () => {
        js_token_cache.clear();
        parse_expression(tokenize_expression(complexExpr));
      },
      1000,
    );

    const longExpr = Array.from({ length: 20 }, (_, i) => `var${i}`).join(
      " + ",
    );
    run_benchmark(
      "js-parser: parse long chain of binary expressions",
      () => {
        js_token_cache.clear();
        parse_expression(tokenize_expression(longExpr));
      },
      500,
    );

    console.log("----------------------------------\n");
    expect(true).toBe(true);
  });
});
