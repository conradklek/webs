import { getUserFromSession, createSession } from './authentication.js';
import { createFileSystemForUser } from './fs.server.js';
import { renderToString } from '../renderer/ssr.js';
import { handleApiRequest } from './api.js';
import { stat, exists } from 'fs/promises';
import { basename, join } from 'path';
import { h } from '../core/vdom.js';
import { createLogger } from '../developer/logger.js';

/**
 * @typedef {import('bun:sqlite').Database} BunDatabase
 * @typedef {import('../ai/ai.server.js').AI} AI
 * @typedef {import('./server-config.js').Config} Config
 * @typedef {import('../ai/ai.server.js').AgentDefinition} AgentDefinition
 */

/**
 * @typedef {object} ServerManifest
 * @property {string | undefined} js
 * @property {string | undefined} css
 * @property {string | undefined} sw
 */

/**
 * @typedef {object} RouteDefinition
 * @property {any} component
 * @property {string} componentName
 * @property {Record<string, Function>} actions
 * @property {Record<string, Function>} handlers
 * @property {Record<string, Function>} wsHandlers
 */

/**
 * @typedef {object} ServerContext
 * @property {BunDatabase} db
 * @property {AI} ai
 * @property {any} dbConfig
 * @property {ServerManifest} manifest
 * @property {Record<string, RouteDefinition>} appRoutes
 * @property {Record<string, AgentDefinition>} agentRoutes
 * @property {Config} config
 * @property {boolean} isProd
 * @property {string} SYNC_TOPIC
 * @property {string} HMR_TOPIC
 * @property {string} actionsPath
 * @property {any} globalComponents
 * @property {Record<string, string>} sourceToComponentMap
 * @property {Record<string, Function>} syncActions
 */

const logger = createLogger('[Router]');
/** @type {Map<string, { gzippedBuffer: Buffer, contentType: string }>} */
const gzipCache = new Map();

/**
 * @param {Request} req
 * @param {string} filePath
 * @returns {Promise<Response>}
 */
async function serveStaticFile(req, filePath) {
  const acceptsGzip = req.headers.get('Accept-Encoding')?.includes('gzip');
  const file = Bun.file(filePath);

  if (acceptsGzip) {
    if (gzipCache.has(filePath)) {
      const cached = gzipCache.get(filePath);
      if (cached) {
        const { gzippedBuffer, contentType } = cached;
        logger.debug(`Serving gzipped file from cache: ${filePath}`);
        return new Response(
          /** @type {BodyInit} */ (/** @type {unknown} */ (gzippedBuffer)),
          {
            headers: {
              'Content-Encoding': 'gzip',
              'Content-Type': contentType,
            },
          },
        );
      }
    }

    logger.debug(`Gzipping and serving file: ${filePath}`);
    const buffer = await file.arrayBuffer();
    const gzippedBuffer = Bun.gzipSync(new Uint8Array(buffer));
    const contentType = file.type;

    gzipCache.set(filePath, {
      gzippedBuffer: /** @type {Buffer} */ (
        /** @type {unknown} */ (gzippedBuffer)
      ),
      contentType,
    });

    return new Response(
      /** @type {BodyInit} */ (/** @type {unknown} */ (gzippedBuffer)),
      {
        headers: {
          'Content-Encoding': 'gzip',
          'Content-Type': contentType,
        },
      },
    );
  }

  logger.debug(`Serving uncompressed file: ${filePath}`);
  return new Response(file);
}

/**
 * @param {object} options
 * @param {string} options.appHtml
 * @param {object} options.websState
 * @param {{ css?: string, js?: string, sw?: string }} options.manifest
 * @param {string} options.title
 * @returns {string}
 */
function renderHtmlShell({ appHtml, websState, manifest, title }) {
  const cssPath = manifest.css ? `/${basename(manifest.css)}` : '';
  const jsPath = manifest.js ? `/${basename(manifest.js)}` : '';

  logger.debug('Rendering HTML shell for', title);
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

/**
 * @param {any} routeDefinition
 * @param {any} context
 */
async function executePrefetch(routeDefinition, context) {
  logger.debug(
    `Executing prefetch for component '${routeDefinition.componentName}'...`,
  );
  if (!routeDefinition.actions?.prefetch) {
    logger.warn('No prefetch action found.');
    return {};
  }
  try {
    const result = await routeDefinition.actions.prefetch(context);
    logger.debug('Prefetch action completed successfully.');
    return result;
  } catch (err) {
    logger.error(`Prefetch Error for "${routeDefinition.componentName}":`, err);
    return { error: 'Failed to load data on the server.' };
  }
}
/**
 * @param {Request & { db: any, user: any, params: any }} req
 * @param {any} routeDefinition
 * @param {any} context
 */
async function handleDataRequest(req, routeDefinition, context) {
  logger.info(`Handling data request for route '${req.url}'`);
  const { db, user, params } = req;
  const { manifest, sourceToComponentMap } = context;
  const fs = user ? createFileSystemForUser(user.id) : null;

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
    sourceToComponentMap,
  };
  logger.debug('Sending JSON response for data request.');
  return new Response(JSON.stringify(websState), {
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  });
}
/**
 * @param {Request & { db: any, user: any, params: any }} req
 * @param {any} routeDefinition
 * @param {any} context
 */
