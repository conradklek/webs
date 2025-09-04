import { h, renderToString } from './webs-renderer.js';
import { basename, join } from 'path';
import { createFileSystemForUser } from './server-fs';
import { exists } from 'fs/promises';
import { stat } from 'fs/promises';
import {
  getUserFromSession,
  registerUser,
  loginUser,
  logoutUser,
  createSession,
} from './server-me';

function renderHtmlShell({ appHtml, websState, manifest, title }) {
  const cssPath = manifest.css ? `/${basename(manifest.css)}` : '';
  const jsPath = manifest.js ? `/${basename(manifest.js)}` : '';

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

async function handleDataRequest(req, routeDefinition) {
  const { db, user, params } = req;
  const fs = user ? createFileSystemForUser(user.id) : null;
  let componentState = {};
  if (routeDefinition.component?.actions?.ssrFetch) {
    componentState = await routeDefinition.component.actions.ssrFetch({
      db,
      user,
      params,
      fs,
    });
  }
  const websState = {
    user,
    params,
    componentState,
    componentName: routeDefinition.componentName,
    title: routeDefinition.component.name || 'Webs App',
  };
  return new Response(JSON.stringify(websState), {
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  });
}

async function handlePageRequest(req, routeDefinition, context) {
  const { manifest } = context;
  const { db, user, params } = req;
  let initialState = {};
  const fs = user ? createFileSystemForUser(user.id) : null;

  if (routeDefinition.component?.actions?.ssrFetch) {
    initialState = await routeDefinition.component.actions.ssrFetch({
      db,
      user,
      params,
      fs,
    });
  }

  const props = { user, params, initialState };
  const { html: appHtml, componentState } = await renderToString(
    h(routeDefinition.component, props),
  );

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
  } = serverContext;
  let syncActions = {};
  if (await exists(actionsPath)) {
    const { registerActions } = await import(`${actionsPath}?t=${Date.now()}`);
    if (typeof registerActions === 'function')
      syncActions = registerActions(db);
  }

  const attachContext = authMiddleware(db, isProd);
  const sortedAppRoutePaths = Object.keys(appRoutes);

  const server = Bun.serve({
    port,
    development: !isProd,
    async fetch(req, server) {
      const url = new URL(req.url);
      const { pathname } = url;

      if (pathname.includes('..'))
        return new Response('Forbidden', { status: 403 });

      const potentialFilePath = join(outdir, pathname.substring(1));

      if (await exists(potentialFilePath)) {
        const stats = await stat(potentialFilePath);
        if (stats.isFile()) {
          return new Response(Bun.file(potentialFilePath));
        }
      }

      attachContext(req);

      if (req.headers.get('upgrade') === 'websocket') {
        if (pathname === '/api/sync') {
          return req.user &&
            server.upgrade(req, {
              data: { isSyncChannel: true, user: req.user },
            })
            ? undefined
            : new Response('Unauthorized', { status: 401 });
        }
      }

      if (pathname.startsWith('/api/auth/')) {
        if (pathname.endsWith('/register')) return registerUser(req, db);
        if (pathname.endsWith('/login')) return loginUser(req, db);
        if (pathname.endsWith('/logout')) return logoutUser(req, db);
      }

      const actionMatch = pathname.match(/^\/__actions__\/(.+?)\/(.+?)$/);
      if (actionMatch) {
        if (!req.user) return new Response('Unauthorized', { status: 401 });
        const [, componentName, actionName] = actionMatch;
        const routeDef = Object.values(appRoutes).find(
          (r) => r.componentName === componentName,
        );
        const action = routeDef?.actions?.[actionName];
        if (typeof action !== 'function')
          return new Response('Action not found', { status: 404 });
        try {
          const args = await req.json();
          const result = await action(
            {
              req,
              db,
              fs: createFileSystemForUser(req.user.id),
              user: req.user,
            },
            ...args,
          );
          return result instanceof Response ? result : Response.json(result);
        } catch (e) {
          return new Response('Internal Server Error', { status: 500 });
        }
      }

      for (const path of sortedAppRoutePaths) {
        const routeDefinition = appRoutes[path];
        const paramNames = [];
        const regex = new RegExp(
          `^${path.replace(/:(\w+)(\*?)/g, (_, name) => {
            paramNames.push(name);
            return name.endsWith('*') ? '(.+)' : '([^/]+)';
          })}$`,
        );
        const match = pathname.match(regex);

        if (match) {
          req.params = paramNames.reduce(
            (acc, name, i) => ({ ...acc, [name]: match[i + 1] }),
            {},
          );
          const response = req.headers.get('X-Webs-Navigate')
            ? await handleDataRequest(req, routeDefinition)
            : await handlePageRequest(req, routeDefinition, { manifest });

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
      return new Response('Not Found', { status: 404 });
    },
    websocket: {
      open(ws) {
        if (ws.data?.isSyncChannel) ws.subscribe(SYNC_TOPIC);
      },
      async message(ws, message) {
        if (!ws.data?.isSyncChannel) return;
        let payload;
        try {
          payload = JSON.parse(message);
          const { opId, type } = payload;
          const user = ws.data.user;

          if (type && type.startsWith('fs:')) {
            const fs = createFileSystemForUser(user.id);
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
            if (broadcastPayload)
              server.publish(
                SYNC_TOPIC,
                JSON.stringify({ type: 'sync', data: broadcastPayload }),
              );
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
            if (result?.broadcast)
              server.publish(
                SYNC_TOPIC,
                JSON.stringify({ type: 'sync', data: result.broadcast }),
              );

            ws.send(JSON.stringify({ type: 'ack', opId }));
          }
        } catch (e) {
          console.error('[Sync Error]', e.message);
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
        if (ws.data?.isSyncChannel) ws.unsubscribe(SYNC_TOPIC);
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
