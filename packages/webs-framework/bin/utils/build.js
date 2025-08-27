import { rm, mkdir, exists } from 'fs/promises';
import { watch } from 'fs';
import { config } from './config';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import websPlugin from '../../plugin';
import tailwind from 'bun-plugin-tailwind';

let hmrClients = new Set();
let hmrWatcher = null;

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function cleanDirectory(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await ensureDir(dirPath);
}

async function prepareClientEntrypoint(pageEntrypoints) {
  const glob = new Bun.Glob('**/*.js');
  const componentLoaders = [];

  const pageComponentNames = new Set(
    pageEntrypoints.map((p) =>
      p.replace(config.APP_DIR + '/', '').replace('.webs', ''),
    ),
  );

  if (await exists(config.TMP_SERVER_DIR)) {
    for await (const file of glob.scan(config.TMP_SERVER_DIR)) {
      const componentName = file.replace('.js', '');
      if (pageComponentNames.has(componentName)) {
        componentLoaders.push(
          `['${componentName}', () => import('./server/${file}')]`,
        );
      }
    }
  }

  const entrypointContent =
    "import { hydrate } from '@conradklek/webs';\nimport './tmp.css';\n\nconst componentLoaders = new Map([\n" +
    componentLoaders.join(',\n') +
    '\n]);\n\nhydrate(componentLoaders);\n';
  await Bun.write(config.TMP_APP_JS, entrypointContent);
  console.log(`Client entrypoint created at ${config.TMP_APP_JS}`);
}

export async function buildServerComponents() {
  console.log('--- Pre-compiling server components ---');
  const glob = new Bun.Glob('**/*.webs');
  const entrypoints = [];
  if (await exists(config.APP_DIR)) {
    for await (const file of glob.scan(config.APP_DIR)) {
      entrypoints.push(join(config.APP_DIR, file));
    }
  }

  if (entrypoints.length === 0) {
    console.log('No server components found to compile.');
    return { success: true, entrypoints: [] };
  }

  const result = await Bun.build({
    entrypoints,
    outdir: config.TMP_SERVER_DIR,
    target: 'bun',
    plugins: [websPlugin(config), tailwind],
    external: [
      '@conradklek/webs',
      'path',
      'fs',
      'url',
      'bun-plugin-tailwind',
      'sqlite3',
    ],
  });

  if (!result.success) {
    console.error('Server component compilation failed:', result.logs);
  }
  return { success: result.success, entrypoints };
}

async function prepareCss() {
  const glob = new Bun.Glob('**/*.webs');
  let globalAndComponentStyles = [];

  if (!(await exists(config.SRC_DIR))) return '';

  const styleBlockRegex = /<style>([\s\S]*?)<\/style>/s;

  for await (const file of glob.scan(config.SRC_DIR)) {
    const filePath = join(config.SRC_DIR, file);
    const src = await Bun.file(filePath).text();
    const styleMatch = src.match(styleBlockRegex);

    if (styleMatch && styleMatch[1]) {
      let css = styleMatch[1];
      const stylesOnly = css.trim();
      if (stylesOnly) globalAndComponentStyles.push(stylesOnly);
    }
  }

  const globalCss = (await exists(config.GLOBAL_CSS_PATH))
    ? await Bun.file(config.GLOBAL_CSS_PATH).text()
    : '';

  const fullCss = `${globalCss}\n${globalAndComponentStyles.join('\n')}`;
  await Bun.write(config.TMP_CSS, fullCss);
  return config.TMP_CSS;
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

export async function buildAndNotify(appRoutes, changedFile, pageEntrypoints) {
  await prepareClientEntrypoint(pageEntrypoints);
  const tempCssPath = await prepareCss();

  const appBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS, tempCssPath],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [websPlugin(config), tailwind],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
  });

  if (!appBuildResult.success) {
    console.error('Client app build failed:', appBuildResult.logs);
    return null;
  }

  if (changedFile) {
    hmrClients.forEach((ws) =>
      ws.send(JSON.stringify({ type: 'update', file: changedFile })),
    );
  }

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
      plugins: [websPlugin(config), tailwind],
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

export async function performBuild(appRoutes) {
  await ensureDir(config.TMPDIR);
  await cleanDirectory(config.OUTDIR);

  const { success, entrypoints } = await buildServerComponents();
  if (!success) return { manifest: null, entrypoints: [] };

  const manifest = await buildAndNotify(appRoutes, null, entrypoints);

  if (!config.IS_PROD) {
    if (hmrWatcher) {
      hmrWatcher.close();
    }
    console.log('--- Setting up HMR file watcher ---');
    hmrWatcher = watch(
      config.SRC_DIR,
      { recursive: true },
      async (event, filename) => {
        if (
          filename &&
          (filename.endsWith('.webs') || filename.endsWith('.css'))
        ) {
          console.log(`Detected ${event} in ${filename}`);
          const { success: rebuildSuccess, entrypoints: updatedEntrypoints } =
            await buildServerComponents();
          if (rebuildSuccess) {
            await buildAndNotify(appRoutes, filename, updatedEntrypoints);
          }
        }
      },
    );
    process.on('SIGINT', () => {
      console.log('Closing HMR watcher...');
      if (hmrWatcher) {
        hmrWatcher.close();
      }
      process.exit(0);
    });
  }
  return { manifest, entrypoints };
}

export function getHmrClients() {
  return hmrClients;
}
