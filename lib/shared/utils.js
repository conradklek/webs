/**
 * @file Contains shared utility functions for language, DOM, and common tasks.
 */

/**
 * Checks if a value is a plain object.
 * @param {any} val - The value to check.
 * @returns {val is object} `true` if the value is an object, not an array, and not null.
 */
export const isObject = (val) =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

/**
 * Checks if a value is a string.
 * @param {any} val - The value to check.
 * @returns {val is string} `true` if the value is a string.
 */
export const isString = (val) => typeof val === 'string';

/**
 * Checks if a value is a function.
 * @param {any} val - The value to check.
 * @returns {val is Function} `true` if the value is a function.
 */
export const isFunction = (val) => typeof val === 'function';

/**
 * Generates a universally unique identifier (UUID) v4.
 * Uses the browser's or Node.js's native `crypto.randomUUID` if available,
 * otherwise falls back to a Math.random-based implementation.
 * @returns {string} The generated UUID.
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * @typedef {string | Record<string, boolean> | Array<string | Record<string, boolean>>} ClassValue
 */

/**
 * A set of HTML tags that are self-closing (void elements).
 * @type {Set<string>}
 */
export const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Normalizes a class attribute value into a single space-separated string.
 * It can handle string, object, and array formats for defining classes.
 *
 * @example
 * normalizeClass('foo bar');
 * normalizeClass({ foo: true, bar: false, baz: true });
 * normalizeClass(['foo', { bar: true }]);
 *
 * @param {ClassValue} value - The class value to normalize.
 * @returns {string} The normalized class string.
 */
export function normalizeClass(value) {
  let res = '';
  if (isString(value)) {
    res = value;
  } else if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeClass(/** @type {ClassValue} */ (item));
      if (normalized) res += normalized + ' ';
    }
  } else if (isObject(value)) {
    for (const key in value) {
      if (value[key]) res += key + ' ';
    }
  }
  return res.trim();
}
