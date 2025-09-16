/**
 * @file Shared utility functions used across the framework, safe for both client and server environments.
 */

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
