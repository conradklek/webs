#!/usr/bin/env bun

import { rm, mkdir, exists } from "fs/promises";
import { resolve, join, basename } from "path";
import tailwind from "bun-plugin-tailwind";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import * as Webs from "../src";
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

  const routeEntries = [];
  const componentImports = [];
  const middlewareImports = new Map();

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

        const middlewareNames = [];
        if (module.middleware) {
          const fileContent = readFileSync(join(app_dir, file), "utf-8");
          for (const mw of module.middleware) {
            const mwName = mw.name;
            middlewareNames.push(mwName);
            if (!middlewareImports.has(mwName)) {
              const importMatch = fileContent.match(
                new RegExp(
                  `import\\s+\\{\\s*${mwName}\\s*\\}\\s+from\\s+['"](.*?)['"]`,
                ),
              );
              if (importMatch && importMatch[1]) {
                const relativePath = importMatch[1].replace("../", "../src/");
                middlewareImports.set(
                  mwName,
                  `import { ${mwName} } from "${relativePath}";`,
                );
              }
            }
          }
        }

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

  client_entry_code += Array.from(middlewareImports.values()).join("\n") + "\n";

  client_entry_code += componentImports.join("\n") + "\n";
  client_entry_code += `\nconst routes = { ${routeEntries.join(",\n  ")} };\n`;
  client_entry_code += `\ncreate_router(routes);\n`;

  console.log("Client entrypoint generated.");
  return { routes, client_entry_code };
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
      const user = Webs.get_user_from_session(db, session_id);
      const params = Webs.parse_query_string(search);
      const component_vnode = Webs.h(component_to_render, { user, params });

      const { html: app_html, componentState } =
        await Webs.render_to_string(component_vnode);

      const webs_state = {
        user,
        params,
        componentState
      };

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