async function handlePageRequest(req, routeDefinition, context) {
  logger.info(`Handling page request for route '${req.url}'`);
  const { manifest, globalComponents, sourceToComponentMap } = context;
  const { db, user, params } = req;
  const fs = user ? createFileSystemForUser(user.id) : null;

  const initialState = await executePrefetch(routeDefinition, {
    db,
    user,
    params,
    fs,
  });

  const { pathname } = new URL(req.url);
  const props = { user, params, initialState, path: pathname };

  const vnode = h(routeDefinition.component, props);
  vnode.appContext = {
    components: globalComponents || {},
    provides: {},
    patch: () => {},
    hydrate: () => null,
    params: params || {},
  };

  logger.debug('Starting SSR...');
  const { html: appHtml, componentState } = await renderToString(vnode);
  logger.debug('SSR complete.');

  const websState = {
    user,
    params,
    componentState: componentState || initialState,
    componentName: routeDefinition.componentName,
    swPath: manifest.sw ? `/${basename(manifest.sw)}` : null,
    sourceToComponentMap,
  };

  const fullHtml = renderHtmlShell({
    appHtml,
    websState,
    manifest,
    title: routeDefinition.component.name || 'Webs App',
  });
  logger.debug('Sending full HTML page response.');
  return new Response(fullHtml, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}
/**
 * @param {import("bun:sqlite").Database} db
 * @param {boolean} isProd
 * @returns {(req: Request & { db?: any, user?: any, params?: any }) => void}
 */
const authMiddleware = (db, isProd) => (req) => {
  req.db = db;
  const cookie = req.headers.get('cookie');
  const sessionId = cookie?.match(/session_id=([^;]+)/)?.[1];
  let user = sessionId ? getUserFromSession(db, sessionId) : null;

  if (!isProd && !user) {
    const anonUser = db
      .query('SELECT id, username, email FROM users WHERE username = ?')
      .get('anon');
    if (anonUser) {
      const newSessionId = createSession(
        db,
        /** @type {{id: number}} */ (anonUser).id,
      );
      user = anonUser;
      req.headers.set('X-Set-Dev-Session', newSessionId);
    }
  }
  req.user = user;
};
/**
 * @param {object} context
 * @param {import("bun:sqlite").Database} context.db
 * @param {any} context.manifest
 * @param {Record<string, any>} context.appRoutes
 * @param {any} context.agentRoutes
 * @param {any} context.globalComponents
 * @param {any} context.config
 * @param {boolean} context.isProd
 * @param {any} context.sourceToComponentMap
 * @param {import('../ai/ai.server.js').AI} context.ai
 * @param {Record<string, Function>} context.syncActions
 * @param {string} context.SYNC_TOPIC
 */
export function createFetchHandler(context) {
  const {
    db,
    manifest,
    appRoutes,
    globalComponents,
    config,
    isProd,
    sourceToComponentMap,
  } = context;
  const { OUTDIR, SRC_DIR } = config;

  const attachContext = authMiddleware(db, isProd);
  const sortedAppRoutePaths = Object.keys(appRoutes || {});

  /**
   * @param {Request} req
   * @param {import("bun").Server} server
   */
  return async function fetch(req, server) {
    const url = new URL(req.url);
    const { pathname } = url;
    logger.info(`Received request for: ${pathname}`);

    if (pathname.includes('..')) {
      logger.warn('Path traversal attempt detected.');
      return new Response('Forbidden', { status: 403 });
    }

    const potentialFilePath = join(OUTDIR, pathname.substring(1));
    if (
      (await exists(potentialFilePath)) &&
      (await stat(potentialFilePath)).isFile()
    ) {
      return serveStaticFile(req, potentialFilePath);
    }

    if (!isProd) {
      const potentialSrcPath = join(SRC_DIR, pathname.substring(1));
      if (
        (await exists(potentialSrcPath)) &&
        (await stat(potentialSrcPath)).isFile()
      ) {
        return serveStaticFile(req, potentialSrcPath);
      }
    }
    const extendedReq =
      /** @type {Request & { db: any, user: any, params: any }} */ (req);
    attachContext(extendedReq);

    if (pathname.startsWith('/api/')) {
      const apiResponse = await handleApiRequest(extendedReq, server, {
        db: context.db,
        ai: context.ai,
        syncActions: context.syncActions,
        SYNC_TOPIC: context.SYNC_TOPIC,
        agentRoutes: context.agentRoutes,
      });
      if (apiResponse) return apiResponse;
    }

    if (req.headers.get('upgrade') === 'websocket') {
      if (pathname === '/api/sync') {
        if (extendedReq.user) {
          return server.upgrade(req, {
            data: { isSyncChannel: true, user: extendedReq.user },
          })
            ? undefined
            : new Response('Unauthorized', { status: 401 });
        }
      }
      if (pathname === '/api/hmr') {
        return server.upgrade(req, { data: { isHmrChannel: true } })
          ? undefined
          : new Response('HMR WebSocket upgrade failed', { status: 500 });
      }
    }

    const actionMatch = pathname.match(/^\/__actions__\/(.+?)\/(.+?)$/);
    if (actionMatch) {
      if (!extendedReq.user)
        return new Response('Unauthorized', { status: 401 });
      const [, componentName, actionName] = actionMatch;
      if (!componentName || !actionName) {
        return new Response('Action not found', { status: 404 });
      }
      const routeDef = Object.values(appRoutes).find(
        (
          /** @type {{ componentName: string; component: { name: string; }; actions: object }} */ r,
        ) =>
          (r.componentName === componentName ||
            r.component.name === componentName) &&
          r.actions &&
          actionName in r.actions,
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
            fs: createFileSystemForUser(extendedReq.user.id),
            user: extendedReq.user,
          },
          ...args,
        );
        return result instanceof Response ? result : Response.json(result);
      } catch (e) {
        logger.error('Error executing action:', e);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    for (const path of sortedAppRoutePaths) {
      const routeDefinition = appRoutes[path];
      /** @type {string[]} */
      const paramNames = [];
      const regex = new RegExp(
        `^${path.replace(/:(\w+)(\*)?/g, (_, name, isCatchAll) => {
          paramNames.push(name);
          return isCatchAll === '*' ? '(.*)' : '([^/]+)';
        })}$`,
      );
      const match = pathname.match(regex);

      if (match) {
        logger.info(`Matched request to route: '${path}'`);
        extendedReq.params = paramNames.reduce((acc, name, i) => {
          let value = match[i + 1] || '';
          if (
            path.endsWith('*') &&
            name === paramNames[paramNames.length - 1]
          ) {
            value = value.startsWith('/') ? value.substring(1) : value;
          }
          /** @type {any} */ (acc)[name] = value;
          return acc;
        }, {});

        if (req.headers.get('upgrade') === 'websocket') {
          if (
            routeDefinition.wsHandlers &&
            Object.keys(routeDefinition.wsHandlers).length > 0
          ) {
            logger.info(`Upgrading to WebSocket for route: ${path}`);
            const success = server.upgrade(req, {
              data: {
                user: extendedReq.user,
                params: extendedReq.params,
                wsHandlers: routeDefinition.wsHandlers,
              },
            });
            return success
              ? undefined
              : new Response('WebSocket upgrade failed', { status: 500 });
          }
        }

        const requestMethod = req.method.toLowerCase();
        if (requestMethod !== 'get') {
          if (!extendedReq.user) {
            return new Response('Unauthorized', { status: 401 });
          }

          const handler = routeDefinition.handlers?.[requestMethod];

          if (handler && typeof handler === 'function') {
            try {
              const result = await handler({
                req: extendedReq,
                db,
                user: extendedReq.user,
                params: extendedReq.params,
                fs: createFileSystemForUser(extendedReq.user.id),
              });

              if (result instanceof Response) {
                return result;
              }
              if (result !== undefined) {
                return Response.json(result);
              }
              return new Response(null, { status: 204 });
            } catch (e) {
              const error = /** @type {Error} */ (e);
              logger.error(
                `Error executing '${requestMethod}' handler for route '${path}':`,
                error,
              );
              return new Response(error.message || 'Internal Server Error', {
                status: 500,
              });
            }
          } else {
            return new Response('Method Not Allowed', { status: 405 });
          }
        }

        const response = req.headers.get('X-Webs-Navigate')
          ? await handleDataRequest(extendedReq, routeDefinition, {
              manifest,
              sourceToComponentMap,
            })
          : await handlePageRequest(extendedReq, routeDefinition, {
              manifest,
              globalComponents,
              sourceToComponentMap,
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

    logger.info('No route matched, returning 404.');
    return new Response('Not Found', { status: 404 });
  };
}
