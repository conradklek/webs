#!/usr/bin/env bun

/**
 * @typedef {import('../lib/server/server-config.js').Config} Config
 * @typedef {import('bun').BuildArtifact} BuildArtifact
 * @typedef {import('../lib/server/ai.server.js').AgentDefinition} AgentDefinition
 * @typedef {import('../lib/server/router.js').ServerContext} ServerContext
 * @typedef {import('bun').Server & { serverContext?: ServerContext }} BunServerWithContext
 */

/**
 * Represents a single page component's source and compiled file paths.
 * @typedef {object} PageEntrypoint
 * @property {string} source - The absolute path to the source .webs file.
 * @property {string} compiled - The absolute path to the pre-compiled .js file in the temporary directory.
 */

/**
 * Represents the definition of a server route.
 * @typedef {object} RouteDefinition
 * @property {string} path - The URL path for the route (e.g., '/users/:id').
 * @property {object} definition - The route's handler and component information.
 * @property {any} definition.component - The compiled component (or layout wrapper) to render.
 * @property {string} definition.componentName - The unique name of the component.
 * @property {Record<string, Function>} definition.actions - Server-side actions associated with the component.
 * @property {Record<string, Function>} definition.handlers - HTTP method handlers (post, patch, etc.).
 * @property {Record<string, Function>} [definition.wsHandlers] - WebSocket lifecycle handlers.
 * @property {any} [definition.cc] - Compiled native C functions for this route.
 */

/**
 * Represents all the entrypoints and file collections required for a build.
 * @typedef {object} BuildEntries
 * @property {string[]} sourceEntrypoints - All discovered .webs source files.
 * @property {PageEntrypoint[]} pageEntrypoints - .webs files that are pages.
 * @property {string[]} publicCssEntrypoints - CSS files from the public directory.
 * @property {Array<{ name: string; path: string; }>} layoutWrapperEntrypoints - Dynamically generated layout wrapper components.
 */
import { rm, writeFile, exists } from 'fs/promises';
import { join, relative, dirname, resolve, basename } from 'path';
import {
  config as defaultConfig,
  getDbConfig,
  aiConfig as defaultAiConfig,
} from '../lib/server/server-config.js';
import { setupDatabase } from '../lib/server/db.server.js';
import { AI } from '../lib/server/ai.server.js';
import { startServer } from '../lib/server/server.js';
import { seedDevDatabase, ensureDir } from '../lib/server/server-setup.js';
import { createLogger } from '../lib/shared/logger.js';
import tailwind from 'bun-plugin-tailwind';
import {
  runAnalysis,
  createLockfile,
  generateInspectionReport,
  runGrep,
} from './profiler.js';
import { startDevShell } from './shell.js';
import { cc } from 'bun:ffi';

const logger = createLogger('[Main]');

/**
 * Converts a component file path/name into PascalCase.
 * e.g., 'my-component' -> 'MyComponent', 'user/profile-card' -> 'ProfileCard'
 * @param {string} componentName - The kebab-case or path-based component name.
 * @returns {string} The PascalCase version of the name.
 */
