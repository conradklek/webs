import fs from "fs";
import path from "path";

/**
 * Checks if a value is an object (and not null).
 * @param {*} val - The value to check.
 * @returns {boolean}
 */
export const is_object = (val) => val !== null && typeof val === "object";

/**
 * Checks if a value is a string.
 * @param {*} val - The value to check.
 * @returns {boolean}
 */
export const is_string = (val) => typeof val === "string";

/**
 * Checks if a value is a function.
 * @param {*} val - The value to check.
 * @returns {boolean}
 */
export const is_function = (val) => typeof val === "function";

/**
 * A set of HTML tags that are self-closing (void elements).
 * @type {Set<string>}
 */
export const void_elements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export const benchmark_results = {};

export function run_benchmark(name, fn, iterations = 1000) {
  for (let i = 0; i < iterations * 0.1; i++) {
    fn();
  }
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  const duration = end - start;
  const ops_per_sec = Math.round((iterations / duration) * 1000);
  benchmark_results[name] = { ops_per_sec };
  console.log(`  • ${name}: ${ops_per_sec.toLocaleString("en-US")} ops/sec`);
}

let is_exit_hook_registered = false;

/**
 * Registers a single process exit hook to save benchmark results.
 * This ensures the save operation only happens once after all tests are done.
 */
export function setup_benchmark_reporter() {
  if (is_exit_hook_registered) return;
  is_exit_hook_registered = true;

  process.on("exit", () => {
    const file_path = path.join(process.cwd(), "benchmark-results.json");
    const SIGNIFICANCE_THRESHOLD = 0.02;
    let old_results = {};
    let has_significant_change = false;

    try {
      const old_data = fs.readFileSync(file_path, "utf-8");
      old_results = JSON.parse(old_data);
    } catch (error) {
      console.log("No previous benchmark results found. Creating new file.");
      has_significant_change = true;
    }

    if (!has_significant_change) {
      const all_keys = new Set([
        ...Object.keys(benchmark_results),
        ...Object.keys(old_results),
      ]);
      for (const key of all_keys) {
        const old_val = old_results[key]?.ops_per_sec;
        const new_val = benchmark_results[key]?.ops_per_sec;

        if (!old_val || !new_val) {
          has_significant_change = true;
          break;
        }

        const percentage_diff = Math.abs((new_val - old_val) / old_val);
        if (percentage_diff > SIGNIFICANCE_THRESHOLD) {
          has_significant_change = true;
          break;
        }
      }
    }

    if (has_significant_change) {
      const data = JSON.stringify(benchmark_results, null, 2);
      try {
        fs.writeFileSync(file_path, data, "utf-8");
        console.log(
          `\nSignificant performance change detected. Benchmark results saved to ${file_path}`,
        );
      } catch (error) {
        console.error("Failed to save benchmark results:", error);
      }
    } else {
      console.log(
        "\nNo significant performance change detected. Benchmark file not updated.",
      );
    }
  });
}
