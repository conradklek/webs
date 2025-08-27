import { dirname, resolve, basename } from 'path';

export default (config) => ({
  name: 'bun-plugin-webs',
  async setup(build) {
    build.onResolve({ filter: /\.webs$/ }, (args) => {
      const resolvedPath = resolve(dirname(args.importer), args.path);
      return {
        path: resolvedPath,
      };
    });

    build.onResolve({ filter: /^\./, namespace: 'file' }, (args) => {
      if (
        args.importer &&
        args.importer.startsWith(config.SRC_DIR) &&
        args.importer.endsWith('.webs')
      ) {
        const resolvedPath = resolve(dirname(args.importer), args.path);
        if (resolvedPath.startsWith(config.SRC_DIR)) {
          return {
            path: resolvedPath,
          };
        }
      }
    });

    build.onLoad({ filter: /\.webs$/ }, async (args) => {
      const sourceCode = await Bun.file(args.path).text();

      const moduleScriptMatch = /<script type="module">(.*?)<\/script>/s.exec(
        sourceCode,
      );

      if (moduleScriptMatch) {
        const scriptContent = moduleScriptMatch[1].trim();
        return {
          contents: `import "tailwindcss";\n${scriptContent}`,
          loader: 'js',
        };
      } else {
        const scriptMatch = /<script>(.*?)<\/script>/s.exec(sourceCode);
        const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);
        const styleMatch = /<style>([\s\S]*?)<\/style>/s.exec(sourceCode);

        if (!scriptMatch && !templateMatch) {
          return { contents: '', loader: 'js' };
        }

        let scriptContent = scriptMatch ? scriptMatch[1].trim() : '';
        const templateContent = templateMatch ? templateMatch[1] || '' : '';
        const styleContent = styleMatch ? styleMatch[1].trim() : '';

        const templateAsProp = `template: \`${templateContent.replace(
          /`/g,
          '\\`',
        )}\``;
        const styleAsProp = `style: \`${styleContent.replace(/`/g, '\\`')}\``;

        let finalModuleSource;

        if (scriptContent.includes('export default')) {
          let modifiedScript = scriptContent;

          if (!/export default\s*\{\s*name:/.test(modifiedScript)) {
            const fileName = basename(args.path, '.webs');
            const componentName = fileName.replace(/\[|\]/g, '');
            modifiedScript = modifiedScript.replace(
              /(export default\s*\{)/,
              `$1\n  name: '${componentName}',`,
            );
          }

          finalModuleSource = modifiedScript.replace(
            /(export default\s*\{)/,
            `$1\n  ${templateAsProp},\n  ${styleAsProp},`,
          );
        } else {
          const fileName = basename(args.path, '.webs');
          const componentName = fileName.replace(/\[|\]/g, '');

          finalModuleSource = `${scriptContent}\nexport default {\n  name: '${componentName}',\n  setup() {},\n  ${templateAsProp},\n  ${styleAsProp},\n};`;
        }

        return {
          contents: `import "tailwindcss";\n${finalModuleSource}`,
          loader: 'js',
        };
      }
    });
  },
});
