#!/usr/bin/env bun

import { rm, mkdir, exists, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { Database } from 'bun:sqlite';

import websPlugin from './plugin';
import tailwind from 'bun-plugin-tailwind';
import { createRequestHandler, createDatabaseAndActions } from './server';

const FRAMEWORK_DIR = import.meta.dir;
const CWD = process.cwd();

console.log(`[Webs] Framework location: ${FRAMEWORK_DIR}`);
console.log(`[Webs] Building project at: ${CWD}`);

const globalCssExists = await exists(resolve(CWD, 'src/app.css'));

const config = {
  CWD,
  PORT: process.env.PORT || 3000,
  IS_PROD: process.env.NODE_ENV === 'production',
  OUTDIR: resolve(CWD, 'dist'),
  TMPDIR: resolve(CWD, '.webs'),
  TMP_SERVER_DIR: resolve(CWD, '.webs/server'),
  TMP_GENERATED_ACTIONS: resolve(CWD, '.webs/generated-actions.js'),
  TMP_COMPONENT_MANIFEST: resolve(CWD, '.webs/component-manifest.js'),
  TMP_CSS: resolve(CWD, '.webs/tmp.css'),
  TMP_APP_JS: resolve(CWD, '.webs/app.js'),
  SRC_DIR: resolve(CWD, 'src'),
  APP_DIR: resolve(CWD, 'src/app'),
  GUI_DIR: resolve(CWD, 'src/gui'),
  GLOBAL_CSS_PATH: globalCssExists ? resolve(CWD, 'src/app.css') : null,
};

const SYNC_TOPIC = 'webs-sync';
let appRoutes = {};
let dbConfig = null;

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function cleanDirectory(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await ensureDir(dirPath);
}

async function loadDbConfig(cwd) {
  const dbConfigPath = resolve(cwd, 'src/sql/db.js');
  try {
    if (!(await exists(dbConfigPath))) return null;
    const dbSchemaModule = await import(`${dbConfigPath}?t=${Date.now()}`);
    return dbSchemaModule.default;
  } catch (e) {
    console.error(`Could not load or parse src/sql/db.js:`, e);
    process.exit(1);
  }
}

function getUserFromSession(db, sessionId) {
  if (!sessionId) return null;
  const session = db
    .query('SELECT user_id, expires_at FROM sessions WHERE id = ?')
    .get(sessionId);

  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) db.query('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return db
    .query('SELECT id, username, email FROM users WHERE id = ?')
    .get(session.user_id);
}

async function buildServerComponents() {
  const glob = new Bun.Glob('**/*.webs');
  const entrypoints = [];

  if (await exists(config.APP_DIR)) {
    console.log(`[Webs] Scanning for components in: ${config.APP_DIR}`);
    for await (const file of glob.scan(config.APP_DIR)) {
      entrypoints.push(join(config.APP_DIR, file));
    }
  }
  if (await exists(config.GUI_DIR)) {
    console.log(`[Webs] Scanning for components in: ${config.GUI_DIR}`);
    for await (const file of glob.scan(config.GUI_DIR)) {
      entrypoints.push(join(config.GUI_DIR, file));
    }
  }

  console.log(`[Webs] Found ${entrypoints.length} component entrypoints.`);
  if (entrypoints.length === 0) {
    return { success: true, entrypoints: [], pageEntrypoints: [] };
  }

  const result = await Bun.build({
    entrypoints,
    outdir: config.TMP_SERVER_DIR,
    target: 'bun',
    plugins: [websPlugin(config), tailwind],
    external: ['@conradklek/webs', 'bun-plugin-tailwind'],
    naming: '[dir]/[name].[ext]',
    root: config.SRC_DIR,
  });

  if (!result.success) {
    console.error('Server component compilation failed:', result.logs);
  }

  const pageEntrypoints = entrypoints.filter((p) =>
    p.startsWith(config.APP_DIR),
  );
  return { success: result.success, entrypoints, pageEntrypoints };
}

async function prepareCss() {
  const glob = new Bun.Glob('**/*.webs');
  const componentStyles = [];
  if (config.GLOBAL_CSS_PATH) {
    const globalCss = await Bun.file(config.GLOBAL_CSS_PATH).text();
    componentStyles.push(globalCss);
  }
  if (await exists(config.SRC_DIR)) {
    const styleBlockRegex = /<style>([\s\S]*?)<\/style>/s;
    for await (const file of glob.scan(config.SRC_DIR)) {
      const src = await Bun.file(join(config.SRC_DIR, file)).text();
      const styleMatch = src.match(styleBlockRegex);
      if (styleMatch?.[1]?.trim()) {
        componentStyles.push(styleMatch[1].trim());
      }
    }
  }

  await Bun.write(config.TMP_CSS, componentStyles.join('\n'));
}

async function prepareClientEntrypoint(allEntrypoints) {
  const componentLoaders = [];
  const componentNames = new Set(
    allEntrypoints.map((p) =>
      resolve(p)
        .substring(config.SRC_DIR.length + 1)
        .replace('.webs', ''),
    ),
  );

  const glob = new Bun.Glob('**/*.js');
  if (await exists(config.TMP_SERVER_DIR)) {
    for await (const file of glob.scan(config.TMP_SERVER_DIR)) {
      const fullPath = resolve(config.TMP_SERVER_DIR, file);
      const componentName = fullPath
        .substring(config.TMP_SERVER_DIR.length + 1)
        .replace('.js', '');

      if (componentNames.has(componentName)) {
        const relativePath = join(config.TMP_SERVER_DIR, file);
        componentLoaders.push(
          `['${componentName}', () => import('${relativePath}')]`,
        );
      }
    }
  }

  const dbConfigPath = resolve(CWD, 'src/sql/db.js');
  const dbConfigImport = (await exists(dbConfigPath))
    ? `import dbConfig from '${dbConfigPath}';`
    : 'const dbConfig = null;';

  const entrypointContent = `import { hydrate } from '@conradklek/webs';
import '${config.TMP_CSS}';
${dbConfigImport}

const componentLoaders = new Map([
  ${componentLoaders.join(',\n  ')}
]);

hydrate(componentLoaders, dbConfig);
`;
  await Bun.write(config.TMP_APP_JS, entrypointContent);
}

async function compressAssets(outputs) {
  if (!config.IS_PROD) return {};
  const sizes = {};
  await Promise.all(
    outputs.map(async (output) => {
      if (/\.(js|css|html)$/.test(output.path)) {
        const content = await output.arrayBuffer();
        const compressed = Bun.gzipSync(content);
        await Bun.write(`${output.path}.gz`, compressed);
        sizes[output.path.replace(`${config.OUTDIR}/`, '')] =
          compressed.byteLength;
      }
    }),
  );
  return sizes;
}

async function buildServiceWorker(clientOutputs) {
  const swUserPath = resolve(CWD, 'cache.js');
  const swFrameworkPath = resolve(FRAMEWORK_DIR, 'cache.js');
  const swEntryPath = (await exists(swUserPath)) ? swUserPath : swFrameworkPath;

  if (!(await exists(swEntryPath))) {
    return null;
  }

  const swBuildResult = await Bun.build({
    entrypoints: [swEntryPath],
    outdir: config.OUTDIR,
    target: 'browser',
    minify: config.IS_PROD,
    naming: config.IS_PROD ? 'sw-[hash].js' : 'sw.js',
    sourcemap: 'none',
  });

  if (!swBuildResult.success) {
    console.error('Service worker build failed:', swBuildResult.logs);
    return null;
  }

  const swOutput = swBuildResult.outputs[0];
  const assetManifest = clientOutputs.map((o) => ({
    url: `/${o.path.split('/').pop()}`,
    revision: null,
  }));
  const routeManifest = Object.keys(appRoutes).map((routePath) => ({
    url: routePath,
    revision: null,
  }));
  if (!appRoutes['/']) routeManifest.push({ url: '/', revision: null });

  const fullManifest = [...assetManifest, ...routeManifest];
  let swContent = await swOutput.text();
  swContent =
    `self.__WEBS_MANIFEST = ${JSON.stringify(fullManifest, null, 2)};\n` +
    swContent;
  await Bun.write(swOutput.path, swContent);

  return swOutput;
}

async function buildClientAndNotify(entrypoints) {
  await prepareClientEntrypoint(entrypoints);
  await prepareCss();

  const clientBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [websPlugin(config), tailwind],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
  });

  if (!clientBuildResult.success) {
    console.error('Client app build failed:', clientBuildResult.logs);
    return null;
  }

  const swOutput = await buildServiceWorker(clientBuildResult.outputs);
  const allOutputs = [
    ...clientBuildResult.outputs,
    ...(swOutput ? [swOutput] : []),
  ];

  const manifest = {
    js: clientBuildResult.outputs
      .find((o) => o.kind === 'entry-point' && o.path.endsWith('.js'))
      ?.path.replace(`${config.OUTDIR}/`, ''),
    css: clientBuildResult.outputs
      .find((o) => o.path.endsWith('.css'))
      ?.path.replace(`${config.OUTDIR}/`, ''),
    sw: swOutput?.path.replace(`${config.OUTDIR}/`, ''),
  };

  if (config.IS_PROD) {
    manifest.sizes = await compressAssets(allOutputs);
  }

  return manifest;
}

