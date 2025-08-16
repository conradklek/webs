/**
 * @module src/persist
 * @description A simple utility for interacting with localStorage.
 */

/**
 * Retrieves and parses a value from localStorage, reviving special data types.
 * @param {string} key - The key of the item to retrieve.
 * @returns {any | null} The parsed and revived value, or null if the key doesn't exist or the data is corrupt.
 * @description This function is a wrapper around `localStorage.getItem`. It uses a reviver function with `JSON.parse`
 * to automatically reconstruct complex data types like Map and Set that were serialized by `persist_state`.
 * This ensures that the data structure is the same when you retrieve it as when you stored it.
 */
export function get_persisted_state(key) {
  const value = localStorage.getItem(key);
  if (value) {
    try {
      return JSON.parse(value, (_, v) => {
        if (typeof v === "object" && v !== null && v.__type === "Map") {
          return new Map(v.value);
        }
        if (typeof v === "object" && v !== null && v.__type === "Set") {
          return new Set(v.value);
        }
        return v;
      });
    } catch (e) {
      console.error(`Error parsing persisted state for key "${key}":`, e);
      return null;
    }
  }
  return null;
}

/**
 * Serializes and saves a value to localStorage, handling special data types.
 * @param {string} key - The key to store the value under.
 * @param {any} value - The value to store.
 * @description This function now includes a check to prevent `undefined` values from being stored,
 * which would cause JSON parsing errors on retrieval. It also uses a replacer function
 * with `JSON.stringify` to handle complex data types like Map and Set.
 */
export function persist_state(key, value) {
  if (value === undefined) {
    return;
  }
  const serialized_value = JSON.stringify(value, (_, v) => {
    if (v instanceof Map) {
      return { __type: "Map", value: Array.from(v.entries()) };
    }
    if (v instanceof Set) {
      return { __type: "Set", value: Array.from(v.values()) };
    }
    return v;
  });
  localStorage.setItem(key, serialized_value);
}
