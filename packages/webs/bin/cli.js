#!/usr/bin/env bun

import {
  get_user_from_session,
  register_user,
  login_user,
  logout_user,
} from "@conradklek/webs/auth.js";
import { create_database } from "@conradklek/webs/database.js";
import * as fs from "@conradklek/webs/filesystem.js";
import { render_to_string } from "@conradklek/webs/runtime-ssr.js";
import { parse_query_string } from "@conradklek/webs/runtime-dom.js";

import { Database } from "bun:sqlite";
import tailwind from "bun-plugin-tailwind";
import { resolve, join, basename } from "path";
import { watch } from "fs";
import { Glob } from "bun";

const CWD = process.cwd();
const OUTDIR = resolve(CWD, "dist");
const PORT = process.env.PORT || 3000;

/**
 * Loads all component files from the `src/app` directory and maps them to routes.
 * @param {string} cwd - The current working directory.
 * @returns {Promise<object>} An object mapping route paths to component definitions.
 */
export async function load_app_routes(cwd) {
  console.log("Loading application routes...");
  const routes = {};
  const app_dir = resolve(cwd, "src/app");
  const glob = new Glob("*.js");

  if (!(await fs.exists(app_dir))) {
    console.warn(
      `[Warning] Route directory not found at ${app_dir}. No routes loaded.`,
    );
    return routes;
  }

  for await (const file of glob.scan(app_dir)) {
    const component_path = `${join(app_dir, file)}?t=${Date.now()}`;
    try {
      const module = await import(component_path);
      const component = module.default;
      if (component && component.name) {
        const route_name = file === "index.js" ? "" : file.replace(".js", "");
        const route_path = `/${route_name}`;
        routes[route_path] = component;
        console.log(`  - Mapped ${file} to route ${route_path}`);
      }
    } catch (e) {
      console.error(`Failed to load component ${file}:`, e);
    }
  }
  return routes;
}

/**
 * Builds the client-side assets using Bun's build API.
 * @param {string} cwd - The current working directory.
 * @param {string} outdir - The output directory for the build artifacts.
 * @returns {Promise<object|null>} The build result object from Bun, or null on failure.
 */
async function build_assets(cwd, outdir) {
  console.log("Building client assets...");
  const entrypoint = resolve(cwd, "src/app.js");
  if (!(await fs.exists(entrypoint))) {
    console.error(
      `[Error] Entrypoint not found at ${entrypoint}. Cannot build.`,
    );
    return null;
  }
  const build_result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: outdir,
    target: "browser",
    splitting: true,
    minify: true,
    naming: "[name]-[hash].[ext]",
    plugins: [tailwind()],
  });
  if (!build_result.success) {
    console.error("Client build failed:", build_result.logs);
    return null;
  }
  console.log("Client assets built successfully.");
  return build_result;
}

/**
 * Compresses build outputs using Gzip.
 * @param {Array<object>} outputs - An array of build output objects from Bun.
 * @returns {Promise<object>} An object mapping original asset paths to their Gzipped sizes.
 */
async function compress_assets(outputs) {
  console.log("Compressing assets with Gzip...");
  const sizes = {};
  await Promise.all(
    outputs.map(async (output) => {
      if (/\.(js|css|html)$/.test(output.path)) {
        try {
          const fileContent = await Bun.file(output.path).arrayBuffer();
          const compressedContent = Bun.gzipSync(Buffer.from(fileContent));
          const gzipped_path = `${output.path}.gz`;
          await Bun.write(gzipped_path, compressedContent);
          const gzipped_file = Bun.file(gzipped_path);
          sizes[output.path] = gzipped_file.size;
          console.log(
            `  - Compressed ${basename(output.path)} (${(
              gzipped_file.size / 1024
            ).toFixed(2)} KB)`,
          );
        } catch (e) {
          console.error(`Failed to compress ${output.path}:`, e);
        }
      }
    }),
  );
  console.log("Assets compressed successfully.");
  return sizes;
}

