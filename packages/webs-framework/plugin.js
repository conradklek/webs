import { dirname, resolve, basename } from 'path';

export default (config) => ({
  name: 'bun-plugin-webs',
  async setup(build) {
    build.onResolve({ filter: /\.webs$/ }, (args) => ({
      path: resolve(dirname(args.importer), args.path),
      namespace: 'webs-sfc',
    }));

    build.onLoad({ filter: /.*/, namespace: 'webs-sfc' }, async (args) => {
      const sourceCode = await Bun.file(args.path).text();

      const scriptMatch = /<script\b[^>]*>(.*?)<\/script>/s.exec(sourceCode);
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
          const componentName = fileName.replace(/[^a-zA-Z0-9]/g, '-');
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
        const componentName = fileName.replace(/[^a-zA-Z0-9]/g, '-');

        finalModuleSource = `${scriptContent}\nexport default {\n  name: '${componentName}',\n  setup() {},\n  ${templateAsProp},\n  ${styleAsProp},\n};`;
      }

      return {
        contents: finalModuleSource,
        loader: 'js',
      };
    });
  },
});
