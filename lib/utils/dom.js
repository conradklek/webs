/**
 * @file DOM-related utility functions.
 */

import { isObject, isString } from './lang.js';

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
