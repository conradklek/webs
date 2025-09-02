#!/usr/bin/env bun

import { watch } from 'fs';
import { rm, mkdir, exists } from 'fs/promises';
import { join, resolve } from 'path';
import { Database } from 'bun:sqlite';

import websPlugin from './plugin';
import tailwind from 'bun-plugin-tailwind';
import { createRequestHandler } from './server';

const CWD = process.cwd();

const config = {
  CWD,
  PORT: process.env.PORT || 3000,
  IS_PROD: process.env.NODE_ENV === 'production',
  OUTDIR: resolve(CWD, 'dist'),
  TMPDIR: resolve(CWD, '.tmp'),
  TMP_SERVER_DIR: resolve(CWD, '.tmp/server'),
  TMP_CSS: resolve(CWD, '.tmp/tmp.css'),
  TMP_APP_JS: resolve(CWD, '.tmp/app.js'),
  SRC_DIR: resolve(CWD, 'src'),
  APP_DIR: resolve(CWD, 'src/app'),
  GLOBAL_CSS_PATH: resolve(CWD, 'src/app.css'),
};

let hmrClients = new Set();
let hmrWatcher = null;
const SYNC_TOPIC = 'webs-sync';

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function cleanDirectory(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await ensureDir(dirPath);
}

async function createDatabase(Database, cwd) {
  const dbConfigPath = resolve(cwd, 'src/sql/db.js');
  let dbConfig;
  try {
    if (!(await exists(dbConfigPath))) return null;
    const dbSchemaModule = await import(`${dbConfigPath}?t=${Date.now()}`);
    dbConfig = dbSchemaModule.default;
  } catch (e) {
    console.error(`Could not load or parse src/sql/db.js:`, e);
    process.exit(1);
  }

  if (!dbConfig.name) {
    console.error('Database file name not specified in src/sql/db.js.');
    process.exit(1);
  }

  const db = new Database(resolve(cwd, dbConfig.name), { create: true });
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY);`,
  );

  const lastVersion =
    db.query('SELECT MAX(version) as version FROM _migrations').get()
      ?.version || 0;
  const newMigrations = (dbConfig.migrations || [])
    .filter((m) => m.version > lastVersion)
    .sort((a, b) => a.version - b.version);

  if (newMigrations.length > 0) {
    db.transaction(() => {
      for (const migration of newMigrations) {
        migration.up(db);
        db.query('INSERT INTO _migrations (version) VALUES (?)').run(
          migration.version,
        );
      }
    })();
    console.log(`Applied ${newMigrations.length} new database migration(s).`);
  }

  return db;
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

class ChatGateway {
  #server = null;
  #db = null;
  initialize(server, db) {
    this.#server = server;
    this.#db = db;
  }
  #publish(topic, payload) {
    this.#server.publish(topic.toLowerCase(), JSON.stringify(payload));
  }
  handleUpgrade(req) {
    const channel = new URL(req.url).searchParams.get('channel');
    if (!channel)
      return new Response("Missing 'channel' query parameter", { status: 400 });
    req.user = req.user || { id: null, username: 'anon' };
    return this.#server.upgrade(req, {
      data: {
        user: { id: req.user.id, username: req.user.username },
        channel: `#${channel.toLowerCase()}`,
        isChatChannel: true,
      },
    })
      ? undefined
      : new Response('WebSocket upgrade failed', { status: 500 });
  }
  handleOpen(ws) {
    ws.subscribe(ws.data.channel);
    this.#publish(ws.data.channel, {
      type: 'join',
      user: ws.data.user.username,
    });
  }
  handleMessage(ws, message) {
    const text = message.toString().trim();
    if (!text) return;
    try {
      this.#db
        .query(
          'INSERT INTO chat_messages (channel, username, message, user_id) VALUES (?, ?, ?, ?)',
        )
        .run(ws.data.channel, ws.data.user.username, text, ws.data.user.id);
      this.#publish(ws.data.channel, {
        type: 'message',
        from: ws.data.user.username,
        text,
      });
    } catch (error) {
      console.error(`[ChatGateway] Database error: ${error.message}`);
    }
  }
  handleClose(ws) {
    if (ws.data.user?.username && ws.data.channel)
      this.#publish(ws.data.channel, {
        type: 'part',
        user: ws.data.user.username,
      });
  }
}
const chat = new ChatGateway();

