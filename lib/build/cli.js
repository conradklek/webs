#!/usr/bin/env bun

import { rm, writeFile, exists } from 'fs/promises';
import { watch } from 'fs';
import { join, relative, dirname, resolve, basename } from 'path';
import {
  config,
  getDbConfig,
  aiConfig as defaultAiConfig,
} from '../server/server-config.js';
import { createDatabaseAndActions } from '../server/db.server.js';
import { AI } from '../ai/ai.server.js';
import { startServer } from '../server/server.js';
import { createFetchHandler } from '../server/router.js';
import { seedDevDatabase, ensureDir } from '../server/server-setup.js';
import { createLogger } from '../core/logger.js';
import tailwind from 'bun-plugin-tailwind';

/**
 * @typedef {import('../server/server-config.js').Config} Config
 * @typedef {import('bun').BuildArtifact} BuildArtifact
 * @typedef {{ source: string; compiled: string; }} PageEntrypoint
 * @typedef {{ path: string; definition: { component: any; componentName: string; actions: Record<string, Function>; }; }} RouteDefinition
 * @typedef {{ sourceEntrypoints: string[]; pageEntrypoints: PageEntrypoint[]; publicCssEntrypoints: string[]; layoutWrapperEntrypoints: { name: string; path: string; }[]; }} BuildEntries
 */

const logger = createLogger('[Main]');

/**
 * Re-implementation of the working compilation logic from your old build script.
 * @param {string} filePath
 * @param {string} componentName
 * @param {Config} config
 * @returns {Promise<{js: string, css: string}>}
 */