/**
 * Sets up the initial asset build and watches for file changes to trigger rebuilds (HMR).
 * @param {object} options - Configuration options.
 * @param {string} options.cwd - The current working directory.
 * @param {string} options.outdir - The output directory.
 * @param {object} options.server - The Bun server instance.
 * @param {Function} options.on_rebuild - Callback function to execute after a successful rebuild.
 * @returns {Promise<object>} The initial asset manifest.
 */
export async function setup_build_and_hmr({ cwd, outdir, server, on_rebuild }) {
  let build_result = await build_assets(cwd, outdir);
  if (!build_result) process.exit(1);
  const asset_sizes = await compress_assets(build_result.outputs);
  let manifest = {
    js: build_result.outputs.find((o) => o.path.endsWith(".js"))?.path,
    css: build_result.outputs.find((o) => o.path.endsWith(".css"))?.path,
    sizes: asset_sizes,
  };
  const srcDir = resolve(cwd, "src");
  console.log(`[HMR] Watching for changes in ${srcDir}`);
  watch(srcDir, { recursive: true }, async (event, filename) => {
    if (filename) {
      console.log(`[HMR] Detected ${event} in ${filename}. Rebuilding...`);
      const new_build_result = await build_assets(cwd, outdir);
      if (new_build_result) {
        const new_asset_sizes = await compress_assets(new_build_result.outputs);
        manifest.js = new_build_result.outputs.find((o) =>
          o.path.endsWith(".js"),
        )?.path;
        manifest.css = new_build_result.outputs.find((o) =>
          o.path.endsWith(".css"),
        )?.path;
        manifest.sizes = new_asset_sizes;
        await on_rebuild(manifest);
        server.publish("reload", "refresh");
        console.log("[HMR] Reload signal sent to clients.");
      } else {
        console.error("[HMR] Build failed. No reload signal sent.");
      }
    }
  });
  return manifest;
}

/**
 * Creates the main request handler function for the server.
 * @param {object} context - The server context object containing db, routes, etc.
 * @returns {Function} An async function that handles incoming requests.
 */
