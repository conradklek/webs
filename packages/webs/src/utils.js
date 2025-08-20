export const is_object = (val) =>
  val !== null && typeof val === "object" && !Array.isArray(val);

export const is_string = (val) => typeof val === "string";

export const is_function = (val) => typeof val === "function";

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
