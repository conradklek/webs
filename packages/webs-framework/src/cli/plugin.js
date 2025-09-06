import { resolve, basename } from 'path';

export default (options = {}) => ({
  name: 'bun-plugin-webs',
  async setup(build) {
    try {
      const root = options.root || process.cwd();
      const registryPath = options.registryPath;
      const skipRegistry = options.skipRegistry || false;

      build.onResolve({ filter: /\.webs$/ }, (args) => {
        try {
          const path = resolve(args.resolveDir || root, args.path);
          return {
            path: path,
            namespace: 'webs-components',
          };
        } catch (e) {
          console.error('[Webs Plugin onResolve Error]', e);
          throw e;
        }
      });

      build.onLoad(
        { filter: /.*/, namespace: 'webs-components' },
        async (args) => {
          try {
            const sourceCode = await Bun.file(args.path).text();

            const moduleScriptMatch =
              /<script type="module">(.*?)<\/script>/s.exec(sourceCode);
            const componentScriptMatch =
              /<script\b(?! type="module")[^>]*>(.*?)<\/script>/s.exec(
                sourceCode,
              );
            const templateMatch = /<template>(.*?)<\/template>/s.exec(
              sourceCode,
            );
            const styleMatch = /<style>([\s\S]*?)<\/style>/s.exec(sourceCode);

            if (
              moduleScriptMatch &&
              !componentScriptMatch &&
              !templateMatch &&
              !styleMatch
            ) {
              return {
                contents: moduleScriptMatch[1].trim(),
                loader: 'js',
              };
            }

            const scriptMatch = moduleScriptMatch || componentScriptMatch;
            let scriptContent = scriptMatch ? scriptMatch[1].trim() : '';
            const templateContent = templateMatch
              ? templateMatch[1].trim()
              : '';
            const styleContent = styleMatch ? styleMatch[1].trim() : '';
            const componentName = basename(args.path, '.webs');

            const registryImport =
              !skipRegistry &&
              registryPath &&
              (await Bun.file(registryPath).exists())
                ? `import __globalComponents from '${registryPath}';\n`
                : '';

            const isTemplateExpression =
              /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*\s*`|`|\(|\{)/.test(
                templateContent,
              );

            const templateProperty = isTemplateExpression
              ? `template: ${templateContent}`
              : `template: ${JSON.stringify(templateContent)}`;

            const injectedProps = `
              name: '${componentName}',
              ${templateProperty},
              style: ${JSON.stringify(styleContent)},
            `;

            let finalScript;

            if (scriptContent.includes('export default')) {
              let modifiedScript = scriptContent;
              let propsToInject = injectedProps;

              if (registryImport) {
                if (modifiedScript.includes('components:')) {
                  modifiedScript = modifiedScript.replace(
                    /(components\s*:\s*\{)/,
                    '$1 ...__globalComponents,',
                  );
                } else {
                  propsToInject += 'components: __globalComponents,';
                }
              }

              finalScript = modifiedScript.replace(
                /(export default\s*\{)/,
                `$1 ${propsToInject}`,
              );
            } else {
              finalScript = `${scriptContent}\nexport default { ${injectedProps} ${registryImport ? ', components: __globalComponents' : ''} };`;
            }

            return {
              contents: registryImport + finalScript,
              loader: 'js',
            };
          } catch (e) {
            console.error(
              `[Webs Plugin onLoad Error] Failed to load ${args.path}:`,
              e,
            );
            throw e;
          }
        },
      );
    } catch (e) {
      console.error('[Webs Plugin Setup Error]', e);
      throw e;
    }
  },
});
