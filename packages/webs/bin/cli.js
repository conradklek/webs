#!/usr/bin/env bun

import { rm, mkdir, exists } from "fs/promises";
import { resolve, join, basename } from "path";
import tailwind from "bun-plugin-tailwind";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import * as Webs from "../src/server.js";
import { watch } from "fs";
import { Glob } from "bun";

const CWD = process.cwd();
const OUTDIR = resolve(CWD, "dist");
const TMPDIR = resolve(CWD, ".tmp");
const TMP_CSS = resolve(TMPDIR, "tmp.css");
const TMP_APP_JS = resolve(TMPDIR, "app.js");
const PORT = process.env.PORT || 3000;
const HMR_WS_PATH = "/hmr-ws";
const HMR_TOPIC = "reload";
const IS_PROD = process.env.NODE_ENV === "production";

export async function load_and_generate_routes(cwd) {
  console.log("Loading application routes and generating client entrypoint...");
  const server_routes = {};
  const app_dir = resolve(cwd, "src/app");
  const glob = new Glob("*.js");

  if (!(await exists(app_dir))) {
    console.warn(
      `[Warning] Route directory not found at ${app_dir}. No routes loaded.`,
    );
    return { routes: {}, client_entry_code: "" };
  }

  let client_entry_code = `import { create_router } from "@conradklek/webs";\n`;
  const client_route_entries = [];

  for await (const file of glob.scan(app_dir)) {
    const component_path = `${join(app_dir, file)}?t=${Date.now()}`;
    try {
      const module = await import(component_path);
      const component = module.default;

      if (component && component.name) {
        const route_name = file === "index.js" ? "" : file.replace(".js", "");
        const route_path = `/${route_name}`;

        server_routes[route_path] = {
          component: component,
          middleware: module.middleware || [],
        };
        console.log(`  - Mapped ${file} to route ${route_path}`);

        client_route_entries.push(
          `"${route_path}": () => import("../src/app/${file}")`,
        );
      }
    } catch (e) {
      console.error(`Failed to load component ${file}:`, e);
    }
  }

  client_entry_code += `\nconst routes = { \n  ${client_route_entries.join(
    ",\n  ",
  )} \n};\n`;
  client_entry_code += `\ncreate_router(routes);\n`;

  console.log("Client entrypoint generated successfully.");
  return { routes: server_routes, client_entry_code };
}

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

function extractStyles(src) {
  const regex =
    /styles\s*:\s*`([\s\S]*?)`|export\s+const\s+styles\s*=\s*`([\s\S]*?)`/;
  const match = src.match(regex);
  return match ? match[1] || match[2] : "";
}

async function collectComponentStyles() {
  const glob = new Glob("**/*.js");
  let themeChunks = [];
  let styleChunks = [];
  const srcDir = resolve(CWD, "src");
  if (!(await exists(srcDir))) return { themes: "", styles: "" };

  const themeRegex = /@theme\s*\{[\s\S]*?\}/g;

  for await (const file of glob.scan(srcDir)) {
    const filePath = join(srcDir, file);
    const src = readFileSync(filePath, "utf8");
    let css = extractStyles(src);
    if (css) {
      const themes = css.match(themeRegex);
      if (themes) {
        themeChunks.push(...themes);
      }
      const stylesOnly = css.replace(themeRegex, "").trim();
      if (stylesOnly) {
        styleChunks.push(stylesOnly);
      }
    }
  }
  return {
    themes: themeChunks.join("\n"),
    styles: styleChunks.join("\n"),
  };
}

async function ensureTmpDir() {
  try {
    await mkdir(TMPDIR, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

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

  const globalThemePath = resolve(CWD, "src/app.css");
  let globalThemeCss = "";
  if (await exists(globalThemePath)) {
    console.log("Found global theme file at src/app.css");
    globalThemeCss = await Bun.file(globalThemePath).text();
  }

  const { themes: componentThemes, styles: componentStyles } =
    await collectComponentStyles();

  const fullCSS = `@import "tailwindcss";
${globalThemeCss}
${componentThemes}
${componentStyles}
`;

  await Bun.write(TMP_CSS, fullCSS);

  const build_result = await Bun.build({
    entrypoints: [entrypoint, TMP_CSS],
    outdir: outdir,
    target: "browser",
    splitting: true,
    minify: IS_PROD,
    naming: IS_PROD ? "[name]-[hash].[ext]" : "[name].[ext]",
    plugins: [tailwind],
    sourcemap: IS_PROD ? "none" : "inline",
  });

  if (!build_result.success) {
    console.error("Client build failed:", build_result.logs);
    return null;
  }
  console.log("Client assets built successfully.");
  return build_result;
}

async function compress_assets(outputs) {
  if (!IS_PROD) return {};
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
 * Sets up a file watcher for Hot Module Replacement (HMR).
 * This function only handles watching and rebuilding; it does not
 * perform the initial build.
 * @param {object} options - Configuration for the watcher.
 */
export function setup_hmr_watcher({
  cwd,
  outdir,
  server,
  on_rebuild,
  entrypoint,
}) {
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
      const manifest = {
        js: new_build_result.outputs.find((o) => o.path.endsWith(".js"))?.path,
        css: new_build_result.outputs.find((o) => o.path.endsWith(".css"))
          ?.path,
      };
      await on_rebuild({ manifest, routes: new_routes });
      server.publish(HMR_TOPIC, "reload");
    }
    setTimeout(() => {
      isRebuilding = false;
    }, 100);
  });
}

