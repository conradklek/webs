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
  LIB_DIR: resolve(FRAMEWORK_DIR, '../lib'),
  USER_FILES_ROOT: resolve(userProjectDir, '.webs/files'),
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

  return { js: registryImport + finalScript, css: styleContent };
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

async function generateComponentRegistry() {
  console.log('[Build] Generating global component registry...');
  await ensureDir(dirname(config.TMP_COMPONENT_REGISTRY));
  const glob = new Bun.Glob('**/*.webs');
  const imports = [];
  const exports = [];
  const guiDir = config.GUI_DIR;
  const registryFile = config.TMP_COMPONENT_REGISTRY;

  for await (const file of glob.scan(guiDir)) {
    const fullPath = join(guiDir, file);
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
  console.log('[Build] Global component registry generated.');
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

async function prepareClientEntrypoint(
  sourceEntrypoints,
  layoutWrapperEntrypoints,
  dbConfig,
) {
  const appJsDir = dirname(config.TMP_APP_JS);

  const sourceLoaderEntries = sourceEntrypoints.map((fullPath) => {
    const componentName = relative(config.SRC_DIR, fullPath)
      .replace(/\\/g, '/')
      .replace('.webs', '');
    let relPath = relative(appJsDir, fullPath).replace(/\\/g, '/');
    if (!relPath.startsWith('.')) relPath = './' + relPath;
    return `['${componentName}', () => import('${relPath}')]`;
  });

  const layoutWrapperLoaderEntries = layoutWrapperEntrypoints.map(
    ({ name, path }) => {
      let relPath = relative(appJsDir, path).replace(/\\/g, '/');
      if (!relPath.startsWith('.')) relPath = './' + relPath;
      return `['${name}', () => import('${relPath}')]`;
    },
  );

  const allLoaderEntries = [
    ...sourceLoaderEntries,
    ...layoutWrapperLoaderEntries,
  ];

  let relCssPath = relative(appJsDir, config.TMP_APP_CSS).replace(/\\/g, '/');
  if (!relCssPath.startsWith('.')) relCssPath = './' + relCssPath;

  const entrypointContent = `
    import { hydrate } from '@conradklek/webs';
    import '${relCssPath}';
    const dbConfig = ${JSON.stringify({
      version: dbConfig.version,
      clientTables: dbConfig.clientTables,
    })};
    const componentLoaders = new Map([${allLoaderEntries.join(',\n  ')}]);
    hydrate(componentLoaders, dbConfig);
  `;
  await writeFile(config.TMP_APP_JS, entrypointContent);
}

async function buildClientBundle(
  sourceEntrypoints,
  layoutWrapperEntrypoints,
  dbConfig,
) {
  console.log('[Build] Stage 2: Starting client bundle...');
  await prepareClientEntrypoint(
    sourceEntrypoints,
    layoutWrapperEntrypoints,
    dbConfig,
  );

  const clientBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [
      websPlugin({
        root: config.CWD,
        registryPath: config.TMP_COMPONENT_REGISTRY,
        guiDir: config.GUI_DIR,
      }),
      tailwind,
    ],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
  });

  if (!clientBuildResult.success) {
    console.error('[Build] Stage 2: Client build failed.');
    clientBuildResult.logs.forEach((log) => console.error(log));
    return null;
  }

  console.log('[Build] Stage 2: Client bundle complete.');
  return clientBuildResult.outputs;
}

