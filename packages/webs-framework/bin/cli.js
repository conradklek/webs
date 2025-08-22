#!/usr/bin/env bun

import { exists } from "fs/promises";
import { Database } from "bun:sqlite";
import { createRequestHandler } from "../src/server.js";
import * as framework from "../src/client.js";
import { performBuild } from "../scripts/build.js";
import { config } from "../src/config.js";
import { join, relative } from "path";
import { getUserFromSession } from "../src/auth.js";

function findRouteMatch(appRoutes, pathname) {
  for (const routePath in appRoutes) {
    const routeDefinition = appRoutes[routePath];
    const paramNames = [];
    const regexPath =
      "^" +
      routePath.replace(/:(\w+)/g, (_, paramName) => {
        paramNames.push(paramName);
        return "([^\\/]+)";
      }) +
      "\\/?$";

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
  console.log("--- Scanning for routes in src/app ---");
  const appDir = config.APP_DIR;
  if (!(await exists(appDir))) {
    console.warn(
      `[Warning] App directory not found at ${appDir}. No routes will be generated.`,
    );
    return {};
  }

  const glob = new Bun.Glob("**/*.js");
  const routeDefinitions = [];

  for await (const file of glob.scan(appDir)) {
    const fullPath = join(appDir, file);
    const module = await import(`${fullPath}?t=${Date.now()}`);

    if (!module.default) {
      console.warn(`[Skipping] ${file} does not have a default export.`);
      continue;
    }

    let urlPath = relative(appDir, fullPath)
      .replace(/\.js$/, "")
      .replace(/\[(\w+)\]/g, ":$1");

    if (urlPath.endsWith("index")) {
      urlPath = urlPath.slice(0, -5) || "/";
    }
    if (urlPath !== "/" && urlPath.endsWith("/")) {
      urlPath = urlPath.slice(0, -1);
    }
    if (!urlPath.startsWith("/")) {
      urlPath = "/" + urlPath;
    }

    routeDefinitions.push({
      path: urlPath,
      definition: {
        component: module.default,
        componentName: relative(appDir, fullPath).replace(/\.js$/, ""),
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

  console.log("--- Discovered Routes ---");
  console.log(Object.keys(appRoutes).join("\n") || "No routes found.");

  return appRoutes;
}

async function main() {
  const serverContext = {
    db: await framework.createDatabase(Database, config.CWD),
    appRoutes: {},
    outdir: config.OUTDIR,
    manifest: {},
    isProd: config.IS_PROD,
  };

  let requestHandler = null;

  async function buildAndReload() {
    serverContext.appRoutes = await generateRoutesFromFileSystem();

    const manifest = await performBuild();
    if (!manifest) {
      console.error("Build failed, server will not start or reload.");
      return;
    }
    serverContext.manifest = manifest;
    console.log("Manifest updated:", JSON.stringify(manifest, null, 2));

    requestHandler = createRequestHandler(serverContext, findRouteMatch);
    console.log("Request handler updated.");
  }

  await buildAndReload();

  Bun.serve({
    port: config.PORT,
    development: !config.IS_PROD,
    fetch: (req, server) => {
      if (req.headers.get("upgrade") === "websocket") {
        const url = new URL(req.url);
        const routeMatch = findRouteMatch(
          serverContext.appRoutes,
          url.pathname,
        );

        if (routeMatch && routeMatch.routeDefinition.websocket) {
          console.log(
            `[WS] Attempting to upgrade connection for: ${url.pathname}`,
          );
          const sessionId = req.headers
            .get("cookie")
            ?.match(/session_id=([^;]+)/)?.[1];
          const user = getUserFromSession(serverContext.db, sessionId);

          const success = server.upgrade(req, {
            data: {
              routePath: routeMatch.path,
              user,
            },
          });

          if (success) {
            console.log("[WS] Upgrade successful!");
            return;
          } else {
            console.error("[WS] Upgrade failed!");
            return new Response("WebSocket upgrade failed", { status: 400 });
          }
        }
      }

      return requestHandler(req);
    },
    websocket: {
      open(ws) {
        const { routePath, user } = ws.data;
        console.log(`[WS] Connection opened for route: ${routePath}`);
        const routeDef = serverContext.appRoutes[routePath];
        if (routeDef?.websocket?.open) {
          const context = { db: serverContext.db, user };
          routeDef.websocket.open(ws, context);
        }
      },
      message(ws, message) {
        const { routePath } = ws.data;
        console.log(`[WS] Message received on route ${routePath}:`, message);
        const routeDef = serverContext.appRoutes[routePath];
        if (routeDef?.websocket?.message) {
          const context = { db: serverContext.db, user: ws.data.user };
          routeDef.websocket.message(ws, message, context);
        }
      },
      close(ws, code, reason) {
        const { routePath } = ws.data;
        console.log(
          `[WS] Connection closed for route ${routePath}. Code: ${code}, Reason: ${reason}`,
        );
        const routeDef = serverContext.appRoutes[routePath];
        if (routeDef?.websocket?.close) {
          const context = { db: serverContext.db, user: ws.data.user };
          routeDef.websocket.close(ws, code, reason, context);
        }
      },
    },
    error: (error) => {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  console.log(`--- Server ready at http://localhost:${config.PORT} ---`);
}

main().catch(console.error);
