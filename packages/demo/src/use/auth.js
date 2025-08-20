export function use_auth(to, _from, next) {
  console.log("Running Auth Middleware on the server...");
  if (!to.user) {
    next("/login");
  } else {
    next();
  }
}