async function buildServerComponents() {
  const glob = new Bun.Glob('**/*.webs');
  const entrypoints = [];
  if (await exists(config.APP_DIR)) {
    for await (const file of glob.scan(config.APP_DIR)) {
      entrypoints.push(join(config.APP_DIR, file));
    }
  }
  if (entrypoints.length === 0) return { success: true, entrypoints: [] };

  const result = await Bun.build({
    entrypoints,
    outdir: config.TMP_SERVER_DIR,
    target: 'bun',
    plugins: [websPlugin(config), tailwind],
    external: ['@conradklek/webs', 'bun-plugin-tailwind'],
  });

  if (!result.success) {
    console.error('Server component compilation failed:', result.logs);
  }
  return { success: result.success, entrypoints };
}

async function prepareCss() {
  const glob = new Bun.Glob('**/*.webs');
  const componentStyles = [];
  if (!(await exists(config.SRC_DIR))) return '';

  const styleBlockRegex = /<style>([\s\S]*?)<\/style>/s;
  for await (const file of glob.scan(config.SRC_DIR)) {
    const src = await Bun.file(join(config.SRC_DIR, file)).text();
    const styleMatch = src.match(styleBlockRegex);
    if (styleMatch?.[1]?.trim()) {
      componentStyles.push(styleMatch[1].trim());
    }
  }
  const globalCss = (await exists(config.GLOBAL_CSS_PATH))
    ? await Bun.file(config.GLOBAL_CSS_PATH).text()
    : '';

  await Bun.write(
    config.TMP_CSS,
    `${globalCss}\n${componentStyles.join('\n')}`,
  );
}

