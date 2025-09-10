import { writeFile, exists } from 'fs/promises';
import { join, relative, dirname, basename, resolve } from 'path';
import websPlugin from './plugin.js';
import tailwind from 'bun-plugin-tailwind';

async function prepareClientEntrypoint(
  sourceEntrypoints,
  layoutWrapperEntrypoints,
  dbConfig,
  config,
) {
  const appJsDir = dirname(config.TMP_APP_JS);

  const sourceLoaderEntries = sourceEntrypoints.map((fullPath) => {
    const componentName = relative(config.SRC_DIR, fullPath)
      .replace(/\\/g, '/')
      .replace('.webs', '');
    let relPath = relative(appJsDir, fullPath).replace(/\\/g, '/');
    if (!relPath.startsWith('.')) relPath = './' + relPath;

    console.log(
      `[Bundler] Adding client entry for component: '${componentName}'`,
    );
    return `['${componentName}', () => import('${relPath}')]`;
  });

  const layoutWrapperLoaderEntries = layoutWrapperEntrypoints.map(
    ({ name, path }) => {
      let relPath = relative(appJsDir, path).replace(/\\/g, '/');
      if (!relPath.startsWith('.')) relPath = './' + relPath;

      console.log(
        `[Bundler] Adding client entry for layout wrapper: '${name}'`,
      );
      return `['${name}', () => import('${relPath}')]`;
    },
  );

  const allLoaderEntries = [
    ...sourceLoaderEntries,
    ...layoutWrapperLoaderEntries,
  ];

  const entrypointContent = `
    import { hydrate } from '@conradklek/webs';
    const dbConfig = ${JSON.stringify({
      version: dbConfig.version,
      clientTables: dbConfig.clientTables,
    })};
    const componentLoaders = new Map([${allLoaderEntries.join(',\n    ')}]);
    hydrate(componentLoaders, dbConfig);
  `;
  await writeFile(config.TMP_APP_JS, entrypointContent);
}

export async function buildClientBundle(
  sourceEntrypoints,
  layoutWrapperEntrypoints,
  publicCssEntrypoints,
  dbConfig,
  config,
) {
  console.log('[Bundler] Stage 2: Starting client bundle...');
  await prepareClientEntrypoint(
    sourceEntrypoints,
    layoutWrapperEntrypoints,
    dbConfig,
    config,
  );

  const clientBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS, ...publicCssEntrypoints],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [
      websPlugin({
        root: config.CWD,
        registryPath: config.TMP_COMPONENT_REGISTRY,
        guiDir: config.GUI_DIR,
      }),
      tailwind,
    ],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
  });

  if (!clientBuildResult.success) {
    console.error('[Bundler] Stage 2: Client build failed.');
    clientBuildResult.logs.forEach((log) => console.error(log));
    return null;
  }

  console.log('[Bundler] Stage 2: Client bundle complete.');
  return clientBuildResult.outputs;
}

export async function generateServiceWorker(buildOutputs, config) {
  if (!buildOutputs || buildOutputs.length === 0) return null;
  console.log('[Bundler] Generating service worker...');

  const swTemplatePath = resolve(config.LIB_DIR, 'service-worker.js');
  if (!(await exists(swTemplatePath))) {
    console.warn(
      '[Bundler] Service worker template not found. Skipping SW generation.',
    );
    return null;
  }
  const swTemplate = await Bun.file(swTemplatePath).text();

  const manifestForSw = JSON.stringify(
    buildOutputs
      .filter(
        (o) =>
          (o.kind === 'entry-point' || o.kind === 'chunk') &&
          (o.path.endsWith('.js') || o.path.endsWith('.css')),
      )
      .map((o) => ({ url: '/' + basename(o.path) }))
      .filter((entry) => !entry.url.includes('[...'))
      .concat({ url: '/' }),
  );
  const finalSwContent = `const IS_PROD = ${
    config.IS_PROD
  };\nself.__WEBS_MANIFEST = ${manifestForSw};\n\n${swTemplate}`;

  const swOutputPath = join(config.OUTDIR, 'sw.js');
  await writeFile(swOutputPath, finalSwContent);
  console.log('[Bundler] Service worker generated at:', swOutputPath);
  return swOutputPath;
}
