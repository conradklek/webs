#!/usr/bin/env bun

import { rm, mkdir, exists } from "fs/promises";
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

async function main() {
  await ensureTmpDir();

  const { client_entry_code } = await generate_client_entry();

  await Bun.write(TMP_APP_JS, client_entry_code);

  const api_path = resolve(CWD, "src/api.js");
  let app_routes = {};
  if (await exists(api_path)) {
    const api_module = await import(`${api_path}?t=${Date.now()}`);
    app_routes = api_module.routes || {};
  } else {
    console.warn(
      "[Warning] src/api.js not found. No routes will be available.",
    );
  }

  const server_context = {
    db: await framework.create_database(Database, CWD),
    app_routes: app_routes,
    outdir: OUTDIR,
    manifest: {},
    is_prod: IS_PROD,
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
    development: false,
    fetch: (req) => request_handler(req),
    error: (error) => {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  if (!IS_PROD) {
    console.log("--- Running in dev :", server.port);
  }

  console.log(`--- Server ready at http://localhost:${PORT} ---`);
}

main().catch(console.error);

async function generate_client_entry() {
  const app_dir = resolve(CWD, "src/app");
  const glob = new Glob("*.js");
  const component_map_entries = [];

  if (await exists(app_dir)) {
    for await (const file of glob.scan(app_dir)) {
      const component_name = file.replace(".js", "");
      component_map_entries.push(
        `['${component_name}', () => import('../src/app/${file}')]`,
      );
    }
  }

  const client_entry_code = `import { hydrate } from "@conradklek/webs/runtime";
const components = new Map([
  ${component_map_entries.join(",\n  ")}
]);
hydrate(components);`;

  return { client_entry_code };
}

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
  const all_styles_regex = /styles\s*:\s*`([\s\S]*?)`/g;

  for await (const file of glob.scan(src_dir)) {
    const file_path = join(src_dir, file);
    const src = await Bun.file(file_path).text();
    let match;

    while ((match = all_styles_regex.exec(src)) !== null) {
      let css = match[1];
      if (css) {
        const themes = css.match(theme_regex);
        if (themes) {
          theme_chunks.push(...themes);
        }
        const styles_only = css.replace(theme_regex, "").trim();
        if (styles_only) {
          style_chunks.push(styles_only);
        }
      }
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

async function clean_directory(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

async function ensureTmpDir() {
  await mkdir(TMPDIR, { recursive: true });
}
