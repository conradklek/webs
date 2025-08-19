#!/usr/bin/env bun
/**
 * @fileoverview The command-line interface for the framework. Handles building
 * for production, running the development server with HMR, and starting the server.
 */

import { rm, mkdir, exists, watch } from "fs/promises";
import { resolve, join } from "path";
import tailwind from "bun-plugin-tailwind";
import { Database } from "bun:sqlite";
import { Glob } from "bun";
import { create_request_handler } from "../src/server.js";
import * as framework from "../src/index.js";

const CWD = process.cwd();
const OUTDIR = resolve(CWD, "dist");
const TMPDIR = resolve(CWD, ".tmp");
const TMP_CSS = resolve(TMPDIR, "tmp.css");
const TMP_APP_JS = resolve(TMPDIR, "app.js");
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production";
const HMR_WS_PATH = "/hmr-ws";

async function main() {
  await ensureTmpDir();

  const { routes: initial_routes, client_entry_code } =
    await load_and_generate_routes(CWD);
  await Bun.write(TMP_APP_JS, client_entry_code);

  const server_context = {
    db: await framework.create_database(Database, CWD),
    app_routes: initial_routes,
    outdir: OUTDIR,
    manifest: {},
    is_prod: IS_PROD,
    hmr_ws_path: HMR_WS_PATH,
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
  }

  let request_handler = create_request_handler(server_context);

  const server = Bun.serve({
    port: PORT,
    development: !IS_PROD,
    /**
     * This is the main fetch handler. It now correctly handles the WebSocket
     * upgrade handshake before passing regular requests to our main handler.
     */
    fetch: (req, server) => {
      const url = new URL(req.url);
      if (!IS_PROD && url.pathname === HMR_WS_PATH) {
        if (server.upgrade(req)) {
          return;
        }
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return request_handler(req);
    },
    websocket: IS_PROD ? undefined : hmr_websocket_handler,
    error: (error) => {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

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
        request_handler = create_request_handler(server_context);
        console.log("[HMR] Server context updated.");
      },
    });
  }

  console.log(`--- Server ready at http://localhost:${PORT} ---`);
}

main().catch(console.error);

async function build_assets(outdir, entrypoint) {
  console.log("Building client assets...");
  await clean_directory(outdir);

  const { themes, styles } = await collectComponentStyles();
  const global_css = await get_global_css();
  const full_css = `@import "tailwindcss";\n${global_css}\n${themes}\n${styles}\n`;
  await Bun.write(TMP_CSS, full_css);

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

async function collectComponentStyles() {
  const glob = new Glob("**/*.js");
  let theme_chunks = [];
  let style_chunks = [];
  const src_dir = resolve(CWD, "src");
  if (!(await exists(src_dir))) return { themes: "", styles: "" };
  const theme_regex = /@theme\s*\{[\s\S]*?\}/g;
  const styles_regex =
    /styles\s*:\s*`([\s\S]*?)`|export\s+const\s+styles\s*=\s*`([\s\S]*?)`/;
  for await (const file of glob.scan(src_dir)) {
    const file_path = join(src_dir, file);
    const src = await Bun.file(file_path).text();
    const match = src.match(styles_regex);
    let css = match ? match[1] || match[2] : "";
    if (css) {
      const themes = css.match(theme_regex);
      if (themes) theme_chunks.push(...themes);
      const styles_only = css.replace(theme_regex, "").trim();
      if (styles_only) style_chunks.push(styles_only);
    }
  }
  return { themes: theme_chunks.join("\n"), styles: style_chunks.join("\n") };
}
async function get_global_css() {
  const global_css_path = resolve(CWD, "src/app.css");
  if (await exists(global_css_path)) {
    return Bun.file(global_css_path).text();
  }
  return "";
}
async function compress_assets(outputs) {
  if (!IS_PROD) return {};
  console.log("Compressing assets...");
  const sizes = {};
  await Promise.all(
    outputs.map(async (output) => {
      if (/\.(js|css|html)$/.test(output.path)) {
        const content = await Bun.file(output.path).arrayBuffer();
        const compressed = Bun.gzipSync(Buffer.from(content));
        await Bun.write(`${output.path}.gz`, compressed);
        sizes[output.path] = compressed.byteLength;
      }
    }),
  );
  return sizes;
}
async function load_and_generate_routes(cwd) {
  console.log("Loading routes and generating client entrypoint...");
  const server_routes = {};
  const app_dir = resolve(cwd, "src/app");
  if (!(await exists(app_dir))) {
    console.warn(`[Warning] Route directory not found at ${app_dir}.`);
    return { routes: {}, client_entry_code: "" };
  }
  const glob = new Glob("*.js");
  let client_route_entries = [];
  for await (const file of glob.scan(app_dir)) {
    const component_path = `${join(app_dir, file)}?t=${Date.now()}`;
    try {
      const module = await import(component_path);
      const component = module.default;
      if (component && component.name) {
        const route_name = file === "index.js" ? "" : file.replace(".js", "");
        const route_path = `/${route_name}`;
        server_routes[route_path] = {
          component,
          middleware: module.middleware || [],
        };
        client_route_entries.push(
          `"${route_path}": () => import("../src/app/${file}")`,
        );
      }
    } catch (e) {
      console.error(`Failed to load component ${file}:`, e);
    }
  }
  const client_entry_code = `import { create_router } from "@conradklek/webs";
const routes = { \n  ${client_route_entries.join(",\n  ")} \n};
create_router(routes);`;
  return { routes: server_routes, client_entry_code };
}
const HMR_TOPIC = "reload";
const hmr_websocket_handler = {
  open(ws) {
    ws.subscribe(HMR_TOPIC);
    console.log("[HMR] WebSocket client connected");
  },
  close(ws) {
    ws.unsubscribe(HMR_TOPIC);
    console.log("[HMR] WebSocket client disconnected");
  },
  message(ws, message) {},
};
function setup_hmr_watcher({ cwd, outdir, server, on_rebuild, entrypoint }) {
  const srcDir = resolve(cwd, "src");
  console.log(`[HMR] Watching for changes in ${srcDir}`);
  let is_rebuilding = false;
  watch(srcDir, { recursive: true }, async (event, filename) => {
    if (
      !filename ||
      filename.includes(".tmp") ||
      filename.endsWith("~") ||
      is_rebuilding
    )
      return;
    is_rebuilding = true;
    console.log(`[HMR] Detected ${event} in ${filename}. Rebuilding...`);
    const { routes, client_entry_code } = await load_and_generate_routes(cwd);
    await Bun.write(entrypoint, client_entry_code);
    const new_build_result = await build_assets(outdir, entrypoint);
    if (new_build_result) {
      const manifest = {
        js: new_build_result.outputs.find((o) => o.path.endsWith(".js"))?.path,
        css: new_build_result.outputs.find((o) => o.path.endsWith(".css"))
          ?.path,
      };
      await on_rebuild({ manifest, routes });
      server.publish(HMR_TOPIC, "reload");
    }
    setTimeout(() => {
      is_rebuilding = false;
    }, 100);
  });
}
async function clean_directory(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}
async function ensureTmpDir() {
  await mkdir(TMPDIR, { recursive: true });
}
