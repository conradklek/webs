import { create_router } from "@conradklek/webs";
const routes = { 
  "/profile": () => import("../src/app/profile.js").then(m => m['default']),
  "/": () => import("../src/app/index.js").then(m => m['default']),
  "/signup": () => import("../src/app/signup.js").then(m => m['default']),
  "/login": () => import("../src/app/login.js").then(m => m['default']) 
};
create_router(routes);