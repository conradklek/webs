import { use_logger } from "./use/logger.js";
import { use_auth } from "./use/auth.js";

import * as Home from "./app/index.js";
import * as Login from "./app/login.js";
import * as Signup from "./app/signup.js";
import * as Profile from "./app/profile.js";
import * as Components from "./app/components.js";

export const routes = {
  "/": {
    component: Home.default,
    component_name: "index",
    middleware: [use_logger],
  },
  "/login": {
    component: Login.default,
    component_name: "login",
    middleware: [use_logger],
  },
  "/signup": {
    component: Signup.default,
    component_name: "signup",
    middleware: [use_logger],
  },
  "/profile/:username": {
    component: Profile.default,
    component_name: "profile",
    middleware: [use_auth],
  },
  "/components/:component": {
    component: Components.default,
    component_name: "components",
    middleware: [use_logger],
  },
};
