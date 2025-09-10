import { exists } from 'fs/promises';
import { createFileSystemForUser } from '../lib/filesystem.js';
import { createFetchHandler } from './router.js';

const LOG_PREFIX = '[Server]';
const log = (...args) => console.log(LOG_PREFIX, ...args);
const error = (...args) => console.error(LOG_PREFIX, ...args);

export async function startServer(serverContext) {
  const { db, dbConfig, isProd, config, SYNC_TOPIC, HMR_TOPIC, actionsPath } =
    serverContext;
  const { PORT } = config;

  let syncActions = {};
  if (await exists(actionsPath)) {
    const { registerActions } = await import(actionsPath);
    if (typeof registerActions === 'function')
      syncActions = registerActions(db);
  }

  const fetchHandler = createFetchHandler({ ...serverContext, syncActions });

  let websocketHandler;

  log('Starting Webs server...');
  const server = Bun.serve({
    port: PORT,
    development: !isProd,
    fetch: fetchHandler,
    websocket: (websocketHandler = {
      open(ws) {
        if (ws.data?.isSyncChannel) {
          log('WebSocket client connected and subscribed to sync topic.');
          ws.subscribe(SYNC_TOPIC);
        }
        if (ws.data?.isHmrChannel) {
          log('HMR WebSocket client connected.');
          ws.subscribe(HMR_TOPIC);
        }
        if (ws.data?.isChatChannel) {
          serverContext.ai.handleChatOpen(ws);
        }
      },
      message(ws, message) {
        if (ws.data?.isSyncChannel) {
          websocketHandler.handleSyncMessage(ws, message);
        }
        if (ws.data?.isChatChannel) {
          serverContext.ai.handleChatMessage(ws, message);
        }
      },
      close(ws) {
        if (ws.data?.isSyncChannel) {
          log('WebSocket client disconnected.');
          ws.unsubscribe(SYNC_TOPIC);
        }
        if (ws.data?.isHmrChannel) {
          log('HMR WebSocket client disconnected.');
          ws.unsubscribe(HMR_TOPIC);
        }
        if (ws.data?.isChatChannel) {
          serverContext.ai.handleChatClose(ws);
        }
      },
      async handleSyncMessage(ws, message) {
        let payload;
        try {
          payload = JSON.parse(message);
          log('Received WebSocket message from client:', payload);
          const { opId, type } = payload;
          const user = ws.data.user;

          if (type && type.startsWith('fs:')) {
            const fs = createFileSystemForUser(user.id, db);
            const { path, data, options } = payload;
            let broadcastPayload;

            if (type === 'fs:write') {
              await fs.write(path, data, options);
              const stats = await fs.stat(path, options);
              const fileBlob = await fs.cat(path, options);
              const fileContent = await fileBlob.arrayBuffer();
              const record = {
                path,
                user_id: user.id,
                content: fileContent,
                access: options?.access || 'private',
                size: stats.size,
                last_modified: new Date().toISOString(),
              };
              const result = syncActions.upsertFiles({ user }, record);
              if (result?.broadcast) broadcastPayload = result.broadcast;
            } else if (type === 'fs:rm') {
              await fs.rm(path, options);
              broadcastPayload = syncActions.deleteFiles(
                { user },
                { path, user_id: user.id },
              ).broadcast;
            }

            ws.send(JSON.stringify({ type: 'ack', opId }));
            if (broadcastPayload) {
              log(`Broadcasting FS change for op '${opId}'.`);
              server.publish(
                SYNC_TOPIC,
                JSON.stringify({ type: 'sync', data: broadcastPayload }),
              );
            }
          } else {
            const { tableName, data: recordData, id } = payload;
            if (
              !opId ||
              !type ||
              !tableName ||
              !dbConfig?.tables?.[tableName]?.sync
            )
              throw new Error('Invalid sync operation.');

            const actionName =
              type === 'put'
                ? `upsert${tableName.charAt(0).toUpperCase() + tableName.slice(1)}`
                : `delete${tableName.charAt(0).toUpperCase() + tableName.slice(1)}`;
            const actionFn = syncActions[actionName];
            if (!actionFn)
              throw new Error(`Sync action '${actionName}' not found.`);

            const result = await actionFn(
              { user },
              type === 'put' ? recordData : id,
            );
            if (result?.broadcast) {
              log(`Broadcasting database change for op '${opId}'.`);
              server.publish(
                SYNC_TOPIC,
                JSON.stringify({ type: 'sync', data: result.broadcast }),
              );
            }
            ws.send(JSON.stringify({ type: 'ack', opId }));
            log(`Sent acknowledgment for op '${opId}'.`);
          }
        } catch (e) {
          error('[Sync Error]', e.message);
          ws.send(
            JSON.stringify({
              type: 'sync-error',
              opId: payload?.opId,
              error: e.message,
            }),
          );
        }
      },
    }),
    error: (err) => {
      error('Internal server error occurred:', err);
      return new Response('Internal Server Error', { status: 500 });
    },
  });

  console.log(`Server running at http://localhost:${server.port}`);
  return server;
}
