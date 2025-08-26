import { relative, dirname, resolve } from 'path';

export default (config) => ({
  name: 'webs-compiler-plugin',
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

      const scriptMatch = /<script>(.*?)<\/script>/s.exec(sourceCode);
      const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);
      const styleMatch = /<style>([\s\S]*?)<\/style>/s.exec(sourceCode);

      let scriptContent = scriptMatch ? scriptMatch[1].trim() : '';
      const templateContent = templateMatch ? templateMatch[1].trim() : '';
      const styleContent = styleMatch ? styleMatch[1].trim() : '';

      const templateAsProp = `template: \`${templateContent.replace(
        /`/g,
        '\\`',
      )}\``;
      const styleAsProp = `style: \`${styleContent.replace(/`/g, '\\`')}\``;

      let finalModuleSource;

      if (scriptContent.includes('export default')) {
        finalModuleSource = scriptContent.replace(
          /(export default\s*\{)/,
          `$1\n  ${templateAsProp},\n  ${styleAsProp},`,
        );
      } else {
        finalModuleSource = `export default {\n  name: '${relative(
          config.APP_DIR,
          args.path,
        ).replace(
          /\.webs$/,
          '',
        )}',\n  setup() {\n    ${scriptContent}\n  },\n  ${templateAsProp},\n  ${styleAsProp},\n};`;
      }

      return {
        contents: `import "tailwindcss";\n${finalModuleSource}`,
        loader: 'js',
      };
    });
  },
});