export function create_request_handler(context) {
  return async function(req) {
    const {
      db,
      fs,
      get_user_from_session,
      app_routes,
      manifest,
      outdir,
      is_ready,
    } = context;
    const url = new URL(req.url);
    const { pathname, search } = url;
    if (pathname.startsWith("/api/auth/")) {
      return handle_auth_api(req, db);
    }
    if (pathname.startsWith("/__actions__/")) {
      return handle_server_actions(
        req,
        db,
        fs,
        get_user_from_session,
        app_routes,
      );
    }
    const asset_response = await handle_static_assets(
      req,
      pathname,
      outdir,
      manifest,
    );
    if (asset_response) {
      return asset_response;
    }
    if (!is_ready) {
      return new Response("Server is starting, please wait...", {
        status: 503,
        headers: { Refresh: "1" },
      });
    }
    const component_to_render = app_routes[pathname];
    if (component_to_render) {
      const session_id = req.headers
        .get("cookie")
        ?.match(/session_id=([^;]+)/)?.[1];
      const user = get_user_from_session(db, session_id);
      const params = parse_query_string(search);
      const app_html = render_to_string(component_to_render, { user, params });
      const full_html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${component_to_render.name || "Webs App"}</title>
    ${manifest.css
          ? `<link rel="stylesheet" href="/${basename(manifest.css)}">`
          : ""
        }
  </head>
  <body>
    <div id="root" style="display: contents">${app_html}</div>
    <script>
        window.__INITIAL_USER__ = ${JSON.stringify(user)};
        window.__INITIAL_PARAMS__ = ${JSON.stringify(params)};
    </script>
    <script type="module" src="/${basename(manifest.js)}"></script>
    <script>
      // HMR client-side script
      new EventSource('/sse').addEventListener('reload', () => location.reload());
    </script>
  </body>
</html>`;
      return new Response(full_html, {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      });
    }
    if (pathname === "/sse") {
      const { readable } = new TransformStream();
      context.server.publish("reload", "refresh");
      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
    return new Response("Not Found", { status: 404 });
  };
}

/**
 * Handles authentication-related API requests.
 * @param {Request} req - The incoming request.
 * @param {object} db - The database instance.
 * @returns {Promise<Response>} A response for the auth action.
 */
async function handle_auth_api(req, db) {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/auth/register") return register_user(req, db);
  if (pathname === "/api/auth/login") return login_user(req, db);
  if (pathname === "/api/auth/logout") return logout_user(req, db);
  return new Response("Auth route not found", { status: 404 });
}

/**
 * Handles server action requests initiated from the client.
 * @param {Request} req - The incoming request.
 * @param {object} db - The database instance.
 * @param {object} fs - The filesystem utility object.
 * @param {Function} get_user_from_session - Function to retrieve the current user.
 * @param {object} app_routes - The application's routes.
 * @returns {Promise<Response>} The result of the server action.
 */
async function handle_server_actions(
  req,
  db,
  fs,
  get_user_from_session,
  app_routes,
) {
  const { pathname } = new URL(req.url);
  const session_id = req.headers
    .get("cookie")
    ?.match(/session_id=([^;]+)/)?.[1];
  const user = get_user_from_session(db, session_id);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const [, , componentName, actionName] = pathname.split("/");
  const component = Object.values(app_routes).find(
    (r) => r.name === componentName,
  );
  if (!component || typeof component.actions?.[actionName] !== "function") {
    return new Response("Action not found", { status: 404 });
  }
  try {
    const action = component.actions[actionName];
    const args = req.method === "POST" ? await req.json() : [];
    const result = await action({ req, db, fs, user }, ...args);
    if (result instanceof Response) return result;
    return Response.json(result);
  } catch (e) {
    console.error(`Action Error: ${e.message}`);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * Serves static assets from the output directory. Handles Gzip compression.
 * @param {Request} req - The incoming request.
 * @param {string} pathname - The path of the requested asset.
 * @param {string} outdir - The output directory.
 * @param {object} manifest - The asset manifest.
 * @returns {Promise<Response|null>} A response with the asset, or null if not found.
 */
async function handle_static_assets(req, pathname, outdir, manifest) {
  const asset_path = join(outdir, basename(pathname));
  const file = Bun.file(asset_path);
  if (await file.exists()) {
    const acceptsGzip = req.headers.get("accept-encoding")?.includes("gzip");
    const gzipped_path = `${asset_path}.gz`;
    if (acceptsGzip && (await Bun.file(gzipped_path).exists())) {
      const gzipped_size = manifest.sizes[asset_path];
      if (gzipped_size) {
        console.log(
          `GET ${pathname} - 200 OK (${(gzipped_size / 1024).toFixed(2)} KB)`,
        );
      }
      return new Response(Bun.file(gzipped_path), {
        headers: {
          "Content-Encoding": "gzip",
          "Content-Type": file.type,
          "Content-Length": gzipped_size.toString(),
        },
      });
    }
    console.log(
      `GET ${pathname} - 200 OK (${(file.size / 1024).toFixed(2)} KB)`,
    );
    return new Response(file, {
      headers: { "Content-Length": file.size.toString() },
    });
  }
  return null;
}

/**
 * The main entry point for the server.
 * Initializes services, sets up the server, and starts listening.
 */
async function main() {
  const server_context = {
    fs,
    db: await create_database(Database, CWD),
    app_routes: await load_app_routes(CWD),
    get_user_from_session: get_user_from_session,
    outdir: OUTDIR,
    manifest: {},
    is_ready: false,
    server: null,
  };

  const request_handler = create_request_handler(server_context);

  const server = Bun.serve({
    port: PORT,
    development: true,
    fetch: request_handler,
    error(error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  server_context.server = server;

  const initial_manifest = await setup_build_and_hmr({
    cwd: CWD,
    outdir: OUTDIR,
    server: server,
    on_rebuild: async (new_manifest) => {
      server_context.manifest = new_manifest;
      server_context.app_routes = await load_app_routes(CWD);
    },
  });

  server_context.manifest = initial_manifest;
  server_context.is_ready = true;
  console.log(
    `--- Server is ready and listening on http://localhost:${PORT} ---`,
  );
}

main();

