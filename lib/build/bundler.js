#!/usr/bin/env bun

/**
 * @typedef {import('../server/server-config.js').Config} Config
 * @typedef {import('bun').BuildOutput} BuildOutput
 */

/**
 * Database configuration specifically for the client-side bundle.
 * @typedef {object} DbConfigForClient
 * @property {number} version - The database schema version.
 * @property {any[]} clientTables - An array of table schemas for the client-side database.
 */

/**
 * Represents a layout wrapper component entrypoint.
 * @typedef {object} LayoutWrapperEntrypoint
 * @property {string} name - The unique name of the layout wrapper.
 * @property {string} path - The path to the generated layout wrapper file.
 */
import { writeFile } from 'fs/promises';
import { join, relative, dirname, resolve, basename } from 'path';
import { createLogger } from '../developer/logger.js';
import bunPluginTailwind from 'bun-plugin-tailwind';

const logger = createLogger('[Bundler]');

/**
 * Prepares the main client-side entrypoint file.
 * @param {string[]} sourceEntrypoints - Array of paths to .webs source files.
 * @param {LayoutWrapperEntrypoint[]} layoutWrapperEntrypoints - Array of layout wrapper objects.
 * @param {DbConfigForClient} dbConfig - The database configuration.
 * @param {Config} config - The global server configuration.
 * @returns {Promise<void>}
 */
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

    const compiledPath = resolve(
      config.TMP_COMPILED_DIR,
      relative(config.SRC_DIR, fullPath).replace('.webs', '.js'),
    );
    let relPath = relative(appJsDir, compiledPath).replace(/\\/g, '/');

    if (!relPath.startsWith('.')) relPath = './' + relPath;

    logger.debug(
      `Adding client entry for component: '${componentName}' -> '${relPath}'`,
    );
    return `['${componentName}', () => import('${relPath}')]`;
  });

  const layoutWrapperLoaderEntries = layoutWrapperEntrypoints.map(
    ({ name, path }) => {
      let relPath = relative(appJsDir, path).replace(/\\/g, '/');
      if (!relPath.startsWith('.')) relPath = './' + relPath;

      logger.debug(
        `Adding client entry for layout wrapper: '${name}' -> '${relPath}'`,
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

/**
 * Builds the client-side JavaScript and CSS bundles.
 * @param {string[]} sourceEntrypoints - Array of paths to .webs source files.
 * @param {LayoutWrapperEntrypoint[]} layoutWrapperEntrypoints - Array of layout wrapper objects.
 * @param {string[]} publicCssEntrypoints - Array of paths to public CSS files.
 * @param {DbConfigForClient} dbConfig - The database configuration.
 * @param {Config} config - The global server configuration.
 * @returns {Promise<BuildOutput['outputs'] | null>} The build outputs or null if failed.
 */
export async function buildClientBundle(
  sourceEntrypoints,
  layoutWrapperEntrypoints,
  publicCssEntrypoints,
  dbConfig,
  config,
) {
  logger.info('Starting client bundle...');
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
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [bunPluginTailwind],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
    define: {
      'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
    },
  });

  if (!clientBuildResult.success) {
    logger.error('Client build failed.');
    clientBuildResult.logs.forEach((log) => console.error(log));
    return null;
  }

  logger.info('Client bundle complete.');
  return clientBuildResult.outputs;
}

/**
 * Generates the service worker file.
 * @param {BuildOutput['outputs']} buildOutputs - The outputs from the client bundle build.
 * @param {Config} config - The global server configuration.
 * @returns {Promise<string | null>} The path to the generated service worker or null.
 */
export async function generateServiceWorker(buildOutputs, config) {
  if (!buildOutputs || buildOutputs.length === 0) return null;
  logger.info('Generating service worker...');

  const swTemplatePath = resolve(config.LIB_DIR, './client/service-worker.js');
  if (!(await Bun.file(swTemplatePath).exists())) {
    logger.warn('Service worker template not found. Skipping SW generation.');
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
  logger.info(`Service worker generated at: ${swOutputPath}`);
  return swOutputPath;
}
