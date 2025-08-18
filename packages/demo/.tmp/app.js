import { create_router } from "@conradklek/webs";

const routes = { 
  "/profile": () => import("../src/app/profile.js"),
  "/": () => import("../src/app/index.js"),
  "/signup": () => import("../src/app/signup.js"),
  "/login": () => import("../src/app/login.js") 
};

create_router(routes);
