/**
 * @fileoverview A collection of shared, general-purpose utility functions
 * used throughout the framework.
 */

/**
 * Checks if a value is an object (and not null or an array).
 * @param {*} val - The value to check.
 * @returns {boolean}
 */
export const is_object = (val) =>
  val !== null && typeof val === "object" && !Array.isArray(val);

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
 * Used by the SSR and compiler to determine if a tag needs a closing tag.
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

/**
 * Creates a caching decorator for a function that takes a single string argument.
 * @param {Function} fn - The function to memoize.
 * @returns {Function} The memoized function.
 */
export const cache_string_function = (fn) => {
  const cache = Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};

/**
 * Converts a kebab-case string to camelCase.
 * e.g., "my-component-name" -> "myComponentName"
 * @type {Function}
 */
export const camelize = cache_string_function((str) => {
  return str.replace(/-(\w)/g, (_, c) => (c ? c.toUpperCase() : ""));
});

/**
 * Converts a string to PascalCase.
 * e.g., "my-component-name" -> "MyComponentName"
 * @param {string} str - The string to convert.
 * @returns {string}
 */
export const to_pascal_case = (str) => {
  if (!is_string(str)) return str;
  const cameled = camelize(str);
  return cameled.charAt(0).toUpperCase() + cameled.slice(1);
};