export function create_request_handler(context) {
  return async function(req) {
    const {
      db,
      fs,
      get_user_from_session,
      app_routes,
      manifest,
      outdir,
      server,
    } = context;
    const url = new URL(req.url);
    const { pathname, search } = url;

    if (!IS_PROD && pathname === HMR_WS_PATH) {
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

    if (!context.is_ready) {
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
      const user = Webs.get_user_from_session(db, session_id);
      const params = Webs.parse_query_string(search);
      const component_vnode = Webs.h(component_to_render, { user, params });
      const { html: app_html, componentState } =
        await Webs.render_to_string(component_vnode);
      const webs_state = { user, params, componentState };

      const hmr_script = IS_PROD
        ? ""
        : `<script>
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
    </script>`;

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
      window.__WEBS_STATE__ = ${JSON.stringify(webs_state)};
    </script>
    <script type="module" src="/${basename(manifest.js)}"></script>
    ${hmr_script}
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
  if (pathname === "/api/auth/register") return Webs.register_user(req, db);
  if (pathname === "/api/auth/login") return Webs.login_user(req, db);
  if (pathname === "/api/auth/logout") return Webs.logout_user(req, db);
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
    if (IS_PROD && acceptsGzip) {
      const gzipped_path = `${asset_path}.gz`;
      if (await Bun.file(gzipped_path).exists()) {
        const gzipped_size = manifest.sizes[asset_path];
        if (gzipped_size) {
          console.log(
            `GET ${pathname} - 200 OK (${(gzipped_size / 1024).toFixed(
              2,
            )} KB) [Gzip]`,
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

async function main() {
  await ensureTmpDir();
  const { routes: initial_routes, client_entry_code } =
    await load_and_generate_routes(CWD);
  await Bun.write(TMP_APP_JS, client_entry_code);

  const server_context = {
    fs: Webs.fs,
    db: await Webs.create_database(Database, CWD),
    app_routes: initial_routes,
    get_user_from_session: Webs.get_user_from_session,
    outdir: OUTDIR,
    manifest: {},
    is_ready: false,
    server: null,
  };

  if (IS_PROD) {
    console.log("--- Running in production mode ---");
    const build_result = await build_assets(OUTDIR, TMP_APP_JS);
    if (!build_result) process.exit(1);
    const asset_sizes = await compress_assets(build_result.outputs);
    server_context.manifest = {
      js: build_result.outputs.find(
        (o) => o.kind === "entry-point" && o.path.endsWith(".js"),
      )?.path,
      css: build_result.outputs.find((o) => o.path.endsWith(".css"))?.path,
      sizes: asset_sizes,
    };
    server_context.is_ready = true;
  } else {
    console.log("--- Performing initial build for development ---");
    const initial_build_result = await build_assets(OUTDIR, TMP_APP_JS);
    if (!initial_build_result) process.exit(1);

    server_context.manifest = {
      js: initial_build_result.outputs.find((o) => o.path.endsWith(".js"))
        ?.path,
      css: initial_build_result.outputs.find((o) => o.path.endsWith(".css"))
        ?.path,
    };
    // FIX: Set is_ready to true only AFTER the initial build is complete.
    server_context.is_ready = true;
  }

  const request_handler = create_request_handler(server_context);

  // FIX: Moved server initialization down, so it only starts after the
  // initial build has populated the manifest.
  const server = Bun.serve({
    port: PORT,
    development: !IS_PROD,
    fetch: request_handler,
    websocket: IS_PROD
      ? undefined
      : {
        open(ws) {
          console.log("[HMR] WebSocket client connected");
          ws.subscribe(HMR_TOPIC);
        },
        close(ws) {
          console.log("[HMR] WebSocket client disconnected");
          ws.unsubscribe(HMR_TOPIC);
        },
      },
    error(error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  server_context.server = server;

  if (!IS_PROD) {
    console.log("--- Running in development mode with HMR ---");
    setup_hmr_watcher({
      cwd: CWD,
      outdir: OUTDIR,
      server: server,
      entrypoint: TMP_APP_JS,
      on_rebuild: async ({ manifest: new_manifest, routes: new_routes }) => {
        server_context.manifest = new_manifest;
        server_context.app_routes = new_routes;
      },
    });
  }

  console.log(`--- Server ready at http://localhost:${PORT} ---`);
}

main().catch(console.error);
