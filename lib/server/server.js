import { createFetchHandler } from './router.js';
import { createLogger } from '../core/logger.js';
import { createFileSystemForUser } from './fs.server.js';

const logger = createLogger('[Server]');

/**
 * This function starts the main web server, fully restoring the logic from `server-old.js`.
 * @param {object} serverContext
 * @param {import('bun:sqlite').Database} serverContext.db
 * @param {any} serverContext.dbConfig
 * @param {boolean} serverContext.isProd
 * @param {import('./server-config').Config} serverContext.config
 * @param {string} serverContext.SYNC_TOPIC
 * @param {string} serverContext.HMR_TOPIC
 * @param {import('../ai/ai.server.js').AI} serverContext.ai
 * @param {Record<string, Function>} serverContext.syncActions
 * @param {any} serverContext.manifest
 * @param {Record<string, any>} serverContext.appRoutes
 * @param {any} serverContext.globalComponents
 * @param {any} serverContext.sourceToComponentMap
 */
export async function startServer(serverContext) {
  const { db, dbConfig, isProd, config, SYNC_TOPIC, HMR_TOPIC, syncActions } =
    serverContext;
  const { PORT } = config;

  const fetchHandler = createFetchHandler(serverContext);

  logger.info('Starting Webs server...');

  const serverOptions = {
    port: PORT,
    development: !isProd,
    fetch: fetchHandler,
    websocket: {
      /**
       * @param {import('bun').ServerWebSocket<{isSyncChannel?: boolean, isHmrChannel?: boolean, isChatChannel?: boolean, user?: any}>} ws
       */
      open(ws) {
        if (ws.data?.isSyncChannel) {
          logger.info(
            'WebSocket client connected and subscribed to sync topic.',
          );
          ws.subscribe(SYNC_TOPIC);
        }
        if (ws.data?.isHmrChannel) {
          logger.info('HMR WebSocket client connected.');
          ws.subscribe(HMR_TOPIC);
        }
        if (ws.data?.isChatChannel) {
          serverContext.ai.handleChatOpen(/** @type {any} */ (ws));
        }
      },
      /**
       * @param {import('bun').ServerWebSocket<{isSyncChannel?: boolean, isChatChannel?: boolean, user?: any}>} ws
       * @param {string | Buffer} message
       */
      async message(ws, message) {
        if (ws.data?.isSyncChannel) {
          const server = Bun.serve(serverOptions);
          await handleSyncMessage(ws, message, server);
          server.stop();
        }
        if (ws.data?.isChatChannel) {
          serverContext.ai.handleChatMessage(/** @type {any} */ (ws), message);
        }
      },
      /**
       * @param {import('bun').ServerWebSocket<{isSyncChannel?: boolean, isHmrChannel?: boolean, isChatChannel?: boolean}>} ws
       */
      close(ws) {
        if (ws.data?.isSyncChannel) ws.unsubscribe(SYNC_TOPIC);
        if (ws.data?.isHmrChannel) ws.unsubscribe(HMR_TOPIC);
        if (ws.data?.isChatChannel)
          serverContext.ai.handleChatClose(/** @type {any} */ (ws));
      },
    },
    error: (/** @type {Error} */ err) => {
      logger.error('Internal server error occurred:', err);
      return new Response('Internal Server Error', { status: 500 });
    },
  };

  /**
   * Handles incoming WebSocket messages for data synchronization.
   * @param {import('bun').ServerWebSocket<{user?: any}>} ws
   * @param {string | Buffer} message
   * @param {import('bun').Server} server
   */
  async function handleSyncMessage(ws, message, server) {
    let payload;
    try {
      payload = JSON.parse(String(message));
      const { opId, type } = payload;
      const user = ws.data.user;

      if (type?.startsWith('fs:')) {
        const fs = createFileSystemForUser(user.id);
        const { path, data, options } = payload;
        let broadcastPayload;

        if (type === 'fs:write') {
          await fs.write(path, data, options);
          const stats = await fs.stat(path, options);
          const fileBlob = await fs.cat(path, options);
          const record = {
            path,
            user_id: user.id,
            content: await fileBlob.arrayBuffer(),
            access: options?.access || 'private',
            size: stats.size,
            last_modified: new Date().toISOString(),
          };
          if (syncActions.upsertFiles) {
            broadcastPayload = syncActions.upsertFiles(
              { user },
              record,
            )?.broadcast;
          }
        } else if (type === 'fs:rm') {
          await fs.rm(path, options);
          if (syncActions.deleteFiles) {
            broadcastPayload = syncActions.deleteFiles(
              { user },
              { path, user_id: user.id },
            )?.broadcast;
          }
        }

        ws.send(JSON.stringify({ type: 'ack', opId }));
        if (broadcastPayload) {
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
        ) {
          throw new Error('Invalid sync operation.');
        }

        const actionName =
          type === 'put'
            ? `upsert${tableName.charAt(0).toUpperCase() + tableName.slice(1)}`
            : `delete${tableName.charAt(0).toUpperCase() + tableName.slice(1)}`;
        const actionFn = syncActions[actionName];
        if (!actionFn)
          throw new Error(`Sync action '${actionName}' not found.`);

        const result = await actionFn(
          { user },
          type === 'put' ? recordData : { id },
        );
        if (result?.broadcast) {
          server.publish(
            SYNC_TOPIC,
            JSON.stringify({ type: 'sync', data: result.broadcast }),
          );
        }
        ws.send(JSON.stringify({ type: 'ack', opId }));
      }
    } catch (e) {
      const error = /** @type {Error} */ (e);
      logger.error('Sync Error:', error.message);
      ws.send(
        JSON.stringify({
          type: 'sync-error',
          opId: payload?.opId,
          error: error.message,
        }),
      );
    }
  }

  logger.info(`Server running at http://localhost:${PORT}`);
  return serverOptions;
}
