#!/usr/bin/env bun

import {
  get_user_from_session,
  register_user,
  login_user,
  logout_user,
} from "../src/auth.js";
import { create_database } from "../src/database.js";
import * as fs from "../src/filesystem.js";
import { Database } from "bun:sqlite";
import tailwind from "bun-plugin-tailwind";
import { resolve, join, basename } from "path";
import { parse_query_string } from "../src/runtime.js";
import { watch } from "fs";
import { Glob } from "bun";
import { readFileSync } from "fs";
import { rm, mkdir, exists } from "fs/promises";

const CWD = process.cwd();
const OUTDIR = resolve(CWD, "dist");
const TMPDIR = resolve(CWD, ".tmp");
const TMP_CSS = resolve(TMPDIR, "tmp.css");
const TMP_APP_JS = resolve(TMPDIR, "app.js");
const PORT = process.env.PORT || 3000;
const HMR_WS_PATH = "/hmr-ws";
const HMR_TOPIC = "reload";

/**
 * Cleans the specified directory by removing it and recreating it.
 * This prevents the accumulation of old, hashed build artifacts.
 * @param {string} dirPath - The absolute path to the directory to clean.
 */
async function clean_directory(dirPath) {
  try {
    console.log(`Cleaning directory: ${dirPath}`);
    await rm(dirPath, { recursive: true, force: true });
    await mkdir(dirPath, { recursive: true });
    console.log("Directory cleaned successfully.");
  } catch (error) {
    console.error(`Error cleaning directory ${dirPath}:`, error);
    process.exit(1);
  }
}

/**
 * Extracts the styles block from a component file.
 */
function extractStyles(src) {
  const regex =
    /styles\s*:\s*`([\s\S]*?)`|export\s+const\s+styles\s*=\s*`([\s\S]*?)`/;
  const match = src.match(regex);
  return match ? match[1] || match[2] : "";
}

/**
 * Collects all `styles` from component files into a single CSS string.
 */
async function collectComponentStyles() {
  const glob = new Glob("*.js");
  let cssChunks = [];

  const appDir = resolve(CWD, "src/app");
  if (!(await exists(appDir))) return "";

  for await (const file of glob.scan(appDir)) {
    const filePath = join(appDir, file);
    const src = readFileSync(filePath, "utf8");
    const css = extractStyles(src);
    if (css) cssChunks.push(css);
  }

  return cssChunks.join("\n");
}

/**
 * Ensures the temp directory exists safely.
 */
