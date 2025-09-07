import { h, renderToString } from '../lib/renderer.js';
import { basename, join } from 'path';
import { createFileSystemForUser } from '../lib/fs.js';
import { stat, exists } from 'fs/promises';
import {
  getUserFromSession,
  registerUser,
  loginUser,
  logoutUser,
  createSession,
} from '../lib/auth.js';

const LOG_PREFIX = '[Serve] Server:';
const log = (...args) => console.log(LOG_PREFIX, ...args);
const warn = (...args) => console.warn(LOG_PREFIX, ...args);
const error = (...args) => console.error(LOG_PREFIX, ...args);

function renderHtmlShell({ appHtml, websState, manifest, title }) {
  const cssPath = manifest.css ? `/${basename(manifest.css)}` : '';
  const jsPath = manifest.js ? `/${basename(manifest.js)}` : '';

  log('Rendering HTML shell for', title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${cssPath ? `<link rel="stylesheet" href="${cssPath}">` : ''}
</head>
<body>
    <div id="root">${appHtml}</div>
    <script>window.__WEBS_STATE__ = ${JSON.stringify(websState)};</script>
    <script type="module" src="${jsPath}"></script>
</body>
</html>`;
}

async function executePrefetch(routeDefinition, context) {
  log(
    `Executing prefetch action for component '${routeDefinition.componentName}'...`,
  );
  if (!routeDefinition.actions?.prefetch) {
    warn('No prefetch action found.');
    return {};
  }
  try {
    const result = await routeDefinition.actions.prefetch(context);
    log('Prefetch action completed successfully.');
    return result;
  } catch (err) {
    error(
      `Prefetch Error for component "${routeDefinition.componentName}":`,
      err,
    );
    return { error: 'Failed to load data on the server.' };
  }
}

async function handleDataRequest(req, routeDefinition, context) {
  log(`Handling data request for route '${req.url}'`);
  const { db, user, params } = req;
  const { manifest } = context;
  const fs = user ? createFileSystemForUser(user.id, db) : null;

  const componentState = await executePrefetch(routeDefinition, {
    db,
    user,
    params,
    fs,
  });

  const websState = {
    user,
    params,
    componentState,
    componentName: routeDefinition.componentName,
    title: routeDefinition.component.name || 'Webs App',
    swPath: manifest.sw ? `/${basename(manifest.sw)}` : null,
  };
  log('Sending JSON response for data request.');
  return new Response(JSON.stringify(websState), {
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  });
}

async function handlePageRequest(req, routeDefinition, context) {
  log(`Handling page request for route '${req.url}'`);
  const { manifest, globalComponents } = context;
  const { db, user, params } = req;
  const fs = user ? createFileSystemForUser(user.id, db) : null;

  const initialState = await executePrefetch(routeDefinition, {
    db,
    user,
    params,
    fs,
  });

  const props = { user, params, initialState };

  const vnode = h(routeDefinition.component, props);
  vnode.appContext = { components: globalComponents || {} };

  log('Starting SSR with global components attached to app context.');
  const { html: appHtml, componentState } = await renderToString(vnode);
  log('Component rendered to string on server.');

  const websState = {
    user,
    params,
    componentState: componentState || initialState,
    componentName: routeDefinition.componentName,
    swPath: manifest.sw ? `/${basename(manifest.sw)}` : null,
  };
  const fullHtml = renderHtmlShell({
    appHtml,
    websState,
    manifest,
    title: routeDefinition.component.name || 'Webs App',
  });
  log('Sending full HTML page response.');
  return new Response(fullHtml, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

const authMiddleware = (db, isProd) => (req) => {
  req.db = db;
  const cookie = req.headers.get('cookie');
  const sessionId = cookie?.match(/session_id=([^;]+)/)?.[1];
  let user = getUserFromSession(db, sessionId);

  if (!isProd && !user) {
    const anonUser = db
      .query('SELECT id, username, email FROM users WHERE username = ?')
      .get('anon');
    if (anonUser) {
      const newSessionId = createSession(db, anonUser.id);
      user = anonUser;
      req.headers.set('X-Set-Dev-Session', newSessionId);
    }
  }
  req.user = user;
};

export async function startServer(serverContext) {
  const {
    db,
    dbConfig,
    manifest,
    isProd,
    appRoutes,
    port,
    SYNC_TOPIC,
    actionsPath,
    outdir,
    globalComponents,
  } = serverContext;
  let syncActions = {};
  if (await exists(actionsPath)) {
    const { registerActions } = await import(`${actionsPath}?t=${Date.now()}`);
    if (typeof registerActions === 'function')
      syncActions = registerActions(db);
  }

  const attachContext = authMiddleware(db, isProd);
  const sortedAppRoutePaths = Object.keys(appRoutes);

  log('Starting Webs server...');
  const server = Bun.serve({
    port,
    development: !isProd,
    async fetch(req, server) {
      const url = new URL(req.url);
      const { pathname } = url;
      log(`Received request for: ${pathname}`);

      if (pathname.includes('..')) {
        warn('Path traversal attempt detected.');
        return new Response('Forbidden', { status: 403 });
      }

      const potentialFilePath = join(outdir, pathname.substring(1));
      if (await exists(potentialFilePath)) {
        const stats = await stat(potentialFilePath);
        if (stats.isFile()) {
          log(`Serving static file: ${potentialFilePath}`);
          return new Response(Bun.file(potentialFilePath));
        }
      }

      attachContext(req);

      if (pathname.startsWith('/api/fs/') && req.method === 'PUT') {
        if (!req.user) {
          warn('Unauthorized FS write attempt.');
          return new Response('Unauthorized', { status: 401 });
        }

        const filePath = decodeURIComponent(
          pathname.substring('/api/fs/'.length),
        );
        if (!filePath) {
          warn('Missing file path for FS write.');
          return new Response('File path is required', { status: 400 });
        }

        const fs = createFileSystemForUser(req.user.id, db);
        const access = url.searchParams.get('access') || 'private';

        try {
          await fs.write(filePath, req.body, { access });

          const fileBlob = await fs.cat(filePath, { access });
          const fileContent = await fileBlob.arrayBuffer();
          const stats = await fs.stat(filePath, { access });

          const record = {
            path: filePath,
            user_id: req.user.id,
            content: fileContent,
            access: access,
            size: stats.size,
            last_modified: new Date().toISOString(),
          };

          const result = syncActions.upsertFiles({ user: req.user }, record);

          if (result?.broadcast) {
            server.publish(
              SYNC_TOPIC,
              JSON.stringify({ type: 'sync', data: result.broadcast }),
            );
          }
          log('FS write successful, broadcasting sync message.');
          return new Response(
            JSON.stringify({ success: true, path: filePath }),
            { status: 201 },
          );
        } catch (err) {
          error('[Upload Error]', err);
          return new Response(`Upload failed: ${err.message}`, {
            status: 500,
          });
        }
      }

      if (req.headers.get('upgrade') === 'websocket') {
        if (pathname === '/api/sync') {
          if (req.user) {
            log('Upgrading request to WebSocket for sync channel.');
            return server.upgrade(req, {
              data: { isSyncChannel: true, user: req.user },
            })
              ? undefined
              : new Response('Unauthorized', { status: 401 });
          } else {
            warn('WebSocket upgrade denied: User not authenticated.');
            return new Response('Unauthorized', { status: 401 });
          }
        }
      }

      if (pathname.startsWith('/api/auth/')) {
        log(`Handling auth request for: ${pathname}`);
        if (pathname.endsWith('/register')) return registerUser(req, db);
        if (pathname.endsWith('/login')) return loginUser(req, db);
        if (pathname.endsWith('/logout')) return logoutUser(req, db);
      }

      const actionMatch = pathname.match(/^\/__actions__\/(.+?)\/(.+?)$/);
      if (actionMatch) {
        log(`Handling client-side action call: ${pathname}`);
        if (!req.user) {
          warn('Unauthorized action call.');
          return new Response('Unauthorized', { status: 401 });
        }
        const [, componentName, actionName] = actionMatch;

        const routeDef = Object.values(appRoutes).find(
          (r) =>
            r.componentName === componentName ||
            r.component.name === componentName,
        );

        const action = routeDef?.component?.actions?.[actionName];

        if (typeof action !== 'function') {
          warn(`Action not found: ${actionName} on component ${componentName}`);
          return new Response('Action not found', { status: 404 });
        }
        try {
          const args = await req.json();
          const result = await action(
            {
              req,
              db,
              fs: createFileSystemForUser(req.user.id, db),
              user: req.user,
            },
            ...args,
          );
          log('Action executed successfully, sending JSON response.');
          return result instanceof Response ? result : Response.json(result);
        } catch (e) {
          error('Error executing action:', e);
          return new Response('Internal Server Error', { status: 500 });
        }
      }

      for (const path of sortedAppRoutePaths) {
        const routeDefinition = appRoutes[path];
        const paramNames = [];
        const processedPath = path.replace(/\/(:\w+\*)$/, '(?:/$1)?');
        const regex = new RegExp(
          `^${processedPath.replace(/:(\w+)(\*?)/g, (_, name, isCatchAll) => {
            paramNames.push(name);
            return isCatchAll === '*' ? '(.*)' : '([^/]+)';
          })}$`,
        );
        const match = pathname.match(regex);

        if (match) {
          log(`Matched request to route: '${path}'`);
          req.params = paramNames.reduce(
            (acc, name, i) => ({ ...acc, [name]: match[i + 1] || '' }),
            {},
          );
          const response = req.headers.get('X-Webs-Navigate')
            ? await handleDataRequest(req, routeDefinition, { manifest })
            : await handlePageRequest(req, routeDefinition, {
                manifest,
                globalComponents,
              });

          const devSessionId = req.headers.get('X-Set-Dev-Session');
          if (devSessionId) {
            response.headers.append(
              'Set-Cookie',
              `session_id=${devSessionId}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800`,
            );
          }
          return response;
        }
      }
      log('No route matched, returning 404.');
      return new Response('Not Found', { status: 404 });
    },
    websocket: {
      open(ws) {
        if (ws.data?.isSyncChannel) {
          log('WebSocket client connected and subscribed to sync topic.');
          ws.subscribe(SYNC_TOPIC);
        }
      },
      async message(ws, message) {
        if (!ws.data?.isSyncChannel) return;
        let payload;
        try {
          payload = JSON.parse(message);
          log('Received WebSocket message from client:', payload);
          const { opId, type } = payload;
          const user = ws.data.user;

          if (type && type.startsWith('fs:')) {
            const fs = createFileSystemForUser(user.id, db);
            const { path, data, options } = payload;
            let broadcastPayload;

            if (type === 'fs:write') {
              await fs.write(path, data, options);
              const stats = await fs.stat(path, options);
              const record = {
                path,
                user_id: user.id,
                content: data,
                access: options.access || 'private',
                size: stats.size,
                last_modified: stats.mtime.toISOString(),
              };
              broadcastPayload = syncActions.upsertFiles(
                { user },
                record,
              ).broadcast;
            } else if (type === 'fs:rm') {
              await fs.rm(path, options);
              broadcastPayload = syncActions.deleteFiles(
                { user },
                path,
              ).broadcast;
            }

            ws.send(JSON.stringify({ type: 'ack', opId }));
            if (broadcastPayload) {
              log(`Broadcasting FS change for op '${opId}'.`);
              server.publish(
                SYNC_TOPIC,
                JSON.stringify({ type: 'sync', data: broadcastPayload }),
              );
            }
          } else {
            const { tableName, data: recordData, id } = payload;
            if (
              !opId ||
              !type ||
              !tableName ||
              !dbConfig?.tables?.[tableName]?.sync
            )
              throw new Error('Invalid sync operation.');

            const actionName =
              type === 'put'
                ? `upsert${tableName.charAt(0).toUpperCase() + tableName.slice(1)}`
                : `delete${tableName.charAt(0).toUpperCase() + tableName.slice(1)}`;
            const actionFn = syncActions[actionName];
            if (!actionFn)
              throw new Error(`Sync action '${actionName}' not found.`);

            const result = await actionFn(
              { user },
              type === 'put' ? recordData : id,
            );
            if (result?.broadcast) {
              log(`Broadcasting database change for op '${opId}'.`);
              server.publish(
                SYNC_TOPIC,
                JSON.stringify({ type: 'sync', data: result.broadcast }),
              );
            }
            ws.send(JSON.stringify({ type: 'ack', opId }));
            log(`Sent acknowledgment for op '${opId}'.`);
          }
        } catch (e) {
          error('[Sync Error]', e.message);
          ws.send(
            JSON.stringify({
              type: 'sync-error',
              opId: payload?.opId,
              error: e.message,
            }),
          );
        }
      },
      close(ws) {
        if (ws.data?.isSyncChannel) {
          log('WebSocket client disconnected.');
          ws.unsubscribe(SYNC_TOPIC);
        }
      },
    },
    error: (err) => {
      error('Internal server error occurred:', err);
      return new Response('Internal Server Error', { status: 500 });
    },
  });

  console.log(`Server running at http://localhost:${server.port}`);
  return server;
}
