import { basename, join } from "path";
import { renderToString } from "./ssr.js";
import { h } from "./renderer.js";
import {
  getUserFromSession,
  registerUser,
  loginUser,
  logoutUser,
} from "./auth.js";
import { fs } from "./filesystem.js";
import { renderHtmlShell, serializeState } from "./document.js";

export async function handleStaticAssets(req, pathname, outdir, isProd) {
  const assetPath = join(outdir, basename(pathname));
  const file = Bun.file(assetPath);
  if (await file.exists()) {
    const headers = { "Content-Type": file.type };
    if (!isProd) {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }

    if (isProd && req.headers.get("accept-encoding")?.includes("gzip")) {
      const gzippedPath = `${assetPath}.gz`;
      if (await Bun.file(gzippedPath).exists()) {
        headers["Content-Encoding"] = "gzip";
        return new Response(Bun.file(gzippedPath), { headers });
      }
    }
    return new Response(file, { headers });
  }
  return null;
}

export async function handleAuthApi(req, db) {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/auth/register") return registerUser(req, db);
  if (pathname === "/api/auth/login") return loginUser(req, db);
  if (pathname === "/api/auth/logout") return logoutUser(req, db);
  return new Response("Auth route not found", { status: 404 });
}

export async function handleServerActions(req, context) {
  const { db, appRoutes } = context;
  const { pathname } = new URL(req.url);
  const sessionId = req.headers.get("cookie")?.match(/session_id=([^;]+)/)?.[1];
  const user = getUserFromSession(db, sessionId);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [, , componentName, actionName] = pathname.split("/");
  const routeDef = Object.values(appRoutes).find(
    (r) => r.componentName === componentName,
  );
  const action = routeDef?.component?.actions?.[actionName];

  if (typeof action !== "function") {
    return new Response("Action not found", { status: 404 });
  }

  try {
    const args = req.method === "POST" ? await req.json() : [];
    const actionContext = { req, db, fs, user };

    if (action.constructor.name === "AsyncGeneratorFunction") {
      const iterator = action(actionContext, ...args);

      const stream = new ReadableStream({
        async pull(controller) {
          const { value, done } = await iterator.next();
          if (done) {
            controller.close();
          } else {
            const chunk =
              typeof value === "object" ? JSON.stringify(value) : String(value);
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    } else {
      const result = await action(actionContext, ...args);
      return result instanceof Response ? result : Response.json(result);
    }
  } catch (e) {
    console.error(`Action Error: ${e.message}`);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function handleDataRequest(req, routeDefinition, params, context) {
  const { db } = context;
  const sessionId = req.headers.get("cookie")?.match(/session_id=([^;]+)/)?.[1];
  const user = getUserFromSession(db, sessionId);

  const componentVnode = h(routeDefinition.component, { user, params });
  const { componentState } = await renderToString(componentVnode);

  const websState = {
    user,
    params,
    componentState,
    componentName: routeDefinition.componentName,
    title: routeDefinition.component.name || "Webs App",
  };

  if (typeof window !== "undefined") {
    window.__WEBS_STATE__ = websState;
  }

  return new Response(serializeState(websState), {
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
}

export function handlePageRequest(req, routeDefinition, params, context) {
  return new Promise(async (resolve) => {
    const { db, manifest } = context;
    const url = new URL(req.url);
    const sessionId = req.headers
      .get("cookie")
      ?.match(/session_id=([^;]+)/)?.[1];
    const user = getUserFromSession(db, sessionId);

    const fromRoute = { path: req.headers.get("referer") || null };
    const toRoute = {
      path: url.pathname,
      params,
      component: routeDefinition.component,
      user: user,
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
        if (!routeDefinition.component) {
          console.error(`[Server Error] No component defined for route.`);
          return resolve(
            new Response("Server Configuration Error", { status: 500 }),
          );
        }

        const componentVnode = h(routeDefinition.component, { user, params });
        const { html: appHtml, componentState } =
          await renderToString(componentVnode);

        const websState = {
          user,
          params,
          componentState,
          componentName: routeDefinition.componentName,
        };

        const fullHtml = renderHtmlShell({
          appHtml,
          websState,
          manifest,
          title: routeDefinition.component.name || "Webs App",
        });
        resolve(
          new Response(fullHtml, {
            headers: { "Content-Type": "text/html;charset=utf-8" },
          }),
        );
      }
    };

    next();
  });
}
