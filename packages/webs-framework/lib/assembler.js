import { writeFile, exists } from 'fs/promises';
import { join, dirname, basename, relative, resolve } from 'path';
import { ensureDir } from './utils.js';

async function compileWebsFile(filePath, componentName, config) {
  console.log(`[Assembler] Compiling '${filePath}' as '${componentName}'`);
  const sourceCode = await Bun.file(filePath).text();
  const scriptMatch = /<script[^>]*>(.*?)<\/script>/s.exec(sourceCode);
  const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);
  const styleMatch = /<style>([\s\S]*?)<\/style>/s.exec(sourceCode);

  let scriptContent = scriptMatch ? scriptMatch[1].trim() : '';
  const templateContent = templateMatch ? templateMatch[1].trim() : '';
  const styleContent = styleMatch ? styleMatch[1].trim() : '';

  const tempFileDir = dirname(
    resolve(config.TMP_COMPILED_DIR, relative(config.SRC_DIR, filePath)),
  );
  scriptContent = scriptContent.replace(
    /import\s+['"](\..*?\.css)['"]/g,
    (_, cssPath) => {
      const absoluteCssPath = resolve(dirname(filePath), cssPath);
      let relativePathFromTemp = relative(tempFileDir, absoluteCssPath).replace(
        /\\/g,
        '/',
      );
      if (!relativePathFromTemp.startsWith('.')) {
        relativePathFromTemp = './' + relativePathFromTemp;
      }
      return `import '${relativePathFromTemp}';`;
    },
  );

  scriptContent = scriptContent.replace(
    /from\s+['"](.+?)\.webs['"]/g,
    "from '$1.js'",
  );

  const isGlobalComponent = filePath.startsWith(config.GUI_DIR);
  let registryImport = '';
  let finalScript = scriptContent;

  if (!isGlobalComponent) {
    const relativePathFromSrc = filePath.substring(config.SRC_DIR.length + 1);
    const outPath = resolve(
      config.TMP_COMPILED_DIR,
      relativePathFromSrc.replace('.webs', '.js'),
    );
    let relPathToRegistry = relative(
      dirname(outPath),
      config.TMP_COMPONENT_REGISTRY,
    ).replace(/\\/g, '/');
    if (!relPathToRegistry.startsWith('.'))
      relPathToRegistry = './' + relPathToRegistry;
    registryImport = `import __globalComponents from '${relPathToRegistry}';\n`;
  }

  const templateProperty = `template: ${JSON.stringify(templateContent)}`;
  const injectedProps = `name: '${componentName}', ${templateProperty}, style: ${JSON.stringify(
    styleContent,
  )}`;

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
  const hmrCode = `
          if (import.meta.hot) {
            import.meta.hot.accept(() => {
              window.location.reload();
            });
          }`;
  return { js: registryImport + finalScript + hmrCode, css: styleContent };
}

export async function prepareBuildFiles(config) {
  console.log('[Assembler] Stage 1: Starting file compilation...');
  await ensureDir(config.TMP_COMPILED_DIR);
  const websGlob = new Bun.Glob('**/*.webs');
  const cssGlob = new Bun.Glob('**/*.css');
  const sourceEntrypoints = [];
  const publicCssEntrypoints = [];
  const pageEntrypoints = [];

  let allWebsCss = '';
  for await (const file of websGlob.scan(config.SRC_DIR)) {
    const fullPath = join(config.SRC_DIR, file);
    sourceEntrypoints.push(fullPath);

    const relativePath = fullPath.substring(config.SRC_DIR.length + 1);
    const componentName = relativePath.replace('.webs', '');

    const { js, css } = await compileWebsFile(fullPath, componentName, config);
    if (css) allWebsCss += css;

    const outPath = resolve(
      config.TMP_COMPILED_DIR,
      relativePath.replace('.webs', '.js'),
    );

    if (fullPath.startsWith(config.APP_DIR)) {
      pageEntrypoints.push({ source: fullPath, compiled: outPath });
    }

    await ensureDir(dirname(outPath));
    await writeFile(outPath, js);
  }

  await writeFile(config.TMP_APP_CSS, allWebsCss);

  if (await exists(config.PUB_DIR)) {
    console.log(
      '[Assembler] Found src/pub directory. Adding CSS files as build entrypoints...',
    );
    for await (const file of cssGlob.scan(config.PUB_DIR)) {
      const fullPath = join(config.PUB_DIR, file);
      publicCssEntrypoints.push(fullPath);
      console.log(`[Assembler] Added public CSS file: ${fullPath}`);
    }
  }

  console.log('[Assembler] Stage 1: File compilation complete.');
  return { sourceEntrypoints, pageEntrypoints, publicCssEntrypoints };
}

export async function generateComponentRegistry(config) {
  console.log('[Assembler] Generating global component registry...');
  await ensureDir(dirname(config.TMP_COMPONENT_REGISTRY));
  const glob = new Bun.Glob('**/*.webs');
  const imports = [];
  const exports = [];
  const guiDir = config.GUI_DIR;
  const registryFile = config.TMP_COMPONENT_REGISTRY;

  for await (const file of glob.scan(guiDir)) {
    const componentName = basename(file, '.webs');
    const pascalName = componentName
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');

    const compiledPath = resolve(
      config.TMP_COMPILED_DIR,
      'gui',
      `${componentName}.js`,
    );

    let relativePath = relative(dirname(registryFile), compiledPath).replace(
      /\\/g,
      '/',
    );
    if (!relativePath.startsWith('.')) relativePath = './' + relativePath;

    imports.push(`import ${pascalName} from '${relativePath}';`);
    exports.push(`  '${componentName}': ${pascalName}`);
    exports.push(`  ...(${pascalName} ? ${pascalName}.components || {} : {})`);
  }

  const content = `${imports.join(
    '\n',
  )}\n\nexport default {\n${exports.join(',\n')}\n};`;
  await writeFile(registryFile, content);
  console.log('[Assembler] Global component registry generated.');
}

async function findLayoutsForPage(pagePath, config) {
  let layouts = [];
  let currentDir = dirname(pagePath);
  while (currentDir.startsWith(config.APP_DIR)) {
    const layoutPath = join(currentDir, 'layout.webs');
    if (await exists(layoutPath)) layouts.push(layoutPath);
    if (currentDir === config.APP_DIR) break;
    currentDir = dirname(currentDir);
  }
  return layouts.reverse();
}

export async function generateRoutes(pageEntrypoints, config) {
  console.log('[Assembler] Generating server routes...');
  await ensureDir(config.TMP_WRAPPERS_DIR);
  const routeDefinitions = [];
  const layoutWrapperEntrypoints = [];
  const sourceToComponentMap = {};
  const layoutWrapperMap = {};

  for (const {
    source: sourcePagePath,
    compiled: compiledPagePath,
  } of pageEntrypoints) {
    const componentPath = relative(config.APP_DIR, sourcePagePath).replace(
      /\\/g,
      '/',
    );
    const componentName = `app/${componentPath.replace('.webs', '')}`;

    sourceToComponentMap[
      relative(config.SRC_DIR, sourcePagePath).replace(/\\/g, '/')
    ] = componentName;

    if (basename(componentName) === 'layout') continue;

    const mod = await import(compiledPagePath);
    const layouts = await findLayoutsForPage(sourcePagePath, config);
    let finalComponent = mod.default;
    let finalComponentName = componentName;

    if (layouts.length > 0) {
      finalComponentName = `layout/${componentName.replace(/\//g, '_')}`;
      layoutWrapperMap[componentName] = finalComponentName;
      const wrapperPath = join(
        config.TMP_WRAPPERS_DIR,
        `${finalComponentName.split('/')[1]}.js`,
      );

      layoutWrapperEntrypoints.push({
        name: finalComponentName,
        path: wrapperPath,
      });

      const wrapperDir = dirname(wrapperPath);
      const layoutImports = layouts
        .map((p, i) => {
          const relativeSourcePath = relative(config.SRC_DIR, p);
          const targetPath = resolve(
            config.TMP_COMPILED_DIR,
            relativeSourcePath.replace('.webs', '.js'),
          );
          let relativePath = relative(wrapperDir, targetPath).replace(
            /\\/g,
            '/',
          );
          if (!relativePath.startsWith('.')) relativePath = './' + relativePath;
          return `import Layout${i} from '${relativePath}';`;
        })
        .join('\n');
      let pageComponentRelativePath = relative(
        wrapperDir,
        compiledPagePath,
      ).replace(/\\/g, '/');
      if (!pageComponentRelativePath.startsWith('.'))
        pageComponentRelativePath = './' + pageComponentRelativePath;
      const wrapperContent = `
                import { h } from '@conradklek/webs';
                ${layoutImports}
                import PageComponent from '${pageComponentRelativePath}';
                export default {
                    name: '${finalComponentName}',
                    props: { params: Object, initialState: Object, user: Object },
                    render() {
                        const pageNode = h(PageComponent, { ...this.$props });
                        return ${layouts.reduceRight(
                          (acc, _, i) =>
                            `h(Layout${i}, { ...this.$props }, { default: () => ${acc} })`,
                          'pageNode',
                        )};
                    }
                };
            `;
      await writeFile(wrapperPath, wrapperContent);
      finalComponent = (await import(wrapperPath)).default;
    }

    let urlPath =
      '/' +
      componentPath
        .replace('.webs', '')
        .replace(/index$/, '')
        .replace(/\/\[\.\.\.(\w+)\]/g, ':$1*')
        .replace(/\[\.\.\.(\w+)\]/g, ':$1*')
        .replace(/\[(\w+)\]/g, ':$1');

    if (urlPath.length > 1 && urlPath.endsWith('/'))
      urlPath = urlPath.slice(0, -1);

    routeDefinitions.push({
      path: urlPath,
      definition: {
        component: finalComponent,
        componentName: finalComponentName,
        actions: mod.default.actions || {},
      },
    });
  }

  routeDefinitions.sort((a, b) => {
    const aIsCatchAll = a.path.includes('*');
    const bIsCatchAll = b.path.includes('*');

    if (aIsCatchAll && !bIsCatchAll) return 1;
    if (!aIsCatchAll && bIsCatchAll) return -1;
    return b.path.length - a.path.length;
  });
  console.log('[Assembler] Server routes generated.');
  const appRoutes = Object.fromEntries(
    routeDefinitions.map((r) => [r.path, r.definition]),
  );
  return { appRoutes, layoutWrapperEntrypoints, sourceToComponentMap };
}
