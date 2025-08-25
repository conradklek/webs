import { h, renderToString } from '../lib/renderer.js';
import { basename, join } from 'path';
import { fs } from './fs.js';
import {
  getUserFromSession,
  registerUser,
  loginUser,
  logoutUser,
} from './auth.js';

export function renderHtmlShell({ appHtml, websState, manifest, title }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${
      manifest.css
        ? `<link rel="stylesheet" href="/${basename(manifest.css)}">`
        : ''
    }
</head>
<body>
    <div id="root" style="display: contents">${appHtml}</div>
    <script>window.__WEBS_STATE__ = ${serializeState(websState)};</script>
    <script type="module" src="/${basename(manifest.js)}"></script>
</body>
</html>`;
}

export function serializeState(state) {
  return JSON.stringify(state, (_, value) => {
    if (value instanceof Set) return { __type: 'Set', values: [...value] };
    if (value instanceof Map)
      return { __type: 'Map', entries: [...value.entries()] };
    return value;
  });
}

async function handleStaticAssets(req, pathname, outdir, isProd) {
  const assetPath = join(outdir, basename(pathname));
  const file = Bun.file(assetPath);
  if (await file.exists()) {
    const headers = { 'Content-Type': file.type };
    if (!isProd) {
      headers['Cache-Control'] = 'no-cache';
    }
    if (isProd && req.headers.get('accept-encoding')?.includes('gzip')) {
      const gzippedPath = `${assetPath}.gz`;
      if (await Bun.file(gzippedPath).exists()) {
        headers['Content-Encoding'] = 'gzip';
        return new Response(Bun.file(gzippedPath), { headers });
      }
    }
    return new Response(file, { headers });
  }
  return null;
}

async function handleAuthApi(req, db) {
  const { pathname } = new URL(req.url);
  if (pathname === '/api/auth/register') return registerUser(req, db);
  if (pathname === '/api/auth/login') return loginUser(req, db);
  if (pathname === '/api/auth/logout') return logoutUser(req, db);
  return new Response('Auth route not found', { status: 404 });
}

async function handleServerActions(req, context) {
  const { db, appRoutes } = context;
  const { pathname } = new URL(req.url);
  const sessionId = req.headers.get('cookie')?.match(/session_id=([^;]+)/)?.[1];
  const user = getUserFromSession(db, sessionId);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const [, , componentName, actionName] = pathname.split('/');
  const routeDef = Object.values(appRoutes).find(
    (r) => r.componentName === componentName,
  );
  const action = routeDef?.component?.actions?.[actionName];

  if (typeof action !== 'function') {
    return new Response('Action not found', { status: 404 });
  }

  try {
    const args = req.method === 'POST' ? await req.json() : [];
    const actionContext = { req, db, fs, user };

    if (action.constructor.name === 'AsyncGeneratorFunction') {
      const iterator = action(actionContext, ...args);
      const stream = new ReadableStream({
        async pull(controller) {
          const { value, done } = await iterator.next();
          if (done) {
            controller.close();
          } else {
            const chunk =
              typeof value === 'object' ? JSON.stringify(value) : String(value);
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    } else {
      const result = await action(actionContext, ...args);
      return result instanceof Response ? result : Response.json(result);
    }
  } catch (e) {
    console.error(`Action Error: ${e.message}`);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function handleDataRequest(req, routeDefinition, params, context) {
  const { db } = context;
  const sessionId = req.headers.get('cookie')?.match(/session_id=([^;]+)/)?.[1];
  const user = getUserFromSession(db, sessionId);

  const componentVnode = h(routeDefinition.component, { user, params, db });
  const { componentState } = await renderToString(componentVnode);

  const websState = {
    user,
    params,
    componentState,
    componentName: routeDefinition.componentName,
    title: routeDefinition.component.name || 'Webs App',
  };

  return new Response(serializeState(websState), {
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  });
}

function handlePageRequest(req, routeDefinition, params, context) {
  return new Promise(async (resolve) => {
    const { db, manifest } = context;
    const url = new URL(req.url);
    const sessionId = req.headers
      .get('cookie')
      ?.match(/session_id=([^;]+)/)?.[1];
    const user = getUserFromSession(db, sessionId);

    const fromRoute = { path: req.headers.get('referer') || null };
    const toRoute = {
      path: url.pathname,
      params,
      component: routeDefinition.component,
      user,
    };
    const middleware = routeDefinition.middleware || [];
    let index = -1;

    const next = async (path) => {
      if (path) {
        return resolve(
          new Response(null, { status: 302, headers: { Location: path } }),
        );
      }
      index++;
      if (index < middleware.length) {
        middleware[index](toRoute, fromRoute, next);
      } else {
        const componentVnode = h(routeDefinition.component, {
          user,
          params,
          db,
        });
        const { html: appHtml, componentState } =
          await renderToString(componentVnode);
        const websState = {
          user,
          params,
          componentState,
          componentName: routeDefinition.componentName,
          swPath: manifest.sw ? `/${basename(manifest.sw)}` : null,
        };
        const fullHtml = renderHtmlShell({
          appHtml,
          websState,
          manifest,
          title: routeDefinition.component.name || 'Webs App',
        });
        resolve(
          new Response(fullHtml, {
            headers: { 'Content-Type': 'text/html;charset=utf-8' },
          }),
        );
      }
    };
    await next();
  });
}

export function createRequestHandler(context, findRouteMatch) {
  return async function handleRequest(req) {
    const { db, appRoutes, outdir, isProd } = context;
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname.startsWith('/api/auth/')) return handleAuthApi(req, db);
    if (pathname.startsWith('/__actions__/'))
      return handleServerActions(req, context);

    const assetResponse = await handleStaticAssets(
      req,
      pathname,
      outdir,
      isProd,
    );
    if (assetResponse) return assetResponse;

    const routeMatch = findRouteMatch(appRoutes, pathname);
    if (routeMatch) {
      const { routeDefinition, params: routeParams } = routeMatch;
      const queryParams = Object.fromEntries(url.searchParams.entries());
      const allParams = { ...routeParams, ...queryParams };

      if (req.headers.get('X-Webs-Navigate')) {
        return handleDataRequest(req, routeDefinition, allParams, context);
      }
      return handlePageRequest(req, routeDefinition, allParams, context);
    }

    return new Response('Not Found', { status: 404 });
  };
}
