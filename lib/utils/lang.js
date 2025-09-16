/**
 * @file Contains basic language utility functions for type checking.
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
