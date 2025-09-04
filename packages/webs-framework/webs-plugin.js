import { resolve, basename } from 'path';

export default (options = {}) => ({
  name: 'bun-plugin-webs',
  async setup(build) {
    const root = options.root || process.cwd();

    build.onResolve({ filter: /\.webs$/ }, (args) => {
      const path = resolve(args.resolveDir || root, args.path);
      return {
        path: path,
        namespace: 'webs-sfc',
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'webs-sfc' }, async (args) => {
      const sourceCode = await Bun.file(args.path).text();

      const moduleScriptMatch = /<script type="module">(.*?)<\/script>/s.exec(
        sourceCode,
      );
      const scriptMatch =
        moduleScriptMatch || /<script\b[^>]*>(.*?)<\/script>/s.exec(sourceCode);

      const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);
      const styleMatch = /<style>([\s\S]*?)<\/style>/s.exec(sourceCode);

      if (!scriptMatch && !templateMatch && !styleMatch) {
        return { contents: '', loader: 'js' };
      }

      let scriptContent = scriptMatch ? scriptMatch[1].trim() : '';
      const templateContent = templateMatch ? templateMatch[1] || '' : '';
      const styleContent = styleMatch ? styleMatch[1].trim() : '';

      const templateAsProp = `template: \`${templateContent.replace(/`/g, '\\`')}\``;
      const styleAsProp = `style: \`${styleContent.replace(/`/g, '\\`')}\``;
      const componentName = basename(args.path, '.webs');

      if (moduleScriptMatch) {
        return { contents: scriptContent, loader: 'js' };
      }

      if (!scriptContent) {
        return {
          contents: `export default { name: '${componentName}', ${templateAsProp}, ${styleAsProp} };`,
          loader: 'js',
        };
      }

      if (scriptContent.includes('export default')) {
        let finalModuleSource = scriptContent.replace(
          /(export default\s*\{)/,
          `$1\n  name: '${componentName}',\n  ${templateAsProp},\n  ${styleAsProp},`,
        );
        return { contents: finalModuleSource, loader: 'js' };
      }

      return {
        contents: `${scriptContent}\nexport default { name: '${componentName}', ${templateAsProp}, ${styleAsProp} };`,
        loader: 'js',
      };
    });
  },
});
