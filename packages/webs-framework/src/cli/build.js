#!/usr/bin/env bun

import { rm, mkdir, exists, writeFile } from 'fs/promises';
import { join, resolve, dirname, basename, relative } from 'path';
import { Database } from 'bun:sqlite';
import { createDatabaseAndActions } from '../lib/db.js';
import { startServer } from './server.js';
import tailwind from 'bun-plugin-tailwind';
import websPlugin from './plugin.js';

const userProjectDir = process.argv[2]
  ? resolve(process.argv[2])
  : process.cwd();
const FRAMEWORK_DIR = import.meta.dir;
const config = {
  CWD: userProjectDir,
  PORT: process.env.PORT || 3000,
  IS_PROD: process.env.NODE_ENV === 'production',
  OUTDIR: resolve(userProjectDir, 'dist'),
  TMPDIR: resolve(userProjectDir, '.webs'),
  TMP_COMPILED_DIR: resolve(userProjectDir, '.webs/compiled'),
  TMP_WRAPPERS_DIR: resolve(userProjectDir, '.webs/layout'),
  TMP_APP_JS: resolve(userProjectDir, '.webs/app.js'),
  TMP_APP_CSS: resolve(userProjectDir, '.webs/app.css'),
  SRC_DIR: resolve(userProjectDir, 'src'),
  APP_DIR: resolve(userProjectDir, 'src/app'),
  GUI_DIR: resolve(userProjectDir, 'src/gui'),
  TMP_GENERATED_ACTIONS: resolve(userProjectDir, '.webs/actions.js'),
  TMP_COMPONENT_REGISTRY: resolve(userProjectDir, '.webs/registry.js'),
};

