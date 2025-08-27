import { exists } from 'fs/promises';
import { config } from './config';
import { join } from 'path';

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

export async function generateRoutesFromFileSystem(pageEntrypoints) {
  console.log('--- Scanning for routes in pre-compiled server directory ---');
  const compiledServerDir = config.TMP_SERVER_DIR;
  if (!(await exists(compiledServerDir))) {
    console.warn(
      `[Warning] Compiled server directory not found at ${compiledServerDir}. No routes will be generated.`,
    );
    return {};
  }

  const pageFiles = new Set(
    (pageEntrypoints || []).map((p) =>
      p.replace(config.APP_DIR + '/', '').replace('.webs', '.js'),
    ),
  );

  const glob = new Bun.Glob('**/*.js');
  const routeDefinitions = [];

  for await (const file of glob.scan(compiledServerDir)) {
    if (!pageFiles.has(file)) {
      continue;
    }

    const fullPath = join(compiledServerDir, file);
    const mod = await import(`${fullPath}?t=${Date.now()}`);

    if (!mod.default) {
      console.warn(`[Skipping] ${file} does not have a default export.`);
      continue;
    }

    let urlPath = file.replace(/\.js$/, '').replace(/\[(\w+)\]/g, ':$1');

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
        component: mod.default,
        componentName: file.replace(/\.js$/, ''),
        middleware: mod.middleware || [],
        websocket: mod.default.websocket || null,
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