async function generateRoutesFromFileSystem(pageEntrypoints) {
  console.log('[Webs] Generating routes from server components...');
  if (!(await exists(config.TMP_SERVER_DIR))) {
    return {};
  }

  const pageFiles = new Set(
    (pageEntrypoints || []).map((p) => p.substring(config.SRC_DIR.length + 1)),
  );

  const glob = new Bun.Glob('**/*.js');
  const routeDefinitions = [];
  const actionDefinitions = {};

  if (await exists(config.TMP_GENERATED_ACTIONS)) {
    const generatedActionsModule = await import(
      `${config.TMP_GENERATED_ACTIONS}?t=${Date.now()}`
    );
    Object.assign(actionDefinitions, generatedActionsModule);
  }

  for await (const file of glob.scan(config.TMP_SERVER_DIR)) {
    const fullPath = resolve(config.TMP_SERVER_DIR, file);
    const relativePath = fullPath.substring(config.TMP_SERVER_DIR.length + 1);

    if (pageFiles.has(relativePath.replace('.js', '.webs'))) {
      const mod = await import(`${fullPath}?t=${Date.now()}`);
      if (!mod.default) {
        continue;
      }

      let componentName = relativePath.replace('.js', '');

      let urlPath = componentName
        .substring('app/'.length)
        .replace(/index$/, '')
        .replace(/\[(\w+)\]/g, ':$1');

      if (urlPath.endsWith('/')) urlPath = urlPath.slice(0, -1);
      if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;
      if (urlPath === '') urlPath = '/';

      routeDefinitions.push({
        path: urlPath,
        definition: {
          component: mod.default,
          actions: { ...mod.default.actions, ...actionDefinitions },
          componentName: componentName,
          middleware: mod.middleware || [],
          websocket: mod.default.websocket || null,
        },
      });
    }
  }

  routeDefinitions.sort((a, b) => {
    const aSegments = a.path.split('/').length;
    const bSegments = b.path.split('/').length;
    if (aSegments !== bSegments) return bSegments - aSegments;
    return (
      (a.path.match(/:/g) || []).length - (b.path.match(/:/g) || []).length
    );
  });

  const finalRoutes = routeDefinitions.reduce((acc, { path, definition }) => {
    acc[path] = definition;
    return acc;
  }, {});

  console.log(`[Webs] Generated ${routeDefinitions.length} page routes.`);
  Object.keys(finalRoutes).forEach((routePath) => {
    console.log(
      `[Webs] --> Route: ${routePath}, Component: ${finalRoutes[routePath].componentName}`,
    );
  });

  return { finalRoutes, actionDefinitions };
}

