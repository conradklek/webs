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
 * Used by the compiler to avoid adding a closing tag.
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
