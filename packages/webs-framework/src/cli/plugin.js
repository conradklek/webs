import { resolve, basename } from 'path';

export default (options = {}) => ({
  name: 'bun-plugin-webs',
  async setup(build) {
    const root = options.root || process.cwd();
    const registryPath = options.registryPath;
    const skipRegistry = options.skipRegistry || false;

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
        const sourceCode = await Bun.file(args.path).text();

        const moduleScriptMatch = /<script type="module">(.*?)<\/script>/s.exec(
          sourceCode,
        );
        const scriptMatch =
          moduleScriptMatch ||
          /<script\b[^>]*>(.*?)<\/script>/s.exec(sourceCode);

        const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);
        const styleMatch = /<style>([\s\S]*?)<\/style>/s.exec(sourceCode);

        let scriptContent = scriptMatch ? scriptMatch[1].trim() : '';
        const templateContent = templateMatch ? templateMatch[1].trim() : '';
        const styleContent = styleMatch ? styleMatch[1].trim() : '';
        const componentName = basename(args.path, '.webs');

        const registryImport =
          !skipRegistry &&
          registryPath &&
          (await Bun.file(registryPath).exists())
            ? `import __globalComponents from '${registryPath}';\n`
            : '';

        const isTemplateExpression =
          /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*\s*`|`|\(|\{)/.test(templateContent);

        const templateProperty = isTemplateExpression
          ? `template: ${templateContent}`
          : `template: ${JSON.stringify(templateContent)}`;

        const injectedProps = `
        name: '${componentName}',
        ${templateProperty},
        style: ${JSON.stringify(styleContent)},
      `;

        let finalScript;

        if (moduleScriptMatch) {
          if (!scriptContent.includes('export default')) {
            finalScript = `${scriptContent}\nexport default { ${injectedProps} };`;
          } else {
            finalScript = scriptContent.replace(
              /(export default\s*\{)/,
              `$1 ${injectedProps}`,
            );
          }
        } else if (!scriptContent) {
          finalScript = `export default {
              ${injectedProps}
              ${registryImport ? 'components: __globalComponents' : ''}
          };`;
        } else if (!scriptContent.includes('export default')) {
          finalScript =
            scriptContent +
            `
          export default {
              ${injectedProps}
              ${registryImport ? 'components: __globalComponents' : ''}
          };`;
        } else {
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

          modifiedScript = modifiedScript.replace(
            /(export default\s*\{)/,
            `$1 ${propsToInject}`,
          );
          finalScript = modifiedScript;
        }

        return {
          contents: registryImport + finalScript,
          loader: 'js',
        };
      },
    );
  },
});
