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