function findRouteMatch(appRoutes, pathname) {
  const normalizedPathname =
    pathname && pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  if (typeof normalizedPathname !== 'string') return null;

  for (const routePath in appRoutes) {
    const paramNames = [];
    const regexPath =
      '^' +
      routePath.replace(/:(\w+)/g, (_, paramName) => {
        paramNames.push(paramName);
        return '([^/]+)';
      }) +
      '/?$';
    const match = normalizedPathname.match(new RegExp(regexPath));

    if (match) {
      const params = paramNames.reduce((acc, name, index) => {
        acc[name] = decodeURIComponent(match[index + 1]);
        return acc;
      }, {});
      return { routeDefinition: appRoutes[routePath], params, path: routePath };
    }
  }
  return null;
}

function startServer(serverContext) {
  const { db, dbConfig, outdir, manifest, isProd } = serverContext;
  const authMiddleware = (req) => {
    req.db = db;
    const sessionId = req.headers
      .get('cookie')
      ?.match(/session_id=([^;]+)/)?.[1];
    req.user = getUserFromSession(db, sessionId);
  };
  const requestHandler = createRequestHandler(
    { outdir, manifest, appRoutes, isProd },
    findRouteMatch,
  );

  const server = Bun.serve({
    port: config.PORT,
    development: !isProd,
    fetch(req, server) {
      authMiddleware(req);
      const url = new URL(req.url);

      if (req.headers.get('upgrade') === 'websocket') {
        if (url.pathname === '/api/sync') {
          const user = getUserFromSession(
            db,
            req.headers.get('cookie')?.match(/session_id=([^;]+)/)?.[1],
          );
          if (!user) return new Response('Unauthorized', { status: 401 });
          return server.upgrade(req, {
            data: { isSyncChannel: true, user, id: crypto.randomUUID() },
          })
            ? undefined
            : new Response('Sync upgrade failed', { status: 400 });
        }
        const routeMatch = findRouteMatch(appRoutes, url.pathname);
        if (routeMatch?.routeDefinition.websocket) {
          return server.upgrade(req, {
            data: { routePath: routeMatch.path, user: req.user },
          });
        }
      }
      return requestHandler(req);
    },
    websocket: {
      open(ws) {
        if (ws.data?.isSyncChannel) {
          ws.subscribe(SYNC_TOPIC);
        } else {
          appRoutes[ws.data.routePath]?.websocket?.open?.(ws, {
            db,
            user: ws.data.user,
          });
        }
      },
      async message(ws, message) {
        if (ws.data?.isSyncChannel) {
          let payload;
          try {
            payload = JSON.parse(message);
            const { tableName, type, data, id, opId } = payload;

            if (!tableName || !type || !opId) return;

            const tableConfig = dbConfig?.tables?.find(
              (t) => t.name === tableName,
            );
            if (!tableConfig || !tableConfig.sync) {
              throw new Error(
                `Table '${tableName}' is not configured for syncing. Add a 'sync' property in your db.js config.`,
              );
            }

            const actionName =
              type === 'put'
                ? `upsert${tableConfig.name.charAt(0).toUpperCase() + tableConfig.name.slice(1)}`
                : `delete${tableConfig.name.charAt(0).toUpperCase() + tableConfig.name.slice(1)}`;

            const actionArg = type === 'put' ? data : id;

            const actionFn = serverContext.actionDefinitions[actionName];

            if (actionFn) {
              const actionContext = { db, user: ws.data.user };
              const result = await actionFn(actionContext, actionArg);

              ws.send(JSON.stringify({ type: 'ack', opId }));

              if (result && result.broadcast) {
                server.publish(
                  SYNC_TOPIC,
                  JSON.stringify({ type: 'sync', data: result.broadcast }),
                );
              }
            } else {
              throw new Error(`Action '${actionName}' not found.`);
            }
          } catch (e) {
            console.error('[Sync Error] Failed to process message:', e.message);
            ws.send(
              JSON.stringify({
                type: 'sync-error',
                opId: payload?.opId,
                error: e.message,
              }),
            );
          }
        } else {
          appRoutes[ws.data.routePath]?.websocket?.message?.(ws, message, {
            db,
            user: ws.data.user,
          });
        }
      },
      close(ws, code, reason) {
        if (ws.data?.isSyncChannel) {
        } else {
          appRoutes[ws.data.routePath]?.websocket?.close?.(ws, code, reason, {
            db,
            user: ws.data.user,
          });
        }
      },
    },
    error: (error) => {
      console.error(error);
      return new Response('Internal Server Error', { status: 500 });
    },
  });

  console.log(`Server running at http://localhost:${server.port}`);
  return server;
}

