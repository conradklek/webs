import { create_router } from "@conradklek/webs/runtime-dom.js";
import Home from "./app/index.js";
import "./app.css";

const routes = {
  "/": {
    component: Home,
  },
};

create_router(routes);
