/**
 * @file Manages data synchronization between the client and server using WebSockets.
 */

import { createLogger } from '../shared/logger.js';
import { effect } from '../engine/reactivity.js';
import { session } from './runtime.js';

/**
 * @typedef {object} SyncEngine
 * @property {(db: import('./db.client.js').coreDB) => void} init - Initializes the sync engine with a reference to the database module.
 * @property {() => void} start - Starts the sync engine, sets up listeners for online/offline events, and user authentication state.
 * @property {() => void} process - Manually triggers the outbox processing logic.
 * @property {(message: any) => void} send - Sends a message directly through the WebSocket connection, bypassing the outbox.
 * @property {(event: 'message', callback: (payload: any) => void) => () => void} addEventListener - Adds an event listener for sync engine events.
 */

const logger = createLogger('[Sync]');

/** @type {WebSocket | null} */
let socket = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let reconnectTimeout = null;
/** @type {number} */
let reconnectAttempts = 0;
/** @type {boolean} */
let isProcessingOutbox = false;
/** @type {import('./db.client.js').coreDB | null} */
let dbModule = null;

/**
 * @internal
 * A lightweight event emitter for handling synchronization events within the engine.
 */
const eventEmitter = {
  /** @type {Map<string, Set<Function>>} */
  listeners: new Map(),
  /**
   * @param {string} event
   * @param {Function} callback
   * @returns {() => void} Unsubscribe function.
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.add(callback);
      return () => eventListeners.delete(callback);
    }
    return () => {};
  },
  /**
   * @param {string} event
   * @param {any} data
   */
  emit(event, data) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  },
};

/**
 * @internal
 * Establishes a WebSocket connection to the sync server.
 */
function connectToSyncServer() {
  if (socket?.readyState === WebSocket.OPEN) {
    processOutbox();
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    logger.log('Offline, cannot connect to sync server.');
    return;
  }
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  logger.log('Attempting to connect to sync server...');
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/api/sync`;
  socket = new WebSocket(url);

  socket.onopen = () => {
    logger.log('Sync server connection established.');
    reconnectAttempts = 0;
    processOutbox();
  };

  socket.onmessage = async (event) => {
    const payload = JSON.parse(event.data);
    logger.debug('Received message from sync server:', payload);
    eventEmitter.emit('message', payload);
    if (payload.type === 'sync' && dbModule) {
      await dbModule.handleSyncMessage(payload.data);
    } else if (payload.type === 'ack' || payload.type === 'sync-error') {
      if (payload.type === 'sync-error') {
        logger.error('Sync error from server:', payload);
      }
      if (dbModule) {
        await dbModule.transaction(
          'outbox',
          'readwrite',
          (/** @type {IDBTransaction} */ tx) => {
            tx.objectStore('outbox').delete(payload.opId);
          },
        );
      }
      processOutbox();
    }
  };

  socket.onclose = (event) => {
    logger.warn('Sync server connection closed.', {
      code: event.code,
      reason: event.reason,
    });
    socket = null;
    if (event.code !== 1000) {
      reconnectAttempts++;
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      logger.log(`Will attempt to reconnect in ${delay}ms.`);
      reconnectTimeout = setTimeout(connectToSyncServer, delay);
    }
  };

  socket.onerror = (err) => {
    logger.error('Sync server connection error:', err);
    socket?.close();
  };
}

/**
 * @internal
 * Processes and sends pending operations from the 'outbox' object store.
 * @returns {Promise<void>}
 */
async function processOutbox() {
  if (isProcessingOutbox || socket?.readyState !== WebSocket.OPEN) {
    logger.debug('Skipping outbox processing.', {
      isProcessingOutbox,
      socketState: socket?.readyState,
    });
    return;
  }

  if (!dbModule) return;

  const db = await dbModule._getDB();
  if (!db) return;

  isProcessingOutbox = true;
  try {
    await dbModule.transaction(
      'outbox',
      'readonly',
      async (/** @type {IDBTransaction} */ tx) => {
        const store = tx.objectStore('outbox');
        const request = store.openCursor();

        return new Promise((resolve, reject) => {
          let itemSent = false;
          request.onsuccess = (/** @type {Event} */ e) => {
            const cursor = /** @type {any} */ (e.target).result;
            if (cursor && !itemSent) {
              itemSent = true;
              const op = cursor.value;
              logger.log('Processing and sending operation from outbox:', op);
              socket?.send(JSON.stringify(op));
            }
            resolve(undefined);
          };
          request.onerror = (/** @type {Event} */ e) =>
            reject(/** @type {any} */ (e.target).error);
        });
      },
    );
  } catch (err) {
    logger.error('Error processing outbox:', err);
  } finally {
    isProcessingOutbox = false;
  }
}

/**
 * The main sync engine API.
 * @type {SyncEngine}
 */
export const syncEngine = {
  /**
   * Initializes the sync engine with a reference to the database module.
   * @param {import('./db.client.js').coreDB} db - The core DB module.
   */
  init(db) {
    dbModule = db;
  },
  /**
   * Starts the sync engine, sets up listeners for online/offline events, and user authentication state.
   */
  start() {
    if (typeof window === 'undefined') return;

    effect(
      () => session.user,
      (
        /** @type {import('./runtime.js').User | null} */ newUser,
        /** @type {import('./runtime.js').User | null} */ oldUser,
      ) => {
        if (newUser && !oldUser) {
          logger.log('User logged in, starting sync engine.');
          connectToSyncServer();
        } else if (oldUser && !newUser) {
          logger.log('User logged out, stopping sync engine.');
          if (socket) {
            socket.close(1000, 'User logged out');
          }
        }
      },
    );

    window.addEventListener('online', () => {
      logger.log('Browser is online.');
      if (session.user) connectToSyncServer();
    });
    window.addEventListener('offline', () => {
      logger.log('Browser is offline.');
      if (socket) {
        socket.close(1000, 'Network offline');
      }
    });
  },
  /**
   * Manually triggers the outbox processing logic.
   */
  process: () => {
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) processOutbox();
    }, 100);
  },
  /**
   * Sends a message directly through the WebSocket connection, bypassing the outbox.
   * @param {any} message - The message to send.
   */
  send: (message) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  },
  /**
   * Adds an event listener for sync engine events.
   * @param {'message'} event - The event to listen for.\
   * @param {(payload: any) => void} callback - The callback function.
   * @returns {() => void} An unsubscribe function.
   */
  addEventListener: (event, callback) => {
    return eventEmitter.on(event, callback);
  },
};