async function runFullBuild() {
  if (config.IS_PROD) await cleanDirectory(config.OUTDIR);

  const { success, entrypoints, pageEntrypoints } =
    await buildServerComponents();
  if (!success) {
    console.error('Initial build failed. Server will not start.');
    return { manifest: null, entrypoints: [], pageEntrypoints: [] };
  }

  const manifest = await buildClientAndNotify(entrypoints);
  return { manifest, entrypoints, pageEntrypoints };
}

async function main() {
  await ensureDir(config.TMPDIR);

  dbConfig = await loadDbConfig(config.CWD);
  const db = await createDatabaseAndActions(
    Database,
    dbConfig,
    config.CWD,
    writeFile,
    config,
  );

  const serverContext = {
    db: db,
    dbConfig,
    outdir: config.OUTDIR,
    manifest: {},
    isProd: config.IS_PROD,
    actionDefinitions: {},
  };

  const { manifest, pageEntrypoints } = await runFullBuild();
  if (!manifest) {
    console.error('Initial build failed. Server will not start.');
    if (config.IS_PROD) process.exit(1);
    return;
  }
  serverContext.manifest = manifest;
  const { finalRoutes, actionDefinitions } =
    await generateRoutesFromFileSystem(pageEntrypoints);
  appRoutes = finalRoutes;
  serverContext.actionDefinitions = actionDefinitions;

  const server = startServer(serverContext);

  if (!config.IS_PROD) {
    const cleanup = () => {
      server.stop();
      console.log('\n gracefully shutting down...');
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

main().catch((e) => {
  console.error('An unexpected error occurred:', e);
  process.exit(1);
});
