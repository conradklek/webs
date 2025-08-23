#!/usr/bin/env bun

import { exists } from 'fs/promises';
import { Database } from 'bun:sqlite';
import { createRequestHandler } from '../src/server.js';
import { performBuild } from '../scripts/build.js';
import { config } from '../src/config.js';
import { join, relative } from 'path';
import { getUserFromSession } from '../src/auth.js';
import { createDatabase } from '../src/db-server.js';

function findRouteMatch(appRoutes, pathname) {
  for (const routePath in appRoutes) {
    const routeDefinition = appRoutes[routePath];
    const paramNames = [];
    const regexPath =
      '^' +
      routePath.replace(/:(\w+)/g, (_, paramName) => {
        paramNames.push(paramName);
        return '([^\\/]+)';
      }) +
      '\\/?$';

    const match = pathname.match(new RegExp(regexPath));

    if (match) {
      const params = {};
      paramNames.forEach((name, index) => {
        params[name] = match[index + 1];
      });
      return { routeDefinition, params, path: routePath };
    }
  }
  return null;
}

async function generateRoutesFromFileSystem() {
  console.log('--- Scanning for routes in src/app ---');
  const appDir = config.APP_DIR;
  if (!(await exists(appDir))) {
    console.warn(
      `[Warning] App directory not found at ${appDir}. No routes will be generated.`,
    );
    return {};
  }

  const glob = new Bun.Glob('**/*.js');
  const routeDefinitions = [];

  for await (const file of glob.scan(appDir)) {
    const fullPath = join(appDir, file);
    const module = await import(`${fullPath}?t=${Date.now()}`);

    if (!module.default) {
      console.warn(`[Skipping] ${file} does not have a default export.`);
      continue;
    }

    let urlPath = relative(appDir, fullPath)
      .replace(/\.js$/, '')
      .replace(/\[(\w+)\]/g, ':$1');

    if (urlPath.endsWith('index')) {
      urlPath = urlPath.slice(0, -5) || '/';
    }
    if (urlPath !== '/' && urlPath.endsWith('/')) {
      urlPath = urlPath.slice(0, -1);
    }
    if (!urlPath.startsWith('/')) {
      urlPath = '/' + urlPath;
    }

    routeDefinitions.push({
      path: urlPath,
      definition: {
        component: module.default,
        componentName: relative(appDir, fullPath).replace(/\.js$/, ''),
        middleware: module.middleware || [],
        websocket: module.default.websocket || null,
      },
    });
  }

  routeDefinitions.sort((a, b) => {
    const aDyn = (a.path.match(/:/g) || []).length;
    const bDyn = (b.path.match(/:/g) || []).length;
    if (aDyn !== bDyn) return aDyn - bDyn;
    return b.path.length - a.path.length;
  });

  const appRoutes = routeDefinitions.reduce((acc, { path, definition }) => {
    acc[path] = definition;
    return acc;
  }, {});

  console.log('--- Discovered Routes ---');
  console.log(Object.keys(appRoutes).join('\n') || 'No routes found.');

  return appRoutes;
}

async function main() {
  const serverContext = {
    db: await createDatabase(Database, config.CWD),
    appRoutes: {},
    outdir: config.OUTDIR,
    manifest: {},
    isProd: config.IS_PROD,
    sync: {
      clients: new Set(),
      statements: {},
      broadcast(message) {
        for (const client of this.clients) {
          client.send(message);
        }
      },
    },
  };

  let requestHandler = null;

  async function buildAndReload() {
    serverContext.appRoutes = await generateRoutesFromFileSystem();

    const manifest = await performBuild();
    if (!manifest) {
      console.error('Build failed, server will not start or reload.');
      return;
    }
    serverContext.manifest = manifest;
    console.log('Manifest updated:', JSON.stringify(manifest, null, 2));

    requestHandler = createRequestHandler(serverContext, findRouteMatch);
    console.log('Request handler updated.');
  }

  await buildAndReload();

  Bun.serve({
    port: config.PORT,
    development: !config.IS_PROD,
    fetch: (req, server) => {
      const url = new URL(req.url);
      const sessionId = req.headers
        .get('cookie')
        ?.match(/session_id=([^;]+)/)?.[1];
      const user = getUserFromSession(serverContext.db, sessionId);

      if (req.headers.get('upgrade') === 'websocket') {
        if (url.pathname === '/api/sync') {
          const success = server.upgrade(req, {
            data: { user, isSyncChannel: true },
          });
          return success
            ? undefined
            : new Response('Sync upgrade failed', { status: 400 });
        }

        const routeMatch = findRouteMatch(
          serverContext.appRoutes,
          url.pathname,
        );
        if (routeMatch && routeMatch.routeDefinition.websocket) {
          const success = server.upgrade(req, {
            data: { routePath: routeMatch.path, user },
          });
          return success
            ? undefined
            : new Response('WebSocket upgrade failed', { status: 400 });
        }
      }

      return requestHandler(req);
    },
    websocket: {
      open(ws) {
        const { user, isSyncChannel, routePath } = ws.data;
        if (isSyncChannel) {
          console.log('[Sync WS] Client connected.');
          serverContext.sync.clients.add(ws);
          ws.data.user = user;
        } else {
          const routeDef = serverContext.appRoutes[routePath];
          if (routeDef?.websocket?.open) {
            routeDef.websocket.open(ws, { db: serverContext.db, user });
          }
        }
      },
      async message(ws, message) {
        const { user, isSyncChannel, routePath } = ws.data;

        if (isSyncChannel) {
          console.log('[Sync WS] Message received:', message);
          const { tableName, type, data, id } = JSON.parse(message);

          try {
            const component = Object.values(serverContext.appRoutes).find(
              (r) => r.componentName === tableName,
            );
            if (!component) {
              throw new Error(
                `Component not found for tableName: ${tableName}`,
              );
            }

            if (type === 'put' && component.component?.actions?.upsertTodo) {
              await component.component.actions.upsertTodo(
                { db: serverContext.db, user },
                data,
              );
              serverContext.sync.broadcast(message);
            } else if (
              type === 'delete' &&
              component.component?.actions?.deleteTodo
            ) {
              await component.component.actions.deleteTodo(
                { db: serverContext.db, user },
                id,
              );
              serverContext.sync.broadcast(message);
            }
          } catch (e) {
            console.error('[Sync WS] Error processing message:', e);
          }
        } else {
          const routeDef = serverContext.appRoutes[routePath];
          if (routeDef?.websocket?.message) {
            routeDef.websocket.message(ws, message, {
              db: serverContext.db,
              user,
            });
          }
        }
      },
      close(ws, code, reason) {
        const { isSyncChannel, routePath } = ws.data;
        if (isSyncChannel) {
          console.log(
            `[Sync WS] Client disconnected. Code: ${code}, Reason: ${reason}`,
          );
          serverContext.sync.clients.delete(ws);
        } else {
          const routeDef = serverContext.appRoutes[routePath];
          if (routeDef?.websocket?.close) {
            routeDef.websocket.close(ws, code, reason, {
              db: serverContext.db,
              user: ws.data.user,
            });
          }
        }
      },
    },
    error: (error) => {
      console.error(error);
      return new Response('Internal Server Error', { status: 500 });
    },
  });

  console.log(`--- Server ready at http://localhost:${config.PORT} ---`);
}

main().catch(console.error);
