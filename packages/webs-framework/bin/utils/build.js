import { rm, mkdir, exists } from 'fs/promises';
import tailwind from 'bun-plugin-tailwind';
import { config } from './config';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function cleanDirectory(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await ensureDir(dirPath);
}

async function generateClientEntry() {
  const glob = new Bun.Glob('**/*.js');
  const componentMapEntries = [];
  if (await exists(config.APP_DIR)) {
    for await (const file of glob.scan(config.APP_DIR)) {
      const componentName = file.replace('.js', '');
      componentMapEntries.push(
        `['${componentName}', () => import('${join(config.APP_DIR, file)}')]`,
      );
    }
  }

  const hasDbConfig = await exists(config.CLIENT_DB_CONFIG_PATH);
  const dbConfigImport = hasDbConfig
    ? `import dbConfig from '${config.CLIENT_DB_CONFIG_PATH}';`
    : 'const dbConfig = null;';

  const clientEntryCode = `
import { hydrate } from "@conradklek/webs";
${dbConfigImport}

const components = new Map([
  ${componentMapEntries.join(',\n  ')}
]);

hydrate(components, dbConfig);
`;
  await Bun.write(config.TMP_APP_JS, clientEntryCode);
}

async function prepareCss() {
  const glob = new Bun.Glob('**/*.js');
  let themeChunks = [];
  let styleChunks = [];

  if (!(await exists(config.SRC_DIR))) return '';

  const themeRegex = /@theme\s*\{[\s\S]*?\}/g;
  const allStylesRegex =
    /(?:styles\s*:\s*|export\s+const\s+styles\s*=\s*)\`([\s\S]*?)\`/g;

  for await (const file of glob.scan(config.SRC_DIR)) {
    const filePath = join(config.SRC_DIR, file);
    const src = await Bun.file(filePath).text();
    let match;

    while ((match = allStylesRegex.exec(src)) !== null) {
      let css = match[1];
      if (css) {
        const themes = css.match(themeRegex);
        if (themes) themeChunks.push(...themes);
        const stylesOnly = css.replace(themeRegex, '').trim();
        if (stylesOnly) styleChunks.push(stylesOnly);
      }
    }
  }

  const globalCss = (await exists(config.GLOBAL_CSS_PATH))
    ? await Bun.file(config.GLOBAL_CSS_PATH).text()
    : '';

  const fullCss = `@import "tailwindcss";\n${globalCss}\n${themeChunks.join(
    '\n',
  )}\n${styleChunks.join('\n')}\n`;
  await Bun.write(config.TMP_CSS, fullCss);
}

async function compressAssets(outputs) {
  if (!config.IS_PROD) return {};
  console.log('Compressing assets...');
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

export async function performBuild(appRoutes) {
  console.log('--- Performing client build ---');
  await ensureDir(config.TMPDIR);
  await cleanDirectory(config.OUTDIR);
  await generateClientEntry();
  await prepareCss();

  const appBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS, config.TMP_CSS],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [tailwind],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
  });

  if (!appBuildResult.success) {
    console.error('Client app build failed:', appBuildResult.logs);
    return null;
  }
  console.log('Client app assets built successfully.');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const frameworkClientDir = resolve(__dirname, '..', '..', 'client');
  const swEntryPath = join(frameworkClientDir, 'ws.js');
  let swOutput = null;

  if (await exists(swEntryPath)) {
    const swBuildResult = await Bun.build({
      entrypoints: [swEntryPath],
      outdir: config.OUTDIR,
      target: 'browser',
      splitting: false,
      minify: config.IS_PROD,
      naming: config.IS_PROD ? 'sw-[hash].[ext]' : 'sw.[ext]',
      sourcemap: 'none',
    });

    if (!swBuildResult.success) {
      console.error('Service worker build failed:', swBuildResult.logs);
      return null;
    }

    swOutput = swBuildResult.outputs[0];
    console.log('Service worker built successfully.');

    const assetManifest = appBuildResult.outputs.map((o) => ({
      url: `/${o.path.split('/').pop()}`,
      revision: null,
      isNavigation: false,
    }));

    const routeManifest = Object.keys(appRoutes).map((routePath) => ({
      url: routePath,
      revision: null,
      isNavigation: true,
    }));

    if (!appRoutes['/']) {
      routeManifest.push({ url: '/', revision: null, isNavigation: true });
    }

    const fullManifest = [...assetManifest, ...routeManifest];
    let swContent = await Bun.file(swOutput.path).text();
    const manifestString = JSON.stringify(fullManifest, null, 2);
    swContent = `self.__WEBS_MANIFEST = ${manifestString};\n` + swContent;
    await Bun.write(swOutput.path, swContent);
    console.log(`Service worker manifest injected into ${swOutput.path}`);
  } else {
    console.warn(
      'Service worker not found at expected path, skipping build:',
      swEntryPath,
    );
  }

  const manifest = {
    js: appBuildResult.outputs.find(
      (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
    )?.path,
    css: appBuildResult.outputs.find((o) => o.path.endsWith('.css'))?.path,
    sw: swOutput?.path,
  };

  if (config.IS_PROD) {
    const allOutputs = [
      ...appBuildResult.outputs,
      ...(swOutput ? [swOutput] : []),
    ];
    manifest.sizes = await compressAssets(allOutputs);
  }

  return manifest;
}
