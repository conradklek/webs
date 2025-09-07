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

          const moduleScriptMatch =
            /<script type="module">(.*?)<\/script>/s.exec(sourceCode);
          if (moduleScriptMatch && !/<template>/.test(sourceCode)) {
            let scriptContent = moduleScriptMatch[1].trim();
            scriptContent = scriptContent.replace(
              /from\s+['"](.+?)\.webs['"]/g,
              "from '$1.js'",
            );
            return {
              contents: scriptContent,
              loader: 'js',
              resolveDir: dirname(args.path),
            };
          }

          const componentScriptMatch =
            /<script\b(?! type="module")[^>]*>(.*?)<\/script>/s.exec(
              sourceCode,
            );
          const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);

          let scriptContent =
            (moduleScriptMatch || componentScriptMatch)?.[1].trim() || '';
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
          }

          const templateProperty = `template: ${JSON.stringify(templateContent)}`;
          const injectedProps = `name: '${componentName}', ${templateProperty}`;

          let finalScript;

          if (!scriptContent.includes('export default')) {
            finalScript = `${scriptContent}\nexport default { ${injectedProps} };`;
          } else {
            finalScript = scriptContent.replace(
              /(export default\s*\{)/,
              `$1 ${injectedProps},`,
            );
          }

          if (!isGlobalComponent) {
            if (finalScript.includes('components:')) {
              finalScript = finalScript.replace(
                /(components\s*:\s*\{)/,
                '$1 ...(__globalComponents || {}),',
              );
            } else {
              finalScript = finalScript.replace(
                /(export default\s*\{)/,
                '$1 components: __globalComponents || {},',
              );
            }
          }

          const finalContents = registryImport + finalScript;

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