async function generateServiceWorker(buildOutputs) {
  if (!buildOutputs || buildOutputs.length === 0) return null;
  console.log('[Build] Generating service worker...');

  const swTemplatePath = resolve(config.LIB_DIR, 'cache.js');
  if (!(await exists(swTemplatePath))) {
    console.warn(
      '[Build] Service worker template (cache.js) not found. Skipping SW generation.',
    );
    return null;
  }
  const swTemplate = await Bun.file(swTemplatePath).text();

  const assetUrls = ['/'];
  for (const output of buildOutputs) {
    if (output.kind === 'entry-point' || output.kind === 'chunk') {
      if (output.path.endsWith('.js') || output.path.endsWith('.css')) {
        assetUrls.push('/' + basename(output.path));
      }
    }
  }
  console.log('[Build] Assets for service worker cache:', assetUrls);

  const manifestForSw = JSON.stringify(assetUrls.map((url) => ({ url })));
  const finalSwContent = `self.__WEBS_MANIFEST = ${manifestForSw};\n\n${swTemplate}`;

  const swOutputPath = join(config.OUTDIR, 'sw.js');
  await writeFile(swOutputPath, finalSwContent);
  console.log('[Build] Service worker generated at:', swOutputPath);
  return swOutputPath;
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
  const layoutWrapperEntrypoints = [];

  for (const {
    source: sourcePagePath,
    compiled: compiledPagePath,
  } of pageEntrypoints) {
    const componentName = relative(config.APP_DIR, sourcePagePath)
      .replace(/\\/g, '/')
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
  const appRoutes = Object.fromEntries(
    routeDefinitions.map((r) => [r.path, r.definition]),
  );
  return { appRoutes, layoutWrapperEntrypoints };
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

  const { sourceEntrypoints, pageEntrypoints } =
    await manualCompileAllWebsFiles();

  await generateComponentRegistry();

  const { default: globalComponents } = await import(
    `${config.TMP_COMPONENT_REGISTRY}?t=${Date.now()}`
  );

  const SYNC_TOPIC = 'webs-sync';

  const db = await createDatabaseAndActions(
    Database,
    dbConfig,
    config.CWD,
    writeFile,
    config,
  );

  if (!config.IS_PROD) {
    const { hashPassword } = await import('../lib/auth.js');
    const anonUser = {
      email: 'anon@webs.site',
      username: 'anon',
      password: 'password',
    };
    let existingUser = db
      .query('SELECT id FROM users WHERE username = ?')
      .get(anonUser.username);

    let anonUserId;
    if (existingUser) {
      anonUserId = existingUser.id;
    } else {
      const hashedPassword = await hashPassword(anonUser.password);
      const result = db
        .prepare(
          'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
        )
        .run(anonUser.email, anonUser.username, hashedPassword);
      anonUserId = result.lastInsertRowid;
    }

    if (anonUserId) {
      const anonPrivateDir = join(
        config.USER_FILES_ROOT,
        String(anonUserId),
        'private',
      );
      await ensureDir(anonPrivateDir);
      const welcomeFilePath = join(anonPrivateDir, 'welcome.txt');
      const welcomeContent =
        'Welcome to your new Webs file system!\n\nYou can edit this file, create new ones, and upload files from the file browser.\n\nAll changes are saved and synced in real-time.';

      if (!(await exists(welcomeFilePath))) {
        console.log(
          "[Build] Dev mode: Seeding 'welcome.txt' into anon user's file system...",
        );
        await writeFile(welcomeFilePath, welcomeContent);
      }

      const existingFile = db
        .query('SELECT path FROM files WHERE path = ? AND user_id = ?')
        .get('welcome.txt', anonUserId);
      if (!existingFile) {
        console.log("[Build] Dev mode: Seeding 'welcome.txt' into database...");
        const now = new Date().toISOString();
        const fileRecord = {
          path: 'welcome.txt',
          user_id: anonUserId,
          access: 'private',
          size: welcomeContent.length,
          last_modified: now,
          updated_at: now,
          content: Buffer.from(welcomeContent),
        };
        const insertFileStmt = db.prepare(
          'INSERT INTO files (path, user_id, access, size, last_modified, updated_at, content) VALUES ($path, $user_id, $access, $size, $last_modified, $updated_at, $content)',
        );
        insertFileStmt.run({
          $path: fileRecord.path,
          $user_id: fileRecord.user_id,
          $access: fileRecord.access,
          $size: fileRecord.size,
          $last_modified: fileRecord.last_modified,
          $updated_at: fileRecord.updated_at,
          $content: fileRecord.content,
        });
      }

      const todoCountResult = db
        .query('SELECT COUNT(*) as count FROM todos WHERE user_id = ?')
        .get(anonUserId);
      const todoCount = todoCountResult ? todoCountResult.count : 0;

      if (todoCount === 0) {
        console.log('[Build] Seeding initial todos for anon user.');
        const seedTodos = [
          {
            id: crypto.randomUUID(),
            content: 'Explore the Webs framework',
            completed: 1,
            user_id: anonUserId,
          },
          {
            id: crypto.randomUUID(),
            content: 'Build something awesome',
            completed: 0,
            user_id: anonUserId,
          },
          {
            id: crypto.randomUUID(),
            content: 'Check out the file system API',
            completed: 0,
            user_id: anonUserId,
          },
        ];

        const insert = db.prepare(
          'INSERT INTO todos (id, content, completed, user_id, created_at, updated_at) VALUES ($id, $content, $completed, $user_id, $created_at, $updated_at)',
        );

        const insertTodos = db.transaction((todos) => {
          for (const todo of todos) {
            const now = new Date().toISOString();
            insert.run({
              $id: todo.id,
              $content: todo.content,
              $completed: todo.completed,
              $user_id: todo.user_id,
              $created_at: now,
              $updated_at: now,
            });
          }
        });

        insertTodos(seedTodos);
      }
    }
  }

  const { appRoutes, layoutWrapperEntrypoints } =
    await generateRoutes(pageEntrypoints);

  const buildOutputs = await buildClientBundle(
    sourceEntrypoints,
    layoutWrapperEntrypoints,
    dbConfig,
  );
  if (!buildOutputs && config.IS_PROD) {
    process.exit(1);
  }

  const manifest = {
    js: buildOutputs.find(
      (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
    )?.path,
    css: buildOutputs.find((o) => o.path.endsWith('.css'))?.path,
  };

  const swPath = await generateServiceWorker(buildOutputs);
  if (swPath) {
    manifest.sw = swPath;
  }

  await startServer({
    db,
    dbConfig,
    manifest,
    appRoutes,
    outdir: config.OUTDIR,
    isProd: config.IS_PROD,
    port: config.PORT,
    SYNC_TOPIC,
    actionsPath: config.TMP_GENERATED_ACTIONS,
    globalComponents,
  });
}

main().catch((e) => {
  console.error('[Build] Fatal error:', e);
  process.exit(1);
});
