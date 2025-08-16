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

export const Fragment = Symbol("Fragment");

export const Comment = Symbol("Comment");

export const Teleport = Symbol("Teleport");

export const Text = Symbol("Text");

export const cache_string_function = (fn) => {
  const cache = Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};

export const camelize = cache_string_function((str) => {
  return str.replace(/-(\w)/g, (_, c) => (c ? c.toUpperCase() : ""));
});

export const to_pascal_case = (str) => {
  if (!is_string(str)) return str;
  const cameled = camelize(str);
  return cameled.charAt(0).toUpperCase() + cameled.slice(1);
};
