import { createFetchHandler } from './router.js';
import { createLogger } from '../developer/logger.js';
import { createFileSystemForUser } from './fs.server.js';

/**
 * @typedef {import('bun:sqlite').Database} Database
 * @typedef {import('bun').Server} Server
 * @typedef {import('./server-config.js').Config} Config
 * @typedef {import('../ai/ai.server.js').AI} AI
 */

/**
 * @template T
 * @typedef {import('bun').ServerWebSocket<T>} ServerWebSocket
 */

/**
 * @typedef {object} ServerContext
 * @property {Database} db
 * @property {any} dbConfig
 * @property {boolean} isProd
 * @property {Config} config
 * @property {string} SYNC_TOPIC
 * @property {string} HMR_TOPIC
 * @property {AI} ai
 * @property {Record<string, Function>} syncActions
 * @property {any} manifest
 * @property {Record<string, any>} appRoutes
 * @property {any} agentRoutes
 * @property {any} globalComponents
 * @property {any} sourceToComponentMap
 */

/**
 * @typedef {object} WebSocketData
 * @property {boolean} [isSyncChannel]
 * @property {boolean} [isHmrChannel]
 * @property {any} [user]
 * @property {any} [params]
 * @property {Record<string, Function>} [wsHandlers]
 */

/**
 * @typedef {object} WebSocketHandlerContext
 * @property {ServerWebSocket<WebSocketData>} socket - The WebSocket connection instance.
 * @property {import('./authentication.js').UserInfo | null} user - The authenticated user.
 * @property {Record<string, string>} params - The route parameters.
 * @property {Database} db - The database instance.
 * @property {import('./fs.server.js').ServerFsApi} fs - The user-scoped file system API.
 */

/**
 * @typedef {(context: WebSocketHandlerContext) => Promise<void> | void} OpenHandler
 * @typedef {(context: WebSocketHandlerContext & { message: string | Buffer }) => Promise<void> | void} MessageHandler
 * @typedef {(context: WebSocketHandlerContext) => Promise<void> | void} CloseHandler
 * @typedef {(context: WebSocketHandlerContext & { error: Error }) => Promise<void> | void} ErrorHandler
 */

const logger = createLogger('[Server]');

/**
 * This function starts the main web server, fully restoring the logic from `server-old.js`.
 * @param {ServerContext} serverContext
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
       * @param {ServerWebSocket<WebSocketData>} ws
       */
      open(ws) {
        if (ws.data?.isSyncChannel) {
          logger.info(
            'WebSocket client connected and subscribed to sync topic.',
          );
          ws.subscribe(SYNC_TOPIC);
          return;
        }

        if (ws.data?.isHmrChannel) {
          logger.info('HMR WebSocket client connected.');
          ws.subscribe(HMR_TOPIC);
          return;
        }

        const { wsHandlers, user, params } = ws.data;
        if (wsHandlers?.onOpen) {
          wsHandlers.onOpen({
            socket: ws,
            user,
            params,
            db,
            fs: createFileSystemForUser(user.id),
          });
        }
      },
      /**
       * @param {ServerWebSocket<WebSocketData>} ws
       * @param {string | Buffer} message
       */
      async message(ws, message) {
        if (ws.data?.isSyncChannel) {
          const server = Bun.serve(serverOptions);
          await handleSyncMessage(ws, message, server);
          server.stop();
          return;
        }

        const { wsHandlers, user, params } = ws.data;
        if (wsHandlers?.onMessage) {
          wsHandlers.onMessage({
            socket: ws,
            message,
            user,
            params,
            db,
            fs: createFileSystemForUser(user.id),
          });
        }
      },
      /**
       * @param {ServerWebSocket<WebSocketData>} ws
       * @param {number} _code
       * @param {string} _reason
       */
      close(ws, _code, _reason) {
        if (ws.data?.isSyncChannel) {
          ws.unsubscribe(SYNC_TOPIC);
          return;
        }
        if (ws.data?.isHmrChannel) {
          ws.unsubscribe(HMR_TOPIC);
          return;
        }

        const { wsHandlers, user, params } = ws.data;
        if (wsHandlers?.onClose) {
          wsHandlers.onClose({
            socket: ws,
            user,
            params,
            db,
            fs: createFileSystemForUser(user.id),
          });
        }
      },
      /**
       * @param {ServerWebSocket<WebSocketData>} ws
       * @param {Error} error
       */
      error(ws, error) {
        const { wsHandlers, user, params } = ws.data;
        if (wsHandlers?.onError) {
          wsHandlers.onError({
            socket: ws,
            error,
            user,
            params,
            db,
            fs: createFileSystemForUser(user?.id),
          });
        } else {
          logger.error('WebSocket error:', error);
        }
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
   * @param {Server} server
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