async function compileWebsFile(filePath) {
  const sourceCode = await Bun.file(filePath).text();
  const scriptMatch = /<script[^>]*>(.*?)<\/script>/s.exec(sourceCode);
  const templateMatch = /<template>(.*?)<\/template>/s.exec(sourceCode);
  const styleMatch = /<style>([\s\S]*?)<\/style>/s.exec(sourceCode);

  let scriptContent = scriptMatch ? scriptMatch[1].trim() : '';
  const templateContent = templateMatch ? templateMatch[1].trim() : '';
  const styleContent = styleMatch ? styleMatch[1].trim() : '';
  const componentName = basename(filePath, '.webs');

  const templateProperty = `template: ${JSON.stringify(templateContent)}`;
  const injectedProps = `name: '${componentName}', ${templateProperty}, style: ${JSON.stringify(styleContent)}`;

  let finalScript;
  if (scriptContent.includes('export default')) {
    finalScript = scriptContent.replace(
      /(export default\s*\{)/,
      `$1 ${injectedProps},`,
    );
  } else {
    finalScript = `${scriptContent}\nexport default { ${injectedProps} };`;
  }
  return { js: finalScript, css: styleContent };
}

async function manualCompileAllWebsFiles() {
  console.log('[Build] Stage 1: Starting manual .webs compilation...');
  await ensureDir(config.TMP_COMPILED_DIR);
  const glob = new Bun.Glob('**/*.webs');
  const sourceEntrypoints = [];
  const pageEntrypoints = [];
  let allCss = '';

  for await (const file of glob.scan(config.SRC_DIR)) {
    const fullPath = join(config.SRC_DIR, file);
    sourceEntrypoints.push(fullPath);

    const { js, css } = await compileWebsFile(fullPath);
    if (css) allCss += css;

    const relativePath = fullPath.substring(config.SRC_DIR.length + 1);
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
  await writeFile(config.TMP_APP_CSS, allCss);
  console.log('[Build] Stage 1: Manual .webs compilation complete.');
  return { sourceEntrypoints, pageEntrypoints };
}

async function ensureDir(dirPath) {
  if (!(await exists(dirPath))) await mkdir(dirPath, { recursive: true });
}

function getDbConfig() {
  const schema = {
    name: 'webs.db',
    version: 1,
    tables: {
      users: {
        keyPath: 'id',
        fields: {
          id: { type: 'integer', primaryKey: true },
          email: { type: 'text', notNull: true, unique: true },
          username: { type: 'text', notNull: true, unique: true },
          password: { type: 'text', notNull: true },
          created_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        },
      },
      sessions: {
        keyPath: 'id',
        fields: {
          id: { type: 'text', primaryKey: true },
          user_id: {
            type: 'integer',
            notNull: true,
            references: 'users(id)',
            onDelete: 'CASCADE',
          },
          expires_at: { type: 'timestamp', notNull: true },
        },
      },
      files: {
        sync: true,
        keyPath: 'path',
        fields: {
          path: { type: 'text', primaryKey: true },
          user_id: {
            type: 'integer',
            notNull: true,
            references: 'users(id)',
            onDelete: 'CASCADE',
          },
          content: { type: 'blob', notNull: true },
          access: { type: 'text', notNull: true, default: 'private' },
          size: { type: 'integer', notNull: true, default: 0 },
          last_modified: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          updated_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        },
        indexes: [{ name: 'by-user', keyPath: 'user_id' }],
      },
      todos: {
        sync: true,
        keyPath: 'id',
        fields: {
          id: { type: 'text', primaryKey: true },
          content: { type: 'text', notNull: true },
          completed: { type: 'integer', notNull: true, default: 0 },
          user_id: {
            type: 'integer',
            notNull: true,
            references: 'users(id)',
            onDelete: 'CASCADE',
          },
          created_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          updated_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        },
        indexes: [{ name: 'by-user', keyPath: 'user_id' }],
      },
    },
  };
  const clientTables = Object.entries(schema.tables).map(([name, s]) => ({
    name,
    keyPath: s.keyPath,
    indexes: s.indexes || [],
    sync: !!s.sync,
  }));
  return { ...schema, clientTables };
}

async function prepareClientEntrypoint(dbConfig) {
  const appJsDir = dirname(config.TMP_APP_JS);
  const compiledGlob = new Bun.Glob('**/*.js');
  const loaderMapEntries = [];

  for await (const file of compiledGlob.scan(config.TMP_COMPILED_DIR)) {
    const fullPath = join(config.TMP_COMPILED_DIR, file);
    const componentName = relative(config.TMP_COMPILED_DIR, fullPath)
      .replace(/\\/g, '/')
      .replace('.js', '');
    let relPath = relative(appJsDir, fullPath).replace(/\\/g, '/');
    if (!relPath.startsWith('.')) relPath = './' + relPath;
    loaderMapEntries.push(`['${componentName}', () => import('${relPath}')]`);
  }

  let relCssPath = relative(appJsDir, config.TMP_APP_CSS).replace(/\\/g, '/');
  if (!relCssPath.startsWith('.')) relCssPath = './' + relCssPath;

  const entrypointContent = `
    import { hydrate } from '@conradklek/webs';
    import '${relCssPath}';
    const dbConfig = ${JSON.stringify({ version: dbConfig.version, clientTables: dbConfig.clientTables })};
    const componentLoaders = new Map([${loaderMapEntries.join(',\n  ')}]);
    hydrate(componentLoaders, dbConfig);
  `;
  await writeFile(config.TMP_APP_JS, entrypointContent);
}

async function buildClientBundle(dbConfig) {
  console.log('[Build] Stage 2: Starting client bundle...');
  await prepareClientEntrypoint(dbConfig);

  const clientBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [tailwind],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
  });

  if (!clientBuildResult.success) {
    console.error(
      '[Build] Stage 2: Client build failed:',
      clientBuildResult.logs,
    );
    return null;
  }

  console.log('[Build] Stage 2: Client bundle complete.');
  return {
    js: clientBuildResult.outputs.find(
      (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
    )?.path,
    css: clientBuildResult.outputs.find((o) => o.path.endsWith('.css'))?.path,
  };
}

async function findLayoutsForPage(pagePath) {
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

async function generateRoutes(pageEntrypoints) {
  console.log('[Build] Generating server routes...');
  await ensureDir(config.TMP_WRAPPERS_DIR);
  const routeDefinitions = [];

  for (const {
    source: sourcePagePath,
    compiled: compiledPagePath,
  } of pageEntrypoints) {
    const componentName = sourcePagePath
      .substring(config.APP_DIR.length + 1)
      .replace('.webs', '');
    if (basename(componentName) === 'layout') continue;

    const mod = await import(`${compiledPagePath}?t=${Date.now()}`);

    const layouts = await findLayoutsForPage(sourcePagePath);
    let finalComponent = mod.default;
    let finalComponentName = `app/${componentName}`;

    if (layouts.length > 0) {
      finalComponentName = `layout/${componentName.replace(/\//g, '_')}`;
      const wrapperPath = join(
        config.TMP_WRAPPERS_DIR,
        `${finalComponentName.split('/')[1]}.js`,
      );
      const wrapperDir = dirname(wrapperPath);

      const layoutImports = layouts
        .map((p, i) => {
          const relativeSourcePath = p.substring(config.SRC_DIR.length + 1);
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
                        return ${layouts.reduceRight((acc, _, i) => `h(Layout${i}, { ...this.$props }, { default: () => ${acc} })`, 'pageNode')};
                    }
                };
            `;
      await writeFile(wrapperPath, wrapperContent);
      finalComponent = (await import(`${wrapperPath}?t=${Date.now()}`)).default;
    }

    let urlPath =
      '/' +
      componentName
        .replace(/index$/, '')
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

  routeDefinitions.sort((a, b) => b.path.length - a.path.length);
  console.log('[Build] Server routes generated.');
  return Object.fromEntries(
    routeDefinitions.map((r) => [r.path, r.definition]),
  );
}

async function generateActionsFile() {
  const content = ` export function registerActions(db) { return {} }`;
  await writeFile(config.TMP_GENERATED_ACTIONS, content);
}

async function main() {
  await rm(config.TMPDIR, { recursive: true, force: true });
  await ensureDir(config.TMPDIR);

  const dbConfig = getDbConfig();
  await generateActionsFile();

  const { pageEntrypoints } = await manualCompileAllWebsFiles();

  const db = await createDatabaseAndActions(
    Database,
    dbConfig,
    config.CWD,
    writeFile,
    config,
  );

  const appRoutes = await generateRoutes(pageEntrypoints);
  const manifest = await buildClientBundle(dbConfig);

  if (!manifest && config.IS_PROD) process.exit(1);

  await startServer({
    db,
    dbConfig,
    manifest,
    appRoutes,
    outdir: config.OUTDIR,
    isProd: config.IS_PROD,
    port: config.PORT,
    actionsPath: config.TMP_GENERATED_ACTIONS,
  });
}

main().catch((e) => {
  console.error('[Build] Fatal error:', e);
  process.exit(1);
});
