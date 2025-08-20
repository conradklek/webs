import { use_session } from "./session.js";

export function use_auth(_to, _from, next) {
  console.log("Running Auth Middleware...");
  if (!use_session.is_logged_in) {
    next("/login");
  } else {
    next();
  }
}
