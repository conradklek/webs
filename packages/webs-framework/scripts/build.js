import { rm, mkdir, exists } from "fs/promises";
import tailwind from "bun-plugin-tailwind";
import { config } from "../src/config.js";
import { join } from "path";

async function ensureTmpDir() {
  await mkdir(config.TMPDIR, { recursive: true });
}

async function cleanDirectory(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

async function generateClientEntry() {
  const glob = new Bun.Glob("**/*.js");
  const componentMapEntries = [];
  if (await exists(config.APP_DIR)) {
    for await (const file of glob.scan(config.APP_DIR)) {
      const componentName = file.replace(".js", "");
      componentMapEntries.push(
        `['${componentName}', () => import('../src/app/${file}')]`,
      );
    }
  }

  const clientEntryCode = `
import { hydrate } from "@conradklek/webs/runtime";

const components = new Map([
  ${componentMapEntries.join(",\n  ")}
]);

hydrate(components);
`;
  await Bun.write(config.TMP_APP_JS, clientEntryCode);
  return clientEntryCode;
}

async function prepareCss() {
  const glob = new Bun.Glob("**/*.js");
  let themeChunks = [];
  let styleChunks = [];

  if (!(await exists(config.SRC_DIR))) return "";

  const themeRegex = /@theme\s*\{[\s\S]*?\}/g;
  const allStylesRegex = /styles\s*:\s*`([\s\S]*?)`/g;

  for await (const file of glob.scan(config.SRC_DIR)) {
    const filePath = join(config.SRC_DIR, file);
    const src = await Bun.file(filePath).text();
    let match;

    while ((match = allStylesRegex.exec(src)) !== null) {
      let css = match[1];
      if (css) {
        const themes = css.match(themeRegex);
        if (themes) themeChunks.push(...themes);
        const stylesOnly = css.replace(themeRegex, "").trim();
        if (stylesOnly) styleChunks.push(stylesOnly);
      }
    }
  }

  const globalCss = (await exists(config.GLOBAL_CSS_PATH))
    ? await Bun.file(config.GLOBAL_CSS_PATH).text()
    : "";

  const fullCss = `@import "tailwindcss";\n${globalCss}\n${themeChunks.join(
    "\n",
  )}\n${styleChunks.join("\n")}\n`;
  await Bun.write(config.TMP_CSS, fullCss);
}

async function compressAssets(outputs) {
  if (!config.IS_PROD) return {};
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

export async function performBuild() {
  console.log("--- Performing client build ---");
  await ensureTmpDir();
  await cleanDirectory(config.OUTDIR);
  await generateClientEntry();
  await prepareCss();

  const buildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS, config.TMP_CSS],
    outdir: config.OUTDIR,
    target: "browser",
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? "[name]-[hash].[ext]" : "[name].[ext]",
    plugins: [tailwind],
    sourcemap: config.IS_PROD ? "none" : "inline",
  });

  if (!buildResult.success) {
    console.error("Client build failed:", buildResult.logs);
    return null;
  }

  console.log("Client assets built successfully.");

  const manifest = {
    js: buildResult.outputs.find((o) => o.path.endsWith(".js"))?.path,
    css: buildResult.outputs.find((o) => o.path.endsWith(".css"))?.path,
  };

  if (config.IS_PROD) {
    manifest.sizes = await compressAssets(buildResult.outputs);
  }

  return manifest;
}
