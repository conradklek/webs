#!/usr/bin/env bun

import { rm, writeFile } from 'fs/promises';
import { watch } from 'fs';
import { join, relative } from 'path';
import { Database } from 'bun:sqlite';
import { config, getDbConfig } from './config.js';
import { createDatabaseAndActions } from './database.js';
import { AI } from './ai/index.js';
import { config as aiDefaultConfig } from './ai/config.js';
import { startServer } from './server.js';
import { createFetchHandler } from './router.js';
import {
  prepareBuildFiles,
  generateComponentRegistry,
  generateRoutes,
} from './assembler.js';
import { buildClientBundle, generateServiceWorker } from './bundler.js';
import { ensureDir, seedDevDatabase } from './utils.js';

async function main() {
  await rm(config.TMPDIR, { recursive: true, force: true });
  await ensureDir(config.TMPDIR);

  const dbConfig = getDbConfig();

  const aiConfig = {
    ...aiDefaultConfig,
    db: {
      ...aiDefaultConfig.db,
      path: join(config.TMPDIR, 'ai.db'),
      dimensions: 768,
    },
  };

  const ai = new AI(aiConfig);
  await ai.init();
  console.log('[Main] AI module initialized.');

  const { sourceEntrypoints, pageEntrypoints, publicCssEntrypoints } =
    await prepareBuildFiles(config);

  await generateComponentRegistry(config);
  const { default: globalComponents } = await import(
    config.TMP_COMPONENT_REGISTRY
  );

  const SYNC_TOPIC = 'webs-sync';
  const HMR_TOPIC = 'webs-hmr';

  const db = await createDatabaseAndActions(
    Database,
    dbConfig,
    config.CWD,
    writeFile,
    config,
  );

  if (!config.IS_PROD) {
    await seedDevDatabase(db, config, ai);
  }

  let { appRoutes, layoutWrapperEntrypoints, sourceToComponentMap } =
    await generateRoutes(pageEntrypoints, config);

  let buildOutputs = await buildClientBundle(
    sourceEntrypoints,
    layoutWrapperEntrypoints,
    publicCssEntrypoints,
    dbConfig,
    config,
  );
  if (!buildOutputs && config.IS_PROD) {
    process.exit(1);
  }

  const mainCssOutput = buildOutputs.find((o) => o.path.endsWith('app.css'));
  const publicCssOutput = buildOutputs.find(
    (o) => o.path.startsWith('pub/') && o.path.endsWith('.css'),
  );

  let manifest = {
    js: buildOutputs.find(
      (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
    )?.path,
    css: publicCssOutput?.path || mainCssOutput?.path,
  };

  const swPath = await generateServiceWorker(buildOutputs, config);
  if (swPath) {
    manifest.sw = swPath;
  }

  const serverContext = {
    db,
    ai,
    dbConfig,
    manifest,
    appRoutes,
    config,
    isProd: config.IS_PROD,
    SYNC_TOPIC,
    HMR_TOPIC,
    actionsPath: config.TMP_GENERATED_ACTIONS,
    globalComponents,
    sourceToComponentMap,
  };

  const server = await startServer(serverContext);

  if (!config.IS_PROD) {
    console.log(`[Main] Watching for file changes in: ${config.SRC_DIR}`);
    let hmrDebounceTimer;

    watch(config.SRC_DIR, { recursive: true }, (_, filename) => {
      if (filename && !filename.endsWith('~')) {
        clearTimeout(hmrDebounceTimer);
        hmrDebounceTimer = setTimeout(async () => {
          console.log(
            `[Main] File change detected: ${filename}. Rebuilding...`,
          );
          try {
            const {
              sourceEntrypoints: newSource,
              pageEntrypoints: newPages,
              publicCssEntrypoints: newPublicCss,
            } = await prepareBuildFiles(config);

            ({ appRoutes, layoutWrapperEntrypoints, sourceToComponentMap } =
              await generateRoutes(newPages, config));

            const newBuildOutputs = await buildClientBundle(
              newSource,
              layoutWrapperEntrypoints,
              newPublicCss,
              dbConfig,
              config,
            );

            if (newBuildOutputs) {
              const newMainCssOutput = newBuildOutputs.find((o) =>
                o.path.endsWith('app.css'),
              );
              const newPublicCssOutput = newBuildOutputs.find(
                (o) => o.path.startsWith('pub/') && o.path.endsWith('.css'),
              );

              manifest = {
                js: newBuildOutputs.find(
                  (o) => o.kind === 'entry-point' && o.path.endsWith('.js'),
                )?.path,
                css: newPublicCssOutput?.path || newMainCssOutput?.path,
                sw:
                  (await generateServiceWorker(newBuildOutputs, config)) ||
                  manifest.sw,
              };

              const newServerContext = {
                ...serverContext,
                manifest,
                appRoutes,
                sourceToComponentMap,
              };
              const newFetchHandler = createFetchHandler(newServerContext);

              server.reload({ fetch: newFetchHandler });

              console.log(
                '[Main] Rebuild complete. Sending HMR reload message.',
              );
              const relativePath = relative(
                config.SRC_DIR,
                join(config.SRC_DIR, filename),
              ).replace(/\\/g, '/');
              server.publish(
                HMR_TOPIC,
                JSON.stringify({ type: 'update', file: relativePath }),
              );
            } else {
              console.error('[Main] Rebuild failed. HMR message not sent.');
            }
          } catch (e) {
            console.error('[Main] Error during rebuild:', e);
          }
        }, 100);
      }
    });
  }

  ai.initialize(server, db);

  const shutdown = async () => {
    console.log('\n[Main] Shutting down gracefully...');
    if (ai) await ai.shutdown();
    server.stop(true);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[Main] Fatal error:', e);
  process.exit(1);
});
