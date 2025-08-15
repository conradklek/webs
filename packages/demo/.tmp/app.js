import { create_router } from "@conradklek/webs";
import { use_logger } from "../src/use/logger.js";
import { use_auth } from "../src/use/auth.js";
import Profile from "../src/app/profile.js";
import Home from "../src/app/index.js";
import Signup from "../src/app/signup.js";
import Login from "../src/app/login.js";

const routes = { "/profile": { component: Profile, middleware: [use_logger, use_auth] },
  "/": { component: Home, middleware: [use_logger] },
  "/signup": { component: Signup, middleware: [use_logger] },
  "/login": { component: Login, middleware: [use_logger] } };

create_router(routes);
