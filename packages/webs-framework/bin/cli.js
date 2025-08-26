#!/usr/bin/env bun

import { Database } from 'bun:sqlite';
import { createDatabase } from '../server/db';
import { config } from './utils/config';
import { performBuild, getHmrClients } from './utils/build';
import { generateRoutesFromFileSystem } from './utils/routes';
import { startServer } from './utils/server';
import { watch } from 'fs';

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

  async function buildAndReload(changedFile) {
    const manifest = await performBuild(serverContext.appRoutes, changedFile);
    if (!manifest) {
      console.error('Build failed, server will not start or reload.');
      process.exit(1);
    }
    serverContext.manifest = manifest;
    console.log('Manifest updated:', JSON.stringify(manifest, null, 2));

    serverContext.appRoutes = await generateRoutesFromFileSystem();
  }

  await buildAndReload();
  const server = startServer(serverContext);

  if (!config.IS_PROD) {
    console.log('--- Setting up HMR file watcher ---');
    const watcher = watch(
      config.SRC_DIR,
      { recursive: true },
      async (event, filename) => {
        if (
          filename &&
          (filename.endsWith('.webs') || filename.endsWith('.css'))
        ) {
          console.log(`Detected ${event} in ${filename}. Rebuilding...`);
          await buildAndReload(filename);
          getHmrClients().forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'update' }));
            }
          });
        }
      },
    );

    process.on('SIGINT', () => {
      console.log('Closing HMR watcher...');
      watcher.close();
      server.stop();
      process.exit(0);
    });
  }
}

main().catch(console.error);
