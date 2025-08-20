import * as Home from "./app/index.js";
import * as Login from "./app/login.js";
import * as Signup from "./app/signup.js";
import * as Profile from "./app/profile.js";

export const routes = {
  "/": {
    component: Home.default,
    component_name: "index",
    middleware: Home.middleware,
  },
  "/login": {
    component: Login.default,
    component_name: "login",
    middleware: Login.middleware,
  },
  "/signup": {
    component: Signup.default,
    component_name: "signup",
    middleware: Signup.middleware,
  },
  "/profile/:username": {
    component: Profile.default,
    component_name: "profile",
    middleware: Profile.middleware,
  },
};
