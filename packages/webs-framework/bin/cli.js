#!/usr/bin/env bun

import { Database } from 'bun:sqlite';
import { createDatabase } from '../server/db';
import { config } from './utils/config';
import { performBuild } from './utils/build';
import { generateRoutesFromFileSystem } from './utils/routes';
import { startServer } from './utils/server';

async function main() {
  const serverContext = {
    db: await createDatabase(Database, config.CWD),
    appRoutes: {},
    outdir: config.OUTDIR,
    manifest: {},
    isProd: config.IS_PROD,
    sync: {
      clients: new Set(),
      statements: {},
      broadcast(message) {
        for (const client of this.clients) {
          client.send(message);
        }
      },
    },
  };

  async function buildAndReload() {
    serverContext.appRoutes = await generateRoutesFromFileSystem();

    const manifest = await performBuild(serverContext.appRoutes);
    if (!manifest) {
      console.error('Build failed, server will not start or reload.');
      process.exit(1);
    }
    serverContext.manifest = manifest;
    console.log('Manifest updated:', JSON.stringify(manifest, null, 2));
  }

  await buildAndReload();

  startServer(serverContext);

  console.log(`--- Server ready at http://localhost:${config.PORT} ---`);
}

main().catch(console.error);
