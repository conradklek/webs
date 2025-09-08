#!/usr/bin/env bun
import { resolve, basename, relative, dirname } from 'path';

export default (options = {}) => ({
  name: 'bun-plugin-webs',
  async setup(build) {
    const root = options.root || process.cwd();
    const registryPath = options.registryPath;
    const guiDir = options.guiDir;
    const LOG_PREFIX = '[Debug] Webs Plugin:';

    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (args.importer.endsWith('.webs')) {
        const resolvedPath = resolve(dirname(args.importer), args.path);

        if (registryPath && resolvedPath === registryPath) {
          return null;
        }

        const websPath = resolvedPath.replace(/\.js$/, '.webs');
        return {
          path: websPath,
          namespace: 'webs-components',
        };
      }
      return null;
    });

    build.onResolve({ filter: /\.webs$/ }, (args) => {
      const path = resolve(args.resolveDir || root, args.path);
      return {
        path: path,
        namespace: 'webs-components',
      };
    });

    build.onLoad(
      { filter: /.*/, namespace: 'webs-components' },
      async (args) => {
        try {
          const sourceCode = await Bun.file(args.path).text();
          const componentName = basename(args.path, '.webs');

          const scriptMatch = /<script[^>]*>(.*?)<\/script>/s.exec(sourceCode);
          const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);

          let scriptContent = scriptMatch ? scriptMatch[1].trim() : '';
          const templateContent = templateMatch ? templateMatch[1].trim() : '';

          scriptContent = scriptContent.replace(
            /from\s+['"](.+?)\.webs['"]/g,
            "from '$1.js'",
          );

          let registryImport = '';
          const isGlobalComponent = guiDir && args.path.startsWith(guiDir);

          if (!isGlobalComponent && registryPath) {
            let relPath = relative(dirname(args.path), registryPath).replace(
              /\\/g,
              '/',
            );
            if (!relPath.startsWith('.')) relPath = './' + relPath;
            registryImport = `import __globalComponents from '${relPath}';\n`;

            if (scriptContent.includes('export default')) {
              if (scriptContent.includes('components:')) {
                scriptContent = scriptContent.replace(
                  /(components\s*:\s*\{)/,
                  '$1 ...(__globalComponents || {}),',
                );
              } else {
                scriptContent = scriptContent.replace(
                  /(export default\s*\{)/,
                  '$1 components: __globalComponents || {},',
                );
              }
            }
          }

          const templateProperty = `template: ${JSON.stringify(
            templateContent,
          )}`;
          const injectedProps = `name: '${componentName}', ${templateProperty}`;

          let finalScript;

          if (!scriptContent.includes('export default')) {
            const componentsProp = !isGlobalComponent
              ? 'components: __globalComponents || {},'
              : '';
            finalScript = `${scriptContent}\nconst __webs_component_def = { ${injectedProps}, ${componentsProp} };\nexport default __webs_component_def;`;
          } else {
            finalScript = scriptContent.replace(
              /(export default\s*\{)/,
              `$1 ${injectedProps},`,
            );
            finalScript = finalScript.replace(
              /export default (\{[\s\S]*\});?/,
              'const __webs_component_def = $1; export default __webs_component_def;',
            );
          }

          const hmrCode = `
          if (import.meta.hot) {
            import.meta.hot.accept((newModule) => {
              if (newModule && window.__WEBS_HMR_UPDATE__) {
                window.__WEBS_HMR_UPDATE__(__webs_component_def, newModule.default);
              }
            });
          }`;

          const finalContents = registryImport + finalScript + hmrCode;

          return {
            contents: finalContents,
            loader: 'js',
            resolveDir: dirname(args.path),
          };
        } catch (e) {
          console.error(`${LOG_PREFIX} Failed to load ${args.path}:`, e);
          throw e;
        }
      },
    );
  },
});