async function ensureTmpDir() {
  try {
    await mkdir(TMPDIR, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

/**
 * Scans the `src/app` directory to load server-side routes
 * and generate the source code for the client-side entrypoint.
 * It looks for a default export (the component) and named exports
 * like `middleware`.
 * @param {string} cwd - The current working directory.
 * @returns {Promise<{routes: object, client_entry_code: string}>}
 */
export async function load_and_generate_routes(cwd) {
  console.log("Loading application routes and generating client entrypoint...");
  const routes = {};
  const app_dir = resolve(cwd, "src/app");
  const glob = new Glob("*.js");

  if (!(await exists(app_dir))) {
    console.warn(
      `[Warning] Route directory not found at ${app_dir}. No routes loaded.`,
    );
    return { routes: {}, client_entry_code: "" };
  }

  let client_entry_code = `import { create_router } from "@conradklek/webs";\n`;
  client_entry_code += `import { use_logger } from "../src/use/logger.js";\n`;
  client_entry_code += `import { use_auth } from "../src/use/auth.js";\n`;

  const routeEntries = [];
  const componentImports = [];

  for await (const file of glob.scan(app_dir)) {
    const component_path = `${join(app_dir, file)}?t=${Date.now()}`;
    try {
      const module = await import(component_path);
      const component = module.default;

      if (component && component.name) {
        const route_name = file === "index.js" ? "" : file.replace(".js", "");
        const route_path = `/${route_name}`;

        const route_definition = {
          component: component,
          middleware: module.middleware || [],
        };
        routes[route_path] = route_definition;
        console.log(`  - Mapped ${file} to route ${route_path}`);

        const componentName = component.name.replace(/[^a-zA-Z0-9_$]/g, "_");
        componentImports.push(
          `import ${componentName} from "../src/app/${file}";`,
        );

        const middlewareNames = (module.middleware || [])
          .map((mw) => mw.name)
          .filter(Boolean);
        let routeObjectStr = `{ component: ${componentName}`;
        if (middlewareNames.length > 0) {
          routeObjectStr += `, middleware: [${middlewareNames.join(", ")}]`;
        }
        routeObjectStr += ` }`;
        routeEntries.push(`"${route_path}": ${routeObjectStr}`);
      }
    } catch (e) {
      console.error(`Failed to load component ${file}:`, e);
    }
  }

  client_entry_code += componentImports.join("\n") + "\n";
  client_entry_code += `\nconst routes = { ${routeEntries.join(",\n  ")} };\n`;
  client_entry_code += `\ncreate_router(routes);\n`;

  console.log("Client entrypoint generated.");
  return { routes, client_entry_code };
}

/**
 * Builds the client-side assets using Bun.build.
 * @param {string} outdir - The output directory for the build artifacts.
 * @param {string} entrypoint - The path to the entrypoint file.
 * @returns {Promise<BuildOutput | null>}
 */
async function build_assets(outdir, entrypoint) {
  console.log("Building client assets...");

  await clean_directory(outdir);

  if (!(await exists(entrypoint))) {
    console.error(
      `[Error] Entrypoint not found at ${entrypoint}. Cannot build.`,
    );
    return null;
  }

  await ensureTmpDir();
  const cssContent = await collectComponentStyles();
  const fullCSS = `@import "tailwindcss";\n${cssContent}`;
  await Bun.write(TMP_CSS, fullCSS);

  const build_result = await Bun.build({
    entrypoints: [entrypoint, TMP_CSS],
    outdir: outdir,
    target: "browser",
    splitting: true,
    minify: true,
    naming: "[name]-[hash].[ext]",
    plugins: [tailwind],
  });

  if (!build_result.success) {
    console.error("Client build failed:", build_result.logs);
    return null;
  }

  console.log("Client assets built successfully.");
  return build_result;
}

/**
 * Compresses build artifacts using Gzip.
 * @param {Array<BuildArtifact>} outputs - The build outputs from Bun.build.
 * @returns {Promise<object>} A map of original paths to gzipped sizes.
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
 * Sets up the initial build and watches for file changes for HMR.
 * @param {object} options - Configuration options.
 * @returns {Promise<object>} The initial asset manifest.
 */
export async function setup_build_and_hmr({
  cwd,
  outdir,
  server,
  on_rebuild,
  entrypoint,
}) {
  let build_result = await build_assets(outdir, entrypoint);
  if (!build_result) process.exit(1);

  const asset_sizes = await compress_assets(build_result.outputs);
  let manifest = {
    js: build_result.outputs.find((o) => o.path.endsWith(".js"))?.path,
    css: build_result.outputs.find((o) => o.path.endsWith(".css"))?.path,
    sizes: asset_sizes,
  };

  const srcDir = resolve(cwd, "src");
  console.log(`[HMR] Watching for changes in ${srcDir}`);

  let isRebuilding = false;
  watch(srcDir, { recursive: true }, async (event, filename) => {
    if (
      !filename ||
      filename.includes(".tmp") ||
      filename.endsWith("~") ||
      isRebuilding
    ) {
      return;
    }

    isRebuilding = true;
    console.log(`[HMR] Detected ${event} in ${filename}. Rebuilding...`);

    const { routes: new_routes, client_entry_code: new_client_code } =
      await load_and_generate_routes(cwd);
    await Bun.write(entrypoint, new_client_code);

    const new_build_result = await build_assets(outdir, entrypoint);
    if (new_build_result) {
      const new_asset_sizes = await compress_assets(new_build_result.outputs);
      manifest.js = new_build_result.outputs.find((o) =>
        o.path.endsWith(".js"),
      )?.path;
      manifest.css = new_build_result.outputs.find((o) =>
        o.path.endsWith(".css"),
      )?.path;
      manifest.sizes = new_asset_sizes;
      await on_rebuild({ manifest, routes: new_routes });
      server.publish(HMR_TOPIC, "reload");
    }

    setTimeout(() => {
      isRebuilding = false;
    }, 100);
  });
  return manifest;
}

/**
 * Creates the main request handler for the server.
 * @param {object} context - The server context.
 * @returns {function} The request handler function.
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
      server,
    } = context;
    const url = new URL(req.url);
    const { pathname, search } = url;

    if (pathname === HMR_WS_PATH) {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

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
    if (asset_response) return asset_response;

    if (!is_ready) {
      return new Response("Server is starting, please wait...", {
        status: 503,
        headers: { Refresh: "1" },
      });
    }
    const route_definition = app_routes[pathname];
    if (route_definition) {
      const component_to_render = route_definition.component;
      const session_id = req.headers
        .get("cookie")
        ?.match(/session_id=([^;]+)/)?.[1];
      const user = get_user_from_session(db, session_id);
      const params = parse_query_string(search);
      const app_html = "";
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
      const hmrSocket = new WebSocket(\`ws://\${location.host}${HMR_WS_PATH}\`);
      hmrSocket.addEventListener('message', (event) => {
        if (event.data === 'reload') {
          console.log('[HMR] Reloading page...');
          location.reload();
        }
      });
      hmrSocket.addEventListener('open', () => console.log('[HMR] Connected.'));
      hmrSocket.addEventListener('close', () => {
        console.log('[HMR] Disconnected. Attempting to reconnect...');
        const interval = setInterval(() => {
            const ws = new WebSocket(\`ws://\${location.host}${HMR_WS_PATH}\`);
            ws.onopen = () => {
                clearInterval(interval);
                location.reload();
            };
        }, 1000);
      });
    </script>
  </body>
</html>`;
      return new Response(full_html, {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  };
}

async function handle_auth_api(req, db) {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/auth/register") return register_user(req, db);
  if (pathname === "/api/auth/login") return login_user(req, db);
  if (pathname === "/api/auth/logout") return logout_user(req, db);
  return new Response("Auth route not found", { status: 404 });
}

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
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [, , componentName, actionName] = pathname.split("/");
  const route_definition = Object.values(app_routes).find(
    (r) => r.component.name === componentName,
  );
  if (
    !route_definition ||
    typeof route_definition.component.actions?.[actionName] !== "function"
  ) {
    return new Response("Action not found", { status: 404 });
  }
  try {
    const action = route_definition.component.actions[actionName];
    const args = req.method === "POST" ? await req.json() : [];
    const result = await action({ req, db, fs, user }, ...args);
    if (result instanceof Response) return result;
    return Response.json(result);
  } catch (e) {
    console.error(`Action Error: ${e.message}`);
    return new Response("Internal Server Error", { status: 500 });
  }
}

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
 * Main function to start the development server.
 */
async function main() {
  await ensureTmpDir();

  const { routes: initial_routes, client_entry_code } =
    await load_and_generate_routes(CWD);
  await Bun.write(TMP_APP_JS, client_entry_code);

  const server_context = {
    fs,
    db: await create_database(Database, CWD),
    app_routes: initial_routes,
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
    websocket: {
      open(ws) {
        console.log("[HMR] WebSocket client connected");
        ws.subscribe(HMR_TOPIC);
      },
      close(ws) {
        console.log("[HMR] WebSocket client disconnected");
        ws.unsubscribe(HMR_TOPIC);
      },
      // message(ws, message) { },
    },
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
    entrypoint: TMP_APP_JS,
    on_rebuild: async ({ manifest: new_manifest, routes: new_routes }) => {
      server_context.manifest = new_manifest;
      server_context.app_routes = new_routes;
    },
  });

  server_context.manifest = initial_manifest;
  server_context.is_ready = true;
  console.log(`--- Server ready at http://localhost:${PORT} ---`);
}

main().catch(console.error);