function toPascalCase(componentName) {
  return (componentName.split('/').pop() || '')
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/**
 * Analyzes a script's content to determine its primary export identifier.
 * @param {string} scriptContent - The JavaScript code from the .webs file.
 * @param {string} filePath - The absolute path to the original .webs file for error reporting.
 * @param {string} componentName - The component's conventional name (e.g., 'gui/accordion').
 * @param {Config} config - The global configuration object.
 * @returns {Promise<string | null>} The identifier of the primary export ('default' or a variable name), or null.
 */
async function getPrimaryExportIdentifier(
  scriptContent,
  filePath,
  componentName,
  config,
) {
  if (/export\s+default\s+\{/.test(scriptContent)) {
    return 'default_inline';
  }

  const tempScriptPath = join(
    config.TMPDIR,
    `${basename(filePath)}.${Date.now()}.mjs`,
  );
  await writeFile(tempScriptPath, scriptContent);

  try {
    const mod = await import(`${tempScriptPath}?v=${Date.now()}`);

    if ('default' in mod) {
      return 'default';
    }

    const namedExports = Object.keys(mod).filter((key) => key !== '__esModule');
    if (namedExports.length === 1 && namedExports[0]) {
      return namedExports[0];
    }

    const pascalComponentName = toPascalCase(componentName);
    if (mod[pascalComponentName]) {
      return pascalComponentName;
    }

    if (namedExports.length > 1) {
      throw new Error(
        `Cannot determine primary export for ${filePath}. Found multiple exports: [${namedExports.join(
          ', ',
        )}]. Please use a default export, a single named export, or a named export matching the component's filename (expected '${pascalComponentName}').`,
      );
    }
  } catch (e) {
    logger.error(`Error analyzing script for ${filePath}:`, e);
  } finally {
    await rm(tempScriptPath, { force: true });
  }
  return null;
}

/**
 * Compiles a .webs file into executable JavaScript.
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

  scriptContent = scriptContent.replace(/\.c\?native/g, '.js');

  scriptContent = scriptContent.replace(
    /from\s+['"](.+?)\.webs['"]/g,
    "from '$1.js'",
  );

  const primaryExportIdentifier = await getPrimaryExportIdentifier(
    scriptContent,
    filePath,
    componentName,
    config,
  );

  const isGlobalComponent =
    config.GUI_DIR && filePath.startsWith(config.GUI_DIR);
  let registryImport = '';
  let componentsInjection = '';

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
    componentsInjection = `...(__globalComponents || {})`;
  }

  const injectedProps = `name: '${componentName}', template: ${JSON.stringify(
    templateContent,
  )}, style: ${JSON.stringify(styleContent)}`;

  let finalScript;

  if (!scriptContent.trim() && !primaryExportIdentifier) {
    finalScript = `${registryImport}\nexport default { ${injectedProps}, components: { ${componentsInjection} } };`;
  } else if (primaryExportIdentifier === 'default_inline') {
    let processedScript = scriptContent.replace(
      /(export\s+default\s*\{)/,
      `$1 ${injectedProps},`,
    );
    if (processedScript.includes('components:')) {
      processedScript = processedScript.replace(
        /(components\s*:\s*\{)/,
        `$1 ${componentsInjection},`,
      );
    } else {
      processedScript = processedScript.replace(
        /(export\s+default\s*\{)/,
        `$1 components: { ${componentsInjection} },`,
      );
    }
    finalScript = `${registryImport}${processedScript}`;
  } else if (primaryExportIdentifier) {
    const exportRef =
      primaryExportIdentifier === 'default'
        ? 'default'
        : primaryExportIdentifier;

    finalScript = `
      ${registryImport}
      ${scriptContent}

      const __webs_primary_export = ${
        primaryExportIdentifier === 'default' ? '__default' : exportRef
      };
      const __webs_final_def = {
        ...__webs_primary_export,
        ${injectedProps},
        components: { ...(__webs_primary_export.components || {}), ${componentsInjection} }
      };
      export default __webs_final_def;
    `.replace('__default', 'default');
  } else {
    finalScript = `
      ${registryImport}
      ${scriptContent}
      export default { ${injectedProps}, components: { ${componentsInjection} } };
    `;
  }

  return { js: finalScript, css: styleContent };
}
/**
 * @param {Config} config
 * @returns {Promise<BuildEntries>}
 */
async function prepareBuildFiles(config) {
  logger.info('Stage 1: Starting file pre-compilation...');
  await ensureDir(config.TMP_COMPILED_DIR);

  const websGlob = new Bun.Glob('**/*.{webs,agent.webs}');
  const cssGlob = new Bun.Glob('**/*.css');
  const sourceEntrypoints = [];
  const publicCssEntrypoints = [];
  /** @type {PageEntrypoint[]} */
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
  return {
    sourceEntrypoints,
    pageEntrypoints,
    publicCssEntrypoints,
    layoutWrapperEntrypoints: [],
  };
}
/**
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
      const pascalName = toPascalCase(componentName);

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

  const content = `${imports.join(
    '\n',
  )}\n\nexport default {\n${exports.join(',\n')}\n};`;
  await writeFile(config.TMP_COMPONENT_REGISTRY, content);
  logger.info('Global component registry generated.');
}
/**
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
 * @param {PageEntrypoint[]} pageEntrypoints
 * @param {Config} config
 */
async function generateRoutes(pageEntrypoints, config) {
  logger.info('Generating server routes...');
  await ensureDir(config.TMP_WRAPPERS_DIR);

  const routeDefinitions = [];
  /** @type {Record<string, AgentDefinition>} */
  const agentDefinitions = {};
  const layoutWrapperEntrypoints = [];
  /** @type {Record<string, string>} */
  const sourceToComponentMap = {};

  for (const {
    source: sourcePagePath,
    compiled: compiledPagePath,
  } of pageEntrypoints) {
    const componentPath = relative(config.APP_DIR, sourcePagePath)
      .replace(/\\/g, '/')
      .replace('.webs', '')
      .replace('.agent', '');

    const componentName = `app/${componentPath}`;

    sourceToComponentMap[
      relative(config.SRC_DIR, sourcePagePath).replace(/\\/g, '/')
    ] = componentName;

    if (basename(componentName) === 'layout') continue;

    const mod = await import(`${compiledPagePath}?t=${Date.now()}`);

    let ccSymbols = null;
    const scriptContent = await Bun.file(sourcePagePath).text();
    const scriptMatch = /<script[^>]*>(.*?)<\/script>/s.exec(scriptContent);
    const nativeImportRegex = /from\s+['"](\.\/.*?\.c\?native)['"]/s;

    if (scriptMatch && scriptMatch[1]) {
      const nativeImportMatch = scriptMatch[1].match(nativeImportRegex);
      if (nativeImportMatch && nativeImportMatch[1]) {
        const cSourcePath = resolve(
          dirname(sourcePagePath),
          nativeImportMatch[1].replace('?native', ''),
        );
        if (mod.symbols && (await Bun.file(cSourcePath).exists())) {
          try {
            const cSourceText = await Bun.file(cSourcePath).text();
            const { symbols } = cc({
              source: cSourceText,
              symbols: mod.symbols,
            });
            ccSymbols = symbols;
            logger.info(
              `[CC] Successfully compiled native module for: ${componentName}`,
            );
          } catch (e) {
            logger.error(
              `[CC] Failed to compile native module for ${componentName}:`,
              e,
            );
          }
        } else {
          logger.warn(
            `[CC] Found native import in ${componentName} but could not find a 'symbols' export or the C source file '${cSourcePath}'.`,
          );
        }
      }
    }

    if (sourcePagePath.endsWith('.agent.webs')) {
      const shortAgentName = basename(sourcePagePath, '.agent.webs');
      const fullAgentName = componentName.replace('.agent', '');

      logger.info(
        `Found agent definition: ${fullAgentName} (using short name: '${shortAgentName}')`,
      );

      if (agentDefinitions[shortAgentName]) {
        logger.warn(
          `[!] Duplicate agent short name detected: '${shortAgentName}'. The agent at '${sourcePagePath}' will overwrite the previous definition. To avoid this, please ensure all agent filenames are unique.`,
        );
      }

      agentDefinitions[shortAgentName] = {
        name: fullAgentName,
        system_prompt: mod.system_prompt || '',
        tools: mod.tools || [],
        model: mod.model,
        component: mod.default,
      };
      continue;
    }

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
                    props: { params: Object, initialState: Object, user: Object, cc: Object },
                    render() {
                        const pageNode = h(PageComponent, { ...this.$props });
                        return ${layouts.reduceRight(
                          (acc, _, i) =>
                            `h(Layout${i}, { ...this.$props }, { default: () => ${acc} })`,
                          'pageNode',
                        )};
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

    const actions = (mod.default && mod.default.actions) || {};
    /** @type {Record<string, Function>} */
    const handlers = {};
    const methodNames = ['post', 'patch', 'put', 'del'];
    for (const method of methodNames) {
      if (mod.default && typeof mod.default[method] === 'function') {
        handlers[method] = mod.default[method];
      }
    }
    /** @type {Record<string, Function>} */
    const wsHandlers = {};
    const wsHandlerNames = ['onOpen', 'onMessage', 'onClose', 'onError'];
    for (const handlerName of wsHandlerNames) {
      if (mod.default && typeof mod.default[handlerName] === 'function') {
        wsHandlers[handlerName] = mod.default[handlerName];
      }
    }

    routeDefinitions.push({
      path: urlPath,
      definition: {
        component: finalComponent,
        componentName: finalComponentName,
        actions: actions,
        handlers: handlers,
        wsHandlers: wsHandlers,
        cc: ccSymbols,
      },
    });
  }

  routeDefinitions.sort((a, b) => b.path.length - a.path.length);
  logger.info('Server routes and agent definitions generated.');
  return {
    appRoutes: Object.fromEntries(
      routeDefinitions.map((r) => [r.path, r.definition]),
    ),
    agentRoutes: agentDefinitions,
    layoutWrapperEntrypoints,
    sourceToComponentMap,
  };
}
/**
 * @param {BuildEntries} entries
 * @param {any} dbConfig
 * @param {Config} config
 */
async function buildClientBundle(entries, dbConfig, config) {
  logger.info('Starting client bundle...');

  const { sourceEntrypoints, layoutWrapperEntrypoints, publicCssEntrypoints } =
    entries;

  const allLoaderEntries = [
    ...sourceEntrypoints.map((fullPath) => {
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
        const dbConfig = ${JSON.stringify({
          version: dbConfig.version,
          clientTables: dbConfig.clientTables,
        })};
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
  const finalSwContent = `const IS_PROD = ${
    config.IS_PROD
  };\nself.__WEBS_MANIFEST = ${manifestForSw};\n\n${swTemplate}`;
  const swOutputPath = join(config.OUTDIR, 'sw.js');
  await writeFile(swOutputPath, finalSwContent);
  logger.info(`Service worker generated at: ${swOutputPath}`);
  return swOutputPath;
}

/**
 * @param {Config} config
 * @param {boolean} [interactive=false]
 */
async function runBuildAndServe(config, interactive = false) {
  const devInfoPath = join(config.TMPDIR, 'dev.json');

  const cleanup = async () => {
    if (await exists(devInfoPath)) {
      await rm(devInfoPath, { force: true });
    }
    if (!interactive) process.exit();
  };
  process.on('SIGINT', cleanup);
  process.on('exit', cleanup);

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

  let buildEntries = await prepareBuildFiles(config);
  await generateComponentRegistry(config);

  const { default: globalComponents } = await import(
    `${config.TMP_COMPONENT_REGISTRY}?t=${Date.now()}`
  );

  const db = await setupDatabase(dbConfig, config.CWD, writeFile, config);
  if (!config.IS_PROD) await seedDevDatabase(db, config, ai);

  let {
    appRoutes,
    agentRoutes,
    layoutWrapperEntrypoints,
    sourceToComponentMap,
  } = await generateRoutes(buildEntries.pageEntrypoints, config);
  buildEntries.layoutWrapperEntrypoints = layoutWrapperEntrypoints;

  const buildOutputs = await buildClientBundle(buildEntries, dbConfig, config);

  const jsOutput = buildOutputs?.find(
    (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
  );
  const cssOutput = buildOutputs?.find((o) => o.path.endsWith('.css'));
  let manifest = {
    js: jsOutput?.path,
    css: cssOutput?.path,
    sw: (await generateServiceWorker(buildOutputs, config)) || undefined,
  };

  /** @type {ServerContext} */
  const serverContext = {
    db,
    ai,
    dbConfig,
    manifest,
    appRoutes,
    agentRoutes,
    config,
    isProd: config.IS_PROD,
    SYNC_TOPIC: 'webs-sync',
    actionsPath: config.TMP_GENERATED_ACTIONS,
    globalComponents,
    sourceToComponentMap,
    syncActions: (
      await import(`${config.TMP_GENERATED_ACTIONS}?t=${Date.now()}`)
    ).registerActions(db),
    sourceEntrypoints: buildEntries.sourceEntrypoints,
  };

  const serverOptions = await startServer(serverContext);
  /** @type {BunServerWithContext} */
  const server = Bun.serve(serverOptions);
  ai.initialize(server, agentRoutes);
  server.serverContext = serverContext;

  await writeFile(
    devInfoPath,
    JSON.stringify({ pid: process.pid, port: server.port }),
  );

  if (!config.IS_PROD) {
    if (interactive) {
      await startDevShell(config, server, ai, serverContext);
      await cleanup();
      server.stop(true);
      process.exit();
    }
  }
}

/**
 * @param {Config} config
 */
async function runInspection(config) {
  await rm(config.TMPDIR, { recursive: true, force: true });
  await ensureDir(config.TMPDIR);

  const buildEntries = await prepareBuildFiles(config);
  await generateComponentRegistry(config);

  const { appRoutes, agentRoutes, sourceToComponentMap } = await generateRoutes(
    buildEntries.pageEntrypoints,
    config,
  );

  await generateInspectionReport({
    appRoutes,
    agentRoutes,
    sourceEntrypoints: buildEntries.sourceEntrypoints,
    config,
    sourceToComponentMap,
  });
}

/**
 * @param {string[]} args
 * @param {string} flag
 * @returns {string[]}
 */
function getFlagValues(args, flag) {
  const flagIndex = args.indexOf(flag);
  const values = [];
  if (flagIndex !== -1) {
    for (let i = flagIndex + 1; i < args.length; i++) {
      const arg = args[i];
      if (arg && arg.startsWith('--')) {
        break;
      }
      if (arg) {
        values.push(arg);
      }
    }
  }
  return values;
}

/**
 * Determines the target directory for CLI commands.
 * Auto-detects if running against the framework 'lib' or a consumer project.
 * @param {string[]} args - The process arguments.
 * @returns {Promise<string>} The resolved absolute path to the target directory.
 */
async function getTargetDirectory(args) {
  const targetFlagIndex = args.indexOf('--target');
  const targetArg = args[targetFlagIndex + 1];
  if (targetFlagIndex !== -1 && targetArg) {
    return resolve(targetArg);
  }

  const pkgPath = resolve(process.cwd(), 'package.json');
  if (await exists(pkgPath)) {
    const pkg = await Bun.file(pkgPath).json();
    if (
      pkg.name === '@conradklek/webs' &&
      (await exists(resolve(process.cwd(), 'lib')))
    ) {
      logger.info(
        "Detected execution within framework repository, targeting 'lib'.",
      );
      const libSrcExists = await exists(resolve(process.cwd(), 'lib', 'src'));
      return libSrcExists ? resolve(process.cwd(), 'lib') : process.cwd();
    }
  }

  logger.info(
    'Assuming execution in a consumer project, targeting current directory.',
  );
  return process.cwd();
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || (defaultConfig.IS_PROD ? 'start' : 'dev');

  const targetDir = await getTargetDirectory(args);

  const config = {
    ...defaultConfig,
    CWD: targetDir,
    OUTDIR: resolve(targetDir, 'dist'),
    TMPDIR: resolve(targetDir, '.webs'),
    TMP_COMPILED_DIR: resolve(targetDir, '.webs/compiled'),
    TMP_WRAPPERS_DIR: resolve(targetDir, '.webs/layout'),
    TMP_APP_JS: resolve(targetDir, '.webs/app.js'),
    TMP_APP_CSS: resolve(targetDir, '.webs/app.css'),
    SRC_DIR: resolve(targetDir, 'src'),
    APP_DIR: resolve(targetDir, 'src/app'),
    PUB_DIR: resolve(targetDir, 'src/pub'),
    GUI_DIR: resolve(targetDir, 'src/gui'),
    USER_FILES_ROOT: resolve(targetDir, '.webs/files'),
    TMP_GENERATED_ACTIONS: resolve(targetDir, '.webs/actions.js'),
    TMP_COMPONENT_REGISTRY: resolve(targetDir, '.webs/registry.js'),
  };

  switch (command) {
    case 'dev':
      await runBuildAndServe(config, true);
      break;
    case 'start':
      await runBuildAndServe(config, false);
      break;
    case 'inspect':
      await runInspection(config);
      break;
    case 'shell':
      console.log(
        "'webs shell' is now integrated into 'webs dev'.\nStarting dev server and shell...",
      );
      await runBuildAndServe(config, true);
      break;
    case 'grep': {
      const [pattern, path = config.CWD, ...rest] = args.slice(1);
      const includeIndex = rest.indexOf('--include');
      const filePattern =
        includeIndex > -1 ? rest[includeIndex + 1] : undefined;
      if (!pattern) {
        console.error('Usage: webs grep <pattern> [path] [--include <glob>]');
        process.exit(1);
      }
      await runGrep(pattern, path, filePattern);
      break;
    }
    case 'analyze':
      console.log(`Analyzing directory: ${targetDir}`);
      await runAnalysis(targetDir);
      break;
    case 'lock': {
      let lockTarget = args[1];
      let lockTargetDir;

      if (lockTarget === 'lib' || lockTarget === 'src') {
        lockTargetDir = resolve(process.cwd(), lockTarget);
        if (!(await exists(lockTargetDir))) {
          console.error(`Error: Directory './${lockTarget}' not found.`);
          process.exit(1);
        }
      } else {
        lockTargetDir = targetDir;
        if (lockTarget && !lockTarget.startsWith('--')) {
          console.warn(
            `Warning: Unknown lock target '${lockTarget}'. Using default target. Supported: 'lib', 'src'.`,
          );
        }
      }

      console.log(
        `Creating lockfile for: ./${relative(process.cwd(), lockTargetDir)}`,
      );

      const includedFiles = getFlagValues(args, '--include');
      const excludedPatterns = getFlagValues(args, '--exclude');

      await createLockfile(lockTargetDir, includedFiles, excludedPatterns);
      break;
    }
    case 'ai':
      console.log(
        "'webs ai' is now integrated into 'webs dev'.\nStarting dev server and shell...",
      );
      await runBuildAndServe(config, true);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(
        'Available commands: dev, start, inspect, grep, analyze, lock',
      );
      process.exit(1);
  }
}

main().catch((e) => {
  logger.error('Fatal error:', e);
  process.exit(1);
});
