import {
  handleStaticAssets,
  handleAuthApi,
  handleServerActions,
  handleDataRequest,
  handlePageRequest,
} from "./handlers.js";

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
      return { routeDefinition, params };
    }
  }
  return null;
}

export function createRequestHandler(context) {
  return async function handleRequest(req) {
    const { db, appRoutes, outdir, isProd } = context;
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname.startsWith("/api/auth/")) return handleAuthApi(req, db);
    if (pathname.startsWith("/__actions__/"))
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

      if (req.headers.get("X-Webs-Navigate")) {
        return handleDataRequest(req, routeDefinition, allParams, context);
      }
      return handlePageRequest(req, routeDefinition, allParams, context);
    }

    return new Response("Not Found", { status: 404 });
  };
}
