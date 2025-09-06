#!/usr/bin/env bun

import { rm, mkdir, exists, writeFile, cp, readdir } from 'fs/promises';
import { join, resolve, dirname, basename, relative } from 'path';
import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';

import websPlugin from './plugin';
import tailwind from 'bun-plugin-tailwind';
import { createDatabaseAndActions } from '../lib/db.js';
import { startServer } from './server.js';
import { createFileSystemForUser } from '../lib/fs.js';

const userProjectDir = process.argv[2]
  ? resolve(process.argv[2])
  : process.cwd();

const frameworkSchema = {
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
        access: { type: 'text', notNull: true, default: 'private' },
        size: { type: 'integer', notNull: true, default: 0 },
        last_modified: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        updated_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        content: { type: 'blob', notNull: true },
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

const FRAMEWORK_DIR = import.meta.dir;
const config = {
  CWD: userProjectDir,
  PORT: process.env.PORT || 3000,
  IS_PROD: process.env.NODE_ENV === 'production',
  OUTDIR: resolve(userProjectDir, 'dist'),
  TMPDIR: resolve(userProjectDir, '.webs'),
  TMP_SERVER_DIR: resolve(userProjectDir, '.webs/server'),
  TMP_PREBUILD_DIR: resolve(userProjectDir, '.webs/prebuild'),
  TMP_WRAPPERS_DIR: resolve(userProjectDir, '.webs/layout'),
  TMP_GENERATED_ACTIONS: resolve(userProjectDir, '.webs/actions.js'),
  TMP_APP_CSS: resolve(userProjectDir, '.webs/app.css'),
  TMP_APP_JS: resolve(userProjectDir, '.webs/app.js'),
  TMP_COMPONENT_REGISTRY: resolve(userProjectDir, '.webs/registry.js'),
  SRC_DIR: resolve(userProjectDir, 'src'),
  APP_DIR: resolve(userProjectDir, 'src/app'),
  GUI_DIR: resolve(userProjectDir, 'src/gui'),
  USER_FILES_ROOT: resolve(userProjectDir, '.webs/files'),
  DB_SCHEMA_HASH_PATH: resolve(userProjectDir, '.webs/db_schema.hash'),
};

const SYNC_TOPIC = 'webs-sync';
let appRoutes = {};

async function buildServerComponents() {
  const glob = new Bun.Glob('**/*.webs');
  const entrypoints = [];
  if (await exists(config.APP_DIR)) {
    for await (const file of glob.scan(config.APP_DIR))
      entrypoints.push(join(config.APP_DIR, file));
  }
  if (await exists(config.GUI_DIR)) {
    for await (const file of glob.scan(config.GUI_DIR))
      entrypoints.push(join(config.GUI_DIR, file));
  }
  if (entrypoints.length === 0)
    return { success: true, entrypoints: [], pageEntrypoints: [] };

  if (config.IS_PROD) await rm(config.OUTDIR, { recursive: true, force: true });
  await ensureDir(config.OUTDIR);

  const result = await Bun.build({
    entrypoints,
    outdir: config.TMP_SERVER_DIR,
    target: 'bun',
    plugins: [
      websPlugin({
        root: config.SRC_DIR,
        registryPath: config.TMP_COMPONENT_REGISTRY,
      }),
      tailwind,
    ],
    external: ['@conradklek/webs', 'bun-plugin-tailwind'],
    naming: '[dir]/[name].[ext]',
    root: config.SRC_DIR,
  });

  if (!result.success) {
    console.error('[Build] Server component build failed.');
    result.logs.forEach((log) => console.error(log));
    return { success: false, entrypoints: [], pageEntrypoints: [] };
  }
  const pageEntrypoints = entrypoints.filter((p) =>
    p.startsWith(config.APP_DIR),
  );
  return { success: true, entrypoints, pageEntrypoints };
}

async function ensureDir(dirPath) {
  if (!(await exists(dirPath))) {
    await mkdir(dirPath, { recursive: true });
  }
}

async function discoverAndBuildDbConfig(scanDir) {
  const userTables = {};

  const clientTables = Object.entries(frameworkSchema.tables)
    .filter(([, schema]) => schema.sync || schema.keyPath)
    .map(([name, schema]) => ({
      name,
      keyPath: schema.keyPath,
      indexes: schema.indexes || [],
      sync: !!schema.sync,
    }));

  const glob = new Bun.Glob('**/*.js');
  if (!(await exists(scanDir))) {
    console.warn(
      '[Build] Scan directory for schema discovery not found. Skipping user schema discovery.',
    );
    return { ...frameworkSchema, clientTables };
  }

  for await (const file of glob.scan(scanDir)) {
    const fullPath = resolve(scanDir, file);
    try {
      const mod = await import(`${fullPath}?t=${Date.now()}`);
      const componentTables = mod.default?.tables;

      if (componentTables && typeof componentTables === 'object') {
        for (const [tableName, schema] of Object.entries(componentTables)) {
          if (userTables[tableName]) {
            console.warn(
              `[Build] Warning: Duplicate table definition for '${tableName}'. Overwriting.`,
            );
          }
          userTables[tableName] = schema;
          if (!clientTables.some((t) => t.name === tableName)) {
            clientTables.push({
              name: tableName,
              keyPath: schema.keyPath,
              indexes: schema.indexes || [],
              sync: !!schema.sync,
            });
          }
        }
      }
    } catch (e) {
      console.error(`[Build] Error importing schema from ${fullPath}:`, e);
    }
  }

  const finalTables = { ...frameworkSchema.tables, ...userTables };
  const schemaString = JSON.stringify(finalTables);
  const currentHash = createHash('sha256')
    .update(schemaString)
    .digest('hex')
    .substring(0, 16);

  let lastVersion = 0;
  if (await exists(config.DB_SCHEMA_HASH_PATH)) {
    const stored = await Bun.file(config.DB_SCHEMA_HASH_PATH).text();
    const [hash, version] = stored.split(':');
    if (hash === currentHash) {
      return {
        name: 'webs.db',
        version: parseInt(version, 10),
        tables: finalTables,
        clientTables,
      };
    }
    lastVersion = parseInt(version, 10);
  }

  const newVersion = lastVersion + 1;
  await writeFile(config.DB_SCHEMA_HASH_PATH, `${currentHash}:${newVersion}`);
  console.log(
    `[Build] Database schema change detected. New version: ${newVersion}`,
  );

  return {
    name: 'webs.db',
    version: newVersion,
    tables: finalTables,
    clientTables,
  };
}

async function buildServiceWorker(clientOutputs) {
  const swEntryPath = (await exists(resolve(config.CWD, '../lib/cache.js')))
    ? resolve(config.CWD, '../lib/cache.js')
    : resolve(FRAMEWORK_DIR, '../lib/cache.js');
  if (!(await exists(swEntryPath))) return null;

  const swBuildResult = await Bun.build({
    entrypoints: [swEntryPath],
    outdir: config.OUTDIR,
    target: 'browser',
    minify: config.IS_PROD,
    naming: config.IS_PROD ? 'sw-[hash].js' : 'sw.js',
    sourcemap: 'none',
  });
  if (!swBuildResult.success) {
    console.error('[Build] Service worker build failed.');
    return null;
  }

  const swOutput = swBuildResult.outputs[0];
  const assetManifest = clientOutputs.map((o) => ({
    url: `/${basename(o.path)}`,
    revision: null,
  }));
  const routeManifest = Object.keys(appRoutes).map((routePath) => ({
    url: routePath,
    revision: null,
  }));
  if (!appRoutes['/']) routeManifest.push({ url: '/', revision: null });

  let swContent = await swOutput.text();
  swContent =
    `self.__WEBS_MANIFEST = ${JSON.stringify([...assetManifest, ...routeManifest], null, 2)};\n` +
    swContent;
  await Bun.write(swOutput.path, swContent);
  return swOutput;
}

async function buildClientAndNotify(entrypoints, currentDbConfig) {
  await prepareClientEntrypoint(entrypoints, currentDbConfig);
  await prepareCss();

  const clientBuildResult = await Bun.build({
    entrypoints: [config.TMP_APP_JS],
    outdir: config.OUTDIR,
    target: 'browser',
    splitting: true,
    minify: config.IS_PROD,
    naming: config.IS_PROD ? '[name]-[hash].[ext]' : '[name].[ext]',
    plugins: [
      websPlugin({
        root: config.SRC_DIR,
        registryPath: config.TMP_COMPONENT_REGISTRY,
      }),
      tailwind,
    ],
    sourcemap: config.IS_PROD ? 'none' : 'inline',
  });
  if (!clientBuildResult.success) {
    console.error('[Build] Client build failed.');
    clientBuildResult.logs.forEach((log) => console.error(log));
    return null;
  }

  const swOutput = await buildServiceWorker(clientBuildResult.outputs);

  const manifest = {
    js: clientBuildResult.outputs.find(
      (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
    )?.path,
    css: clientBuildResult.outputs.find((o) => o.path.endsWith('.css'))?.path,
    sw: swOutput?.path,
  };

  return manifest;
}

async function prepareCss() {
  const glob = new Bun.Glob('**/*.webs');
  const componentStyles = [];
  const styleBlockRegex = /<style>([\s\S]*?)<\/style>/s;

  for await (const file of glob.scan(config.SRC_DIR)) {
    const fullPath = join(config.SRC_DIR, file);
    const src = await Bun.file(fullPath).text();
    const styleMatch = src.match(styleBlockRegex);
    if (styleMatch?.[1]?.trim()) {
      componentStyles.push(styleMatch[1].trim());
    }
  }
  await Bun.write(config.TMP_APP_CSS, componentStyles.join('\n'));
}

async function prepareClientEntrypoint(allEntrypoints, currentDbConfig) {
  const componentLoaders = [];
  const componentNames = new Set(
    allEntrypoints.map((p) =>
      resolve(p)
        .substring(config.SRC_DIR.length + 1)
        .replace('.webs', ''),
    ),
  );
  const glob = new Bun.Glob('**/*.js');

  const appJsDir = dirname(config.TMP_APP_JS);

  const processDir = async (dir, prefix = '') => {
    if (!(await exists(dir))) return;
    for await (const file of glob.scan(dir)) {
      const fullPath = resolve(dir, file);
      const componentName =
        prefix + fullPath.substring(dir.length + 1).replace('.js', '');

      let relPath = relative(appJsDir, fullPath);
      if (!relPath.startsWith('.')) {
        relPath = './' + relPath;
      }

      if (prefix === '' && componentNames.has(componentName)) {
        componentLoaders.push(
          `['${componentName}', () => import('${relPath}')]`,
        );
      } else if (prefix !== '') {
        componentLoaders.push(
          `['${componentName}', () => import('${relPath}')]`,
        );
      }
    }
  };

  await processDir(config.TMP_SERVER_DIR);
  await processDir(config.TMP_WRAPPERS_DIR, 'layout/');

  const dbConfigForClient = {
    version: currentDbConfig.version,
    clientTables: currentDbConfig.clientTables,
  };

  let relCssPath = relative(appJsDir, config.TMP_APP_CSS);
  if (!relCssPath.startsWith('.')) {
    relCssPath = './' + relCssPath;
  }

  const entrypointContent = `import { hydrate } from '@conradklek/webs';
import '${relCssPath}';
const dbConfig = ${JSON.stringify(dbConfigForClient)};
const componentLoaders = new Map([${componentLoaders.join(',\n  ')}]);
hydrate(componentLoaders, dbConfig);`;
  await Bun.write(config.TMP_APP_JS, entrypointContent);
}

async function findLayoutsForPage(pagePath) {
  const layouts = [];
  let currentDir = dirname(pagePath);
  while (currentDir.startsWith(config.APP_DIR)) {
    const layoutPath = join(currentDir, 'layout.webs');
    if (await exists(layoutPath)) {
      layouts.push(layoutPath);
    }
    if (currentDir === config.APP_DIR) break;
    currentDir = dirname(currentDir);
  }
  return layouts.reverse();
}

async function generateRoutesFromFileSystem(pageEntrypoints) {
  if (!(await exists(config.TMP_SERVER_DIR))) return {};

  await ensureDir(config.TMP_WRAPPERS_DIR);

  const pageFiles = new Set(
    pageEntrypoints.map((p) => p.substring(config.SRC_DIR.length + 1)),
  );

  const glob = new Bun.Glob('**/*.js');
  const routeDefinitions = [];

  const compiledPageModules = new Map();
  for await (const file of glob.scan(config.TMP_SERVER_DIR)) {
    const fullPath = resolve(config.TMP_SERVER_DIR, file);
    const relativePath = fullPath.substring(config.TMP_SERVER_DIR.length + 1);
    if (pageFiles.has(relativePath.replace('.js', '.webs'))) {
      try {
        const mod = await import(`${fullPath}?t=${Date.now()}`);
        if (mod.default)
          compiledPageModules.set(relativePath.replace('.js', ''), mod);
      } catch (e) {
        console.error(
          `[Build] Failed to import compiled page module ${fullPath}:`,
          e,
        );
      }
    }
  }

  for (const [componentName, mod] of compiledPageModules.entries()) {
    if (basename(componentName) === 'layout') continue;

    const layouts = await findLayoutsForPage(
      join(config.SRC_DIR, `${componentName}.webs`),
    );
    let finalComponent = mod.default;
    let finalComponentName = componentName;

    if (layouts.length > 0) {
      finalComponentName = `layout/${componentName.replace(/\//g, '_')}`;
      const wrapperPath = join(
        config.TMP_WRAPPERS_DIR,
        `${finalComponentName.split('/')[1]}.js`,
      );
      const wrapperDir = dirname(wrapperPath);

      const layoutImports = layouts
        .map((p, i) => {
          const targetPath = resolve(
            config.TMP_SERVER_DIR,
            p.substring(config.SRC_DIR.length + 1).replace('.webs', '.js'),
          );
          let relativePath = relative(wrapperDir, targetPath).replace(
            /\\/g,
            '/',
          );
          if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
          }
          return `import Layout${i} from '${relativePath}';`;
        })
        .join('\n');

      const pageComponentTargetPath = resolve(
        config.TMP_SERVER_DIR,
        `${componentName}.js`,
      );
      let pageComponentRelativePath = relative(
        wrapperDir,
        pageComponentTargetPath,
      ).replace(/\\/g, '/');
      if (!pageComponentRelativePath.startsWith('.')) {
        pageComponentRelativePath = './' + pageComponentRelativePath;
      }

      const layoutComponentsList = layouts
        .map((_, i) => `Layout${i}`)
        .join(', ');

      const wrapperContent = `import { h } from '@conradklek/webs';
${layoutImports}
import PageComponent from '${pageComponentRelativePath}';

export default {
  name: '${finalComponentName}',
  props: { params: Object, initialState: Object, user: Object },
  components: {
    PageComponent,
    ${layoutComponentsList}
  },
  render() {
    const pageNode = h(this.PageComponent, { ...this.$props });
    return ${layouts.reduceRight((acc, _, i) => `h(this.Layout${i}, { ...this.$props }, { default: () => ${acc} })`, 'pageNode')};
  }
};`;

      await writeFile(wrapperPath, wrapperContent);
      try {
        // Bust the import cache for the newly written file
        const importedModule = await import(`${wrapperPath}?v=${Date.now()}`);
        finalComponent = importedModule.default;
      } catch (e) {
        console.error(
          `[Build] Failed to import layout wrapper for ${componentName}:`,
          e,
        );
        finalComponent = mod.default;
      }
    }

    let urlPath =
      '/' +
      componentName
        .substring('app/'.length)
        .replace(/index$/, '')
        .replace(/\[\.\.\.(\w+)\]/g, ':$1*')
        .replace(/\[(\w+)\]/g, ':$1');
    if (urlPath.length > 1 && urlPath.endsWith('/'))
      urlPath = urlPath.slice(0, -1);

    routeDefinitions.push({
      path: urlPath,
      definition: {
        component: finalComponent,
        actions: mod.default.actions || {},
        componentName: finalComponentName,
        websocket: mod.default.websocket || null,
      },
    });
  }

  routeDefinitions.sort((a, b) => {
    const aParts = a.path.split('/');
    const bParts = b.path.split('/');
    const len = Math.min(aParts.length, bParts.length);
    for (let i = 0; i < len; i++) {
      const aPart = aParts[i];
      const bPart = bParts[i];

      if (aPart === bPart) continue;

      const aIsDynamic = aPart.startsWith(':');
      const bIsDynamic = bPart.startsWith(':');

      if (aIsDynamic && !bIsDynamic) return 1;
      if (!aIsDynamic && bIsDynamic) return -1;

      if (aIsDynamic && bIsDynamic) {
        const aIsCatchAll = aPart.endsWith('*');
        const bIsCatchAll = bPart.endsWith('*');
        if (aIsCatchAll && !bIsCatchAll) return 1;
        if (!aIsCatchAll && bIsCatchAll) return -1;
      }
    }
    return b.path.length - a.path.length;
  });

  return Object.fromEntries(
    routeDefinitions.map((r) => [r.path, r.definition]),
  );
}

async function prebuildAndGenerateRegistry(prebuildDir, registryPath) {
  const glob = new Bun.Glob('**/*.webs');
  const allEntrypoints = [];
  if (await exists(config.SRC_DIR)) {
    for await (const file of glob.scan(config.SRC_DIR)) {
      allEntrypoints.push(join(config.SRC_DIR, file));
    }
  }

  const prebuildResult = await Bun.build({
    entrypoints: allEntrypoints,
    outdir: prebuildDir,
    target: 'bun',
    plugins: [websPlugin({ root: config.SRC_DIR, skipRegistry: true })],
    external: ['@conradklek/webs', 'bun-plugin-tailwind'],
    naming: '[dir]/[name].[ext]',
    root: config.SRC_DIR,
  });

  if (!prebuildResult.success) {
    console.error('[Build] Pre-build for registry generation failed.');
    return false;
  }

  const jsGlob = new Bun.Glob('**/*.js');
  const imports = [];
  const exports = [];
  const guiPrebuildDir = join(prebuildDir, 'gui');

  const registryDir = dirname(registryPath);

  if (await exists(guiPrebuildDir)) {
    for await (const file of jsGlob.scan(guiPrebuildDir)) {
      const componentName = basename(file, '.js');
      const importName = componentName.replace(/-/g, '_');
      const absoluteComponentPath = resolve(guiPrebuildDir, file);

      let relativeComponentPath = relative(
        registryDir,
        absoluteComponentPath,
      ).replace(/\\/g, '/');
      if (!relativeComponentPath.startsWith('.')) {
        relativeComponentPath = './' + relativeComponentPath;
      }

      imports.push(`import ${importName} from '${relativeComponentPath}';`);
      exports.push(`  '${componentName}': ${importName},`);
    }
  }

  const content = `${imports.join('\n')}
export default {
${exports.join('\n')}
};`;

  await writeFile(registryPath, content);
  console.log('[Build] Global component registry generated.');
  return true;
}

async function generateActionsFile(dbConfig, config) {
  const dbModulePath = resolve(FRAMEWORK_DIR, '../lib/db.js');
  const fsModulePath = resolve(FRAMEWORK_DIR, '../lib/fs.js');
  const sshModulePath = resolve(FRAMEWORK_DIR, '../lib/ssh.js');

  const actionContent = `
import { addDoc, setDoc, deleteDoc, updateDoc } from '${dbModulePath}';
import { createFileSystemForUser } from '${fsModulePath}';
import { shellManager } from '${sshModulePath}';

export function registerActions(db) {
  const actions = {
    async upsertTodos({ user }, record) {
      if (!user) throw new Error('Unauthorized');
      
      const recordToInsert = { ...record };

      if (recordToInsert.hasOwnProperty('name') && !recordToInsert.hasOwnProperty('content')) {
        recordToInsert.content = recordToInsert.name;
        delete recordToInsert.name;
      }

      if (!recordToInsert.user_id) {
        recordToInsert.user_id = user.id;
      }
      
      if (!recordToInsert.content || typeof recordToInsert.content !== 'string' || !recordToInsert.content.trim()) {
        throw new Error('Todo content cannot be empty.');
      }

      const result = await (recordToInsert.id ? updateDoc : addDoc)(db, 'todos', recordToInsert);
      return { broadcast: { tableName: 'todos', type: 'put', data: result } };
    },
    async deleteTodos({ user }, id) {
      if (!user) throw new Error('Unauthorized');
      await deleteDoc(db, 'todos', id);
      return { broadcast: { tableName: 'todos', type: 'delete', id } };
    },
    async upsertFiles({ user }, record) {
      if (!user) throw new Error('Unauthorized');
      const result = await (record.id ? updateDoc : addDoc)(db, 'files', record);
      return { broadcast: { tableName: 'files', type: 'put', data: result } };
    },
    async deleteFiles({ user }, id) {
      if (!user) throw new Error('Unauthorized');
      await deleteDoc(db, 'files', id);
      return { broadcast: { tableName: 'files', type: 'delete', id } };
    },
  };
  
  const dynamicActions = {
    async exec({ user, $ }, command) {
      if (!user) throw new Error('Unauthorized');
      const proc = $.spawn(command);
      const { stdout, stderr, exitCode } = await proc.exited;
      return { 
        stdout: stdout.toString(), 
        stderr: stderr.toString(), 
        exitCode,
      };
    },
    async pwd({ user, $ }) {
      if (!user) throw new Error('Unauthorized');
      const proc = $.spawn(['pwd']);
      const { stdout, stderr, exitCode } = await proc.exited;
      return { stdout: stdout.toString().trim(), stderr: stderr.toString(), exitCode };
    },
    async ls({ user, fs }, path = '.') {
      if (!user) throw new Error('Unauthorized');
      const entries = await fs.ls(path, { access: 'private' });
      return { entries };
    },
  };

  return { ...actions, ...dynamicActions };
}
  `;

  await writeFile(config.TMP_GENERATED_ACTIONS, actionContent);
  console.log('[Build] Server actions file generated.');
}

async function main() {
  await ensureDir(config.TMPDIR);
  await ensureDir(config.USER_FILES_ROOT);
  await ensureDir(config.TMP_WRAPPERS_DIR);
  await ensureDir(config.TMP_SERVER_DIR);
  await ensureDir(config.TMP_PREBUILD_DIR);

  const prebuildSuccess = await prebuildAndGenerateRegistry(
    config.TMP_PREBUILD_DIR,
    config.TMP_COMPONENT_REGISTRY,
  );
  if (!prebuildSuccess) {
    if (config.IS_PROD) process.exit(1);
    return;
  }

  const dbConfig = await discoverAndBuildDbConfig(config.TMP_PREBUILD_DIR);

  await generateActionsFile(dbConfig, config);

  const { success, entrypoints, pageEntrypoints } =
    await buildServerComponents();
  if (!success) {
    if (config.IS_PROD) process.exit(1);
    return;
  }

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

  appRoutes = await generateRoutesFromFileSystem(pageEntrypoints);
  const manifest = await buildClientAndNotify(entrypoints, dbConfig);
  if (!manifest && config.IS_PROD) process.exit(1);

  const server = await startServer({
    db,
    dbConfig,
    manifest,
    appRoutes,
    outdir: config.OUTDIR,
    isProd: config.IS_PROD,
    port: config.PORT,
    SYNC_TOPIC,
    actionsPath: config.TMP_GENERATED_ACTIONS,
  });

  if (!config.IS_PROD) {
    const handler = () => {
      server.stop();
      process.exit(0);
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
  }
}

main().catch((e) => {
  console.error('[Build] Fatal error during build process:', e);
  process.exit(1);
});