async function compileWebsFile(filePath, componentName, config) {
  const sourceCode = await Bun.file(filePath).text();
  const scriptMatch = /<script[^>]*>(.*?)<\/script>/s.exec(sourceCode);
  const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);
  const styleMatch = /<style>([\s\S]*?)<\/style>/s.exec(sourceCode);

  let scriptContent = scriptMatch?.[1]?.trim() ?? '';
  const templateContent = templateMatch?.[1]?.trim() ?? '';
  const styleContent = styleMatch?.[1]?.trim() ?? '';

  scriptContent = scriptContent.replace(
    /from\s+['"](.+?)\.webs['"]/g,
    "from '$1.js'",
  );

  const isGlobalComponent =
    config.GUI_DIR && filePath.startsWith(config.GUI_DIR);
  let registryImport = '';

  if (!isGlobalComponent) {
    const outPath = resolve(
      config.TMP_COMPILED_DIR,
      relative(config.SRC_DIR, filePath).replace('.webs', '.js'),
    );
    let relPathToRegistry = relative(
      dirname(outPath),
      config.TMP_COMPONENT_REGISTRY,
    ).replace(/\\/g, '/');
    if (!relPathToRegistry.startsWith('.'))
      relPathToRegistry = './' + relPathToRegistry;
    registryImport = `import __globalComponents from '${relPathToRegistry}';\n`;
  }

  const templateProperty = `template: ${JSON.stringify(templateContent)}`;
  const injectedProps = `name: '${componentName}', ${templateProperty}, style: ${JSON.stringify(styleContent)}`;

  let finalScript;
  if (!scriptContent.includes('export default')) {
    finalScript = `${scriptContent}\nexport default { ${injectedProps} };`;
  } else {
    finalScript = scriptContent.replace(
      /(export default\s*\{)/,
      `$1 ${injectedProps},`,
    );
  }

  if (!isGlobalComponent) {
    if (finalScript.includes('components:')) {
      finalScript = finalScript.replace(
        /(components\s*:\s*\{)/,
        '$1 ...(__globalComponents || {}),',
      );
    } else {
      finalScript = finalScript.replace(
        /(export default\s*\{)/,
        '$1 components: __globalComponents || {},',
      );
    }
  }

  // This wrapper is the key to preventing SSR stack overflows.
  if (finalScript.includes('export default')) {
    finalScript = finalScript.replace(
      /export default (\{[\s\S]*\});?/,
      'const __webs_component_def = $1; export default __webs_component_def;',
    );
  }

  return { js: registryImport + finalScript, css: styleContent };
}

/**
 * Reverts to the stable, explicit pre-compilation build step.
 * @param {Config} config
 * @returns {Promise<{sourceEntrypoints: string[], pageEntrypoints: PageEntrypoint[], publicCssEntrypoints: string[]}>}
 */
async function prepareBuildFiles(config) {
  logger.info('Stage 1: Starting file pre-compilation...');
  await ensureDir(config.TMP_COMPILED_DIR);

  const websGlob = new Bun.Glob('**/*.webs');
  const cssGlob = new Bun.Glob('**/*.css');
  const sourceEntrypoints = [];
  const publicCssEntrypoints = [];
  const pageEntrypoints = [];

  for await (const file of websGlob.scan(config.SRC_DIR)) {
    const fullPath = join(config.SRC_DIR, file);
    sourceEntrypoints.push(fullPath);

    const relativePath = relative(config.SRC_DIR, fullPath).replace(/\\/g, '/');
    const componentName = relativePath.replace('.webs', '');

    const { js } = await compileWebsFile(fullPath, componentName, config);
    const outPath = join(
      config.TMP_COMPILED_DIR,
      relativePath.replace('.webs', '.js'),
    );

    if (fullPath.startsWith(config.APP_DIR)) {
      pageEntrypoints.push({ source: fullPath, compiled: outPath });
    }

    await ensureDir(dirname(outPath));
    await writeFile(outPath, js);
  }

  if (await exists(config.PUB_DIR)) {
    logger.info(
      'Found src/pub directory. Adding CSS files as build entrypoints...',
    );
    for await (const file of cssGlob.scan(config.PUB_DIR)) {
      publicCssEntrypoints.push(join(config.PUB_DIR, file));
    }
  }

  logger.info('Stage 1: File pre-compilation complete.');
  return { sourceEntrypoints, pageEntrypoints, publicCssEntrypoints };
}

/**
 * Generates the global component registry file.
 * @param {Config} config
 */
async function generateComponentRegistry(config) {
  logger.info('Generating global component registry...');
  await ensureDir(dirname(config.TMP_COMPONENT_REGISTRY));
  const glob = new Bun.Glob('**/*.webs');
  const imports = [];
  const exports = [];

  if (await exists(config.GUI_DIR)) {
    for await (const file of glob.scan(config.GUI_DIR)) {
      const componentName = basename(file, '.webs');
      const pascalName = componentName
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');

      const compiledPath = resolve(
        config.TMP_COMPILED_DIR,
        'gui',
        `${componentName}.js`,
      );
      let relativePath = relative(
        dirname(config.TMP_COMPONENT_REGISTRY),
        compiledPath,
      ).replace(/\\/g, '/');
      if (!relativePath.startsWith('.')) relativePath = './' + relativePath;

      imports.push(`import ${pascalName} from '${relativePath}';`);
      exports.push(`  '${componentName}': ${pascalName}`);
    }
  }

  const content = `${imports.join('\n')}\n\nexport default {\n${exports.join(',\n')}\n};`;
  await writeFile(config.TMP_COMPONENT_REGISTRY, content);
  logger.info('Global component registry generated.');
}

/**
 * Finds layout files for a given page.
 * @param {string} pagePath
 * @param {Config} config
 */
async function findLayoutsForPage(pagePath, config) {
  const layouts = [];
  let currentDir = dirname(pagePath);
  while (currentDir.startsWith(config.APP_DIR)) {
    const layoutPath = join(currentDir, 'layout.webs');
    if (await exists(layoutPath)) layouts.push(layoutPath);
    if (currentDir === config.APP_DIR) break;
    currentDir = dirname(currentDir);
  }
  return layouts.reverse();
}

/**
 * Generates server routes from pre-compiled files.
 * @param {PageEntrypoint[]} pageEntrypoints
 * @param {Config} config
 */
async function generateRoutes(pageEntrypoints, config) {
  logger.info('Generating server routes...');
  await ensureDir(config.TMP_WRAPPERS_DIR);

  const routeDefinitions = [];
  const layoutWrapperEntrypoints = [];
  /** @type {Record<string, string>} */
  const sourceToComponentMap = {};

  for (const {
    source: sourcePagePath,
    compiled: compiledPagePath,
  } of pageEntrypoints) {
    const componentPath = relative(config.APP_DIR, sourcePagePath).replace(
      /\\/g,
      '/',
    );
    const componentName = `app/${componentPath.replace('.webs', '')}`;

    sourceToComponentMap[
      relative(config.SRC_DIR, sourcePagePath).replace(/\\/g, '/')
    ] = componentName;

    if (basename(componentName) === 'layout') continue;

    const mod = await import(`${compiledPagePath}?t=${Date.now()}`);

    const layouts = await findLayoutsForPage(sourcePagePath, config);
    let finalComponent = mod.default;
    let finalComponentName = componentName;

    if (layouts.length > 0) {
      finalComponentName = `layout/${componentName.replace(/\//g, '_')}`;
      const wrapperPath = join(
        config.TMP_WRAPPERS_DIR,
        `${finalComponentName.split('/')[1]}.js`,
      );
      layoutWrapperEntrypoints.push({
        name: finalComponentName,
        path: wrapperPath,
      });

      const layoutImports = layouts
        .map((p, i) => {
          const relativeSourcePath = relative(config.SRC_DIR, p);
          const targetPath = resolve(
            config.TMP_COMPILED_DIR,
            relativeSourcePath.replace('.webs', '.js'),
          );
          let relativeImportPath = relative(
            dirname(wrapperPath),
            targetPath,
          ).replace(/\\/g, '/');
          if (!relativeImportPath.startsWith('.'))
            relativeImportPath = './' + relativeImportPath;
          return `import Layout${i} from '${relativeImportPath}';`;
        })
        .join('\n');

      let pageComponentRelativePath = relative(
        dirname(wrapperPath),
        compiledPagePath,
      ).replace(/\\/g, '/');
      if (!pageComponentRelativePath.startsWith('.'))
        pageComponentRelativePath = './' + pageComponentRelativePath;

      const wrapperContent = `
            import { h } from '@conradklek/webs';
            ${layoutImports}
            import PageComponent from '${pageComponentRelativePath}';
            export default {
                name: '${finalComponentName}',
                props: { params: Object, initialState: Object, user: Object },
                render() {
                    const pageNode = h(PageComponent, { ...this.$props });
                    return ${layouts.reduceRight((acc, _, i) => `h(Layout${i}, { ...this.$props }, { default: () => ${acc} })`, 'pageNode')};
                }
            };
        `;
      await writeFile(wrapperPath, wrapperContent);
      finalComponent = (await import(`${wrapperPath}?t=${Date.now()}`)).default;
    }

    let urlPath =
      '/' +
      componentPath
        .replace('.webs', '')
        .replace(/index$/, '')
        .replace(/\[(\w+)\]/g, ':$1');
    if (urlPath.length > 1 && urlPath.endsWith('/'))
      urlPath = urlPath.slice(0, -1);

    routeDefinitions.push({
      path: urlPath,
      definition: {
        component: finalComponent,
        componentName: finalComponentName,
        actions: (mod.default && mod.default.actions) || {},
      },
    });
  }

  routeDefinitions.sort((a, b) => b.path.length - a.path.length);
  logger.info('Server routes generated.');
  return {
    appRoutes: Object.fromEntries(
      routeDefinitions.map((r) => [r.path, r.definition]),
    ),
    layoutWrapperEntrypoints,
    sourceToComponentMap,
  };
}

/**
 * Builds the client bundle from pre-compiled sources.
 * @param {BuildEntries} entries
 * @param {any} dbConfig
 * @param {Config} config
 * @returns {Promise<BuildArtifact[] | null>}
 */
async function buildClientBundle(entries, dbConfig, config) {
  logger.info('Starting client bundle...');

  const { sourceEntrypoints, layoutWrapperEntrypoints, publicCssEntrypoints } =
    entries;

  const allLoaderEntries = [
    ...sourceEntrypoints.map((fullPath) => {
      // FIX: This now generates the correct component name key, e.g., "app/index"
      const componentName = relative(config.SRC_DIR, fullPath)
        .replace(/\\/g, '/')
        .replace('.webs', '');
      const compiledPath = join(
        config.TMP_COMPILED_DIR,
        relative(config.SRC_DIR, fullPath).replace('.webs', '.js'),
      );
      let relPath = relative(dirname(config.TMP_APP_JS), compiledPath).replace(
        /\\/g,
        '/',
      );
      if (!relPath.startsWith('.')) relPath = './' + relPath;
      return `['${componentName}', () => import('${relPath}')]`;
    }),
    ...layoutWrapperEntrypoints.map(({ name, path }) => {
      let relPath = relative(dirname(config.TMP_APP_JS), path).replace(
        /\\/g,
        '/',
      );
      if (!relPath.startsWith('.')) relPath = './' + relPath;
      return `['${name}', () => import('${relPath}')]`;
    }),
  ];

  const entrypointContent = `
        import { hydrate } from '@conradklek/webs';
        const dbConfig = ${JSON.stringify({ version: dbConfig.version, clientTables: dbConfig.clientTables })};
        const componentLoaders = new Map([${allLoaderEntries.join(',\n    ')}]);
        hydrate(componentLoaders, dbConfig);
    `;
  await writeFile(config.TMP_APP_JS, entrypointContent);

  const clientBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS, ...publicCssEntrypoints],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [tailwind],
    loader: { '.js': 'jsx' },
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
 * @param {BuildArtifact[] | null} buildOutputs
 * @param {Config} config
 */
async function generateServiceWorker(buildOutputs, config) {
  if (!buildOutputs) return null;
  logger.info('Generating service worker...');
  const swTemplatePath = resolve(config.LIB_DIR, './client/service-worker.js');
  if (!(await exists(swTemplatePath))) {
    logger.warn('Service worker template not found.');
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
      .concat({ url: '/' }),
  );
  const finalSwContent = `const IS_PROD = ${config.IS_PROD};\nself.__WEBS_MANIFEST = ${manifestForSw};\n\n${swTemplate}`;
  const swOutputPath = join(config.OUTDIR, 'sw.js');
  await writeFile(swOutputPath, finalSwContent);
  logger.info(`Service worker generated at: ${swOutputPath}`);
  return swOutputPath;
}

// --- Main Execution ---
async function main() {
  await rm(config.TMPDIR, { recursive: true, force: true });
  await ensureDir(config.TMPDIR);

  const dbConfig = getDbConfig();
  const aiConfig = {
    ...defaultAiConfig,
    db: { ...defaultAiConfig.db, path: join(config.TMPDIR, 'ai.db') },
  };
  const ai = new AI(aiConfig);
  await ai.init();
  logger.info('AI module initialized.');

  /** @type {BuildEntries} */
  let buildEntries = {
    ...(await prepareBuildFiles(config)),
    layoutWrapperEntrypoints: [],
  };
  await generateComponentRegistry(config);

  const { default: globalComponents } = await import(
    `${config.TMP_COMPONENT_REGISTRY}?t=${Date.now()}`
  );

  const db = await createDatabaseAndActions(
    dbConfig,
    config.CWD,
    writeFile,
    config,
  );
  if (!config.IS_PROD) await seedDevDatabase(db, config, ai);

  let { appRoutes, layoutWrapperEntrypoints, sourceToComponentMap } =
    await generateRoutes(buildEntries.pageEntrypoints, config);
  buildEntries.layoutWrapperEntrypoints = layoutWrapperEntrypoints;

  let buildOutputs = await buildClientBundle(buildEntries, dbConfig, config);

  let manifest = {
    js: buildOutputs?.find(
      (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
    )?.path,
    css: buildOutputs?.find((o) => o.path.endsWith('.css'))?.path,
    sw: (await generateServiceWorker(buildOutputs, config)) || undefined,
  };

  const serverContext = {
    db,
    ai,
    dbConfig,
    manifest,
    appRoutes,
    config,
    isProd: config.IS_PROD,
    SYNC_TOPIC: 'webs-sync',
    HMR_TOPIC: 'webs-hmr',
    actionsPath: config.TMP_GENERATED_ACTIONS,
    globalComponents,
    sourceToComponentMap,
    syncActions: (
      await import(`${config.TMP_GENERATED_ACTIONS}?t=${Date.now()}`)
    ).registerActions(db),
  };

  const serverOptions = await startServer(serverContext);
  const server = Bun.serve(serverOptions);
  ai.initialize(server, db);

  if (!config.IS_PROD) {
    logger.info(`Watching for file changes in: ${config.SRC_DIR}`);
    /** @type {NodeJS.Timeout | null} */
    let hmrDebounceTimer = null;

    watch(config.SRC_DIR, { recursive: true }, (_, filename) => {
      if (filename && !filename.endsWith('~')) {
        if (hmrDebounceTimer) clearTimeout(hmrDebounceTimer);
        hmrDebounceTimer = setTimeout(async () => {
          logger.info(`File change detected: ${filename}. Rebuilding...`);
          try {
            const preparedFiles = await prepareBuildFiles(config);
            buildEntries = {
              ...preparedFiles,
              layoutWrapperEntrypoints: [],
            };

            await generateComponentRegistry(config);

            const routesResult = await generateRoutes(
              buildEntries.pageEntrypoints,
              config,
            );
            appRoutes = routesResult.appRoutes;
            sourceToComponentMap = routesResult.sourceToComponentMap;
            buildEntries.layoutWrapperEntrypoints =
              routesResult.layoutWrapperEntrypoints;

            const newBuildOutputs = await buildClientBundle(
              buildEntries,
              dbConfig,
              config,
            );

            if (newBuildOutputs) {
              manifest = {
                js: newBuildOutputs.find(
                  (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
                )?.path,
                css: newBuildOutputs.find((o) => o.path.endsWith('.css'))?.path,
                sw:
                  (await generateServiceWorker(newBuildOutputs, config)) ||
                  manifest.sw,
              };

              const newFetchHandler = createFetchHandler({
                ...serverContext,
                manifest,
                appRoutes,
                sourceToComponentMap,
              });
              server.reload({ ...serverOptions, fetch: newFetchHandler });

              logger.info('Rebuild complete. Sending HMR reload message.');
              server.publish(
                serverContext.HMR_TOPIC,
                JSON.stringify({ type: 'reload' }),
              );
            }
          } catch (e) {
            logger.error('Error during rebuild:', e);
          }
        }, 100);
      }
    });
  }
}

main().catch((e) => {
  logger.error('Fatal error:', e);
  process.exit(1);
});
