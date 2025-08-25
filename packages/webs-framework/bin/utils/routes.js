import { join, relative } from 'path';
import { exists } from 'fs/promises';
import { config } from './config';

export function findRouteMatch(appRoutes, pathname) {
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;

  for (const routePath in appRoutes) {
    const routeDefinition = appRoutes[routePath];
    const paramNames = [];

    const regexPath =
      '^' +
      routePath.replace(/:(\w+)/g, (_, paramName) => {
        paramNames.push(paramName);
        return '([^\\\\/]+)';
      }) +
      '$';

    const match = normalizedPathname.match(new RegExp(regexPath));

    if (match) {
      const params = paramNames.reduce((acc, name, index) => {
        acc[name] = decodeURIComponent(match[index + 1]);
        return acc;
      }, {});
      return { routeDefinition, params, path: routePath };
    }
  }
  return null;
}

/**
 * Scans the filesystem and generates a sorted list of routes.
 * The sorting prioritizes static routes over dynamic ones to prevent matching
 * errors.
 * @returns {Promise<object>} - A promise that resolves to an object of routes.
 */
export async function generateRoutesFromFileSystem() {
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
        isNavigation: true,
      },
    });
  }

  routeDefinitions.sort((a, b) => {
    const aSegments = a.path.split('/').filter(Boolean).length;
    const bSegments = b.path.split('/').filter(Boolean).length;
    const aDyn = (a.path.match(/:/g) || []).length;
    const bDyn = (b.path.match(/:/g) || []).length;

    if (aSegments !== bSegments) {
      return bSegments - aSegments;
    }

    return aDyn - bDyn;
  });

  const appRoutes = routeDefinitions.reduce((acc, { path, definition }) => {
    acc[path] = definition;
    return acc;
  }, {});

  console.log('--- Discovered Routes ---');
  console.log(Object.keys(appRoutes).join('\n') || 'No routes found.');

  return appRoutes;
}
