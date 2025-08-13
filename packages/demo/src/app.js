import { create_router } from "@conradklek/webs/runtime-dom.js";

import Home from "./app/index.js";
import About from "./app/about.js";
import Login from "./app/login.js";
import Profile from "./app/profile.js";

import "./app.css";

import { use_auth } from "./use/auth.js";
import { use_logger } from "./use/logger.js";

const routes = {
  "/": {
    component: Home,
    middleware: [use_logger],
  },
  "/about": {
    component: About,
    middleware: [use_logger],
  },
  "/login": {
    component: Login,
    middleware: [use_logger],
  },
  "/profile": {
    component: Profile,
    middleware: [use_logger, use_auth],
  },
};

create_router(routes);
