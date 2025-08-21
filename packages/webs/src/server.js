import { basename, join } from "path";
import { render_to_string } from "./ssr.js";
import { h } from "./renderer.js";
import {
  get_user_from_session,
  register_user,
  login_user,
  logout_user,
} from "./auth.js";
import { parse_query_string } from "./runtime.js";
import { fs } from "./filesystem.js";

function find_route_match(app_routes, pathname) {
  for (const route_path in app_routes) {
    const route_definition = app_routes[route_path];
    const param_names = [];
    const regex_path =
      "^" +
      route_path.replace(/:(\w+)/g, (_, param_name) => {
        param_names.push(param_name);
        return "([^\\/]+)";
      }) +
      "\\/?$";

    const match = pathname.match(new RegExp(regex_path));

    if (match) {
      const params = {};
      param_names.forEach((name, index) => {
        params[name] = match[index + 1];
      });
      return { route_definition, params };
    }
  }
  return null;
}

export function create_request_handler(context) {
  return async function handle_request(req) {
    const { db, app_routes, outdir, is_prod } = context;
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/auth/")) return handle_auth_api(req, db);
    if (url.pathname.startsWith("/__actions__/"))
      return handle_server_actions(req, context);

    const asset_response = await handle_static_assets(
      req,
      url.pathname,
      outdir,
      is_prod,
    );
    if (asset_response) return asset_response;

    const route_match = find_route_match(app_routes, url.pathname);
    if (route_match) {
      const { route_definition, params: route_params } = route_match;
      const query_params = parse_query_string(url.search);
      const all_params = { ...route_params, ...query_params };
      if (req.headers.get("X-Webs-Navigate")) {
        return handle_data_request(req, route_definition, all_params, context);
      }
      return handle_page_request(req, route_definition, all_params, context);
    }

    return new Response("Not Found", { status: 404 });
  };
}

async function handle_data_request(req, route_definition, params, context) {
  const { db } = context;
  const session_id = req.headers
    .get("cookie")
    ?.match(/session_id=([^;]+)/)?.[1];
  const user = get_user_from_session(db, session_id);

  const component_vnode = h(route_definition.component, { user, params });
  const { componentState } = await render_to_string(component_vnode);

  const webs_state = {
    user,
    params,
    componentState,
    component_name: route_definition.component_name,
    title: route_definition.component.name || "Webs App",
  };

  return new Response(serialize_state(webs_state), {
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
}

function handle_page_request(req, route_definition, params, context) {
  return new Promise(async (resolve) => {
    const { db, manifest } = context;
    const url = new URL(req.url);
    const session_id = req.headers
      .get("cookie")
      ?.match(/session_id=([^;]+)/)?.[1];
    const user = get_user_from_session(db, session_id);

    const from_route = { path: req.headers.get("referer") || null };
    const to_route = {
      path: url.pathname,
      params,
      component: route_definition.component,
      user: user,
    };

    const middleware = route_definition.middleware || [];
    let index = -1;

    const next = async (path) => {
      if (path) {
        return resolve(
          new Response(null, {
            status: 302,
            headers: { Location: path },
          }),
        );
      }

      index++;
      if (index < middleware.length) {
        middleware[index](to_route, from_route, next);
      } else {
        if (!route_definition.component) {
          console.error(
            `[Server Error] No component defined for route. Check src/api.js.`,
          );
          return resolve(
            new Response("Server Configuration Error", { status: 500 }),
          );
        }

        const component_vnode = h(route_definition.component, { user, params });
        const { html: app_html, componentState } =
          await render_to_string(component_vnode);

        const webs_state = {
          user,
          params,
          componentState,
          component_name: route_definition.component_name,
        };

        const full_html = render_html_shell({
          app_html,
          webs_state,
          manifest,
          title: route_definition.component.name || "Webs App",
        });
        resolve(
          new Response(full_html, {
            headers: { "Content-Type": "text/html;charset=utf-8" },
          }),
        );
      }
    };

    next();
  });
}

async function handle_static_assets(req, pathname, outdir, is_prod) {
  const asset_path = join(outdir, basename(pathname));
  const file = Bun.file(asset_path);
  if (await file.exists()) {
    const headers = { "Content-Type": file.type };
    if (!is_prod) {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }

    if (is_prod && req.headers.get("accept-encoding")?.includes("gzip")) {
      const gzipped_path = `${asset_path}.gz`;
      if (await Bun.file(gzipped_path).exists()) {
        headers["Content-Encoding"] = "gzip";
        return new Response(Bun.file(gzipped_path), { headers });
      }
    }
    return new Response(file, { headers });
  }
  return null;
}
async function handle_auth_api(req, db) {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/auth/register") return register_user(req, db);
  if (pathname === "/api/auth/login") return login_user(req, db);
  if (pathname === "/api/auth/logout") return logout_user(req, db);
  return new Response("Auth route not found", { status: 404 });
}
async function handle_server_actions(req, context) {
  const { db, app_routes } = context;
  const { pathname } = new URL(req.url);
  const session_id = req.headers
    .get("cookie")
    ?.match(/session_id=([^;]+)/)?.[1];
  const user = get_user_from_session(db, session_id);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const [, , componentName, actionName] = pathname.split("/");

  const route_def = Object.values(app_routes).find(
    (r) => r.component.name === componentName,
  );

  const action = route_def?.component?.actions?.[actionName];
  if (typeof action !== "function") {
    return new Response("Action not found", { status: 404 });
  }
  try {
    const args = req.method === "POST" ? await req.json() : [];
    const result = await action({ req, db, fs, user }, ...args);
    return result instanceof Response ? result : Response.json(result);
  } catch (e) {
    console.error(`Action Error: ${e.message}`);
    return new Response("Internal Server Error", { status: 500 });
  }
}
function render_html_shell({ app_html, webs_state, manifest, title }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${manifest.css
      ? `<link rel="stylesheet" href="/${basename(manifest.css)}">`
      : ""
    }
</head>
<body>
    <div id="root" style="display: contents">${app_html}</div>
    <script>window.__WEBS_STATE__ = ${serialize_state(webs_state)};</script>
    <script type="module" src="/${basename(manifest.js)}"></script>
</body>
</html>`;
}

function serialize_state(state) {
  return JSON.stringify(state, (_, value) => {
    if (value instanceof Set) return { __type: "Set", values: [...value] };
    if (value instanceof Map)
      return { __type: "Map", entries: [...value.entries()] };
    return value;
  });
}
