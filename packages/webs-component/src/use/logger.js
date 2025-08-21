export function use_logger(to, from, next) {
  console.log(`Navigating from ${from.path ?? "/"} to ${to.path}`);
  next();
}