async function prepareClientEntrypoint(pageEntrypoints) {
  const glob = new Bun.Glob('**/*.js');
  const componentLoaders = [];
  const pageComponentNames = new Set(
    pageEntrypoints.map((p) =>
      p.replace(`${config.APP_DIR}/`, '').replace('.webs', ''),
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

  const entrypointContent = `import { hydrate } from '@conradklek/webs';
import './tmp.css';

const componentLoaders = new Map([
  ${componentLoaders.join(',\n  ')}
]);

hydrate(componentLoaders);
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

async function buildServiceWorker(clientOutputs, appRoutes) {
  const swUserPath = resolve(config.CWD, 'cache.js');
  const swFrameworkPath = resolve(import.meta.dir, 'cache.js');
  const swEntryPath = (await exists(swUserPath)) ? swUserPath : swFrameworkPath;

  if (!(await exists(swEntryPath))) {
    console.warn('Service worker not found, skipping SW build.');
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

async function buildClientAndNotify(appRoutes, changedFile, pageEntrypoints) {
  await prepareClientEntrypoint(pageEntrypoints);
  await prepareCss();

  const clientBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS, config.TMP_CSS],
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

  if (changedFile) {
    hmrClients.forEach((ws) => ws.send(JSON.stringify({ type: 'update' })));
    console.log(`[HMR] Reloaded due to change in ${changedFile}`);
  }

  const swOutput = await buildServiceWorker(
    clientBuildResult.outputs,
    appRoutes,
  );
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
  if (!(await exists(config.TMP_SERVER_DIR))) {
    return {};
  }
  const pageFiles = new Set(
    (pageEntrypoints || []).map((p) =>
      p.replace(`${config.APP_DIR}/`, '').replace('.webs', '.js'),
    ),
  );
  const glob = new Bun.Glob('**/*.js');
  const routeDefinitions = [];

  for await (const file of glob.scan(config.TMP_SERVER_DIR)) {
    if (!pageFiles.has(file)) continue;

    const mod = await import(
      `${join(config.TMP_SERVER_DIR, file)}?t=${Date.now()}`
    );
    if (!mod.default) {
      console.warn(`[Skipping] ${file} does not have a default export.`);
      continue;
    }

    let urlPath = file
      .replace(/\.js$/, '')
      .replace(/index$/, '')
      .replace(/\[(\w+)\]/g, ':$1');

    if (urlPath.endsWith('/')) urlPath = urlPath.slice(0, -1);
    if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;
    if (urlPath === '') urlPath = '/';

    routeDefinitions.push({
      path: urlPath,
      definition: {
        component: mod.default,
        componentName: file.replace(/\.js$/, ''),
        middleware: mod.middleware || [],
        websocket: mod.default.websocket || null,
      },
    });
  }

  routeDefinitions.sort((a, b) => {
    const aSegments = a.path.split('/').length;
    const bSegments = b.path.split('/').length;
    if (aSegments !== bSegments) return bSegments - aSegments;
    return (
      (a.path.match(/:/g) || []).length - (b.path.match(/:/g) || []).length
    );
  });

  return routeDefinitions.reduce((acc, { path, definition }) => {
    acc[path] = definition;
    return acc;
  }, {});
}

function findRouteMatch(appRoutes, pathname) {
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
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

/**
 * Starts the Bun server.
 */
function startServer(serverContext) {
  const { db, appRoutes, outdir, manifest, isProd } = serverContext;
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
        if (!isProd && url.pathname === '/hmr-ws') {
          return server.upgrade(req, { data: { isHmrChannel: true } })
            ? undefined
            : new Response('HMR upgrade failed', { status: 400 });
        }
        if (url.pathname === '/ws/chat') {
          return chat.handleUpgrade(req);
        }
        if (url.pathname === '/api/sync') {
          return server.upgrade(req, { data: { isSyncChannel: true } })
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
        if (ws.data?.isHmrChannel) {
          hmrClients.add(ws);
        } else if (ws.data?.isChatChannel) {
          chat.handleOpen(ws);
        } else if (ws.data?.isSyncChannel) {
          ws.subscribe(SYNC_TOPIC);
        } else {
          appRoutes[ws.data.routePath]?.websocket?.open?.(ws, {
            db,
            user: ws.data.user,
          });
        }
      },
      message(ws, message) {
        if (ws.data?.isChatChannel) {
          chat.handleMessage(ws, message);
        } else if (ws.data?.isSyncChannel) {
          ws.publish(SYNC_TOPIC, message);
        } else {
          appRoutes[ws.data.routePath]?.websocket?.message?.(ws, message, {
            db,
            user: ws.data.user,
          });
        }
      },
      close(ws, code, reason) {
        if (ws.data?.isHmrChannel) {
          hmrClients.delete(ws);
        } else if (ws.data?.isChatChannel) {
          chat.handleClose(ws);
        } else if (ws.data?.isSyncChannel) {
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

  chat.initialize(server, db);
  console.log(`Server running at http://localhost:${server.port}`);
  return server;
}

async function runFullBuild(appRoutes) {
  await ensureDir(config.TMPDIR);
  if (config.IS_PROD) await cleanDirectory(config.OUTDIR);

  const { success, entrypoints } = await buildServerComponents();
  if (!success) return { manifest: null, entrypoints: [] };

  const manifest = await buildClientAndNotify(appRoutes, null, entrypoints);
  return { manifest, entrypoints };
}

async function main() {
  const serverContext = {
    db: await createDatabase(Database, config.CWD),
    appRoutes: {},
    outdir: config.OUTDIR,
    manifest: {},
    isProd: config.IS_PROD,
  };

  const { manifest, entrypoints } = await runFullBuild(serverContext.appRoutes);
  if (!manifest) {
    console.error('Initial build failed. Server will not start.');
    if (config.IS_PROD) process.exit(1);
    return;
  }
  serverContext.manifest = manifest;
  serverContext.appRoutes = await generateRoutesFromFileSystem(entrypoints);

  const server = startServer(serverContext);

  if (!config.IS_PROD) {
    hmrWatcher = watch(
      config.SRC_DIR,
      { recursive: true },
      async (_, filename) => {
        if (
          filename &&
          (filename.endsWith('.webs') || filename.endsWith('.css'))
        ) {
          const { success, entrypoints } = await buildServerComponents();
          if (success) {
            serverContext.appRoutes =
              await generateRoutesFromFileSystem(entrypoints);
            const newManifest = await buildClientAndNotify(
              serverContext.appRoutes,
              filename,
              entrypoints,
            );
            if (newManifest) serverContext.manifest = newManifest;
          }
        }
      },
    );

    const cleanup = () => {
      if (hmrWatcher) hmrWatcher.close();
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
