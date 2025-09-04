import { watch } from './webs-engine';
import { session } from './client-me';

const DB_NAME = 'webs-local-db';
let dbPromise = null;
let socket = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let reconnectTimeout = null;
let reconnectAttempts = 0;
const messageListeners = new Set();
let isProcessingOutbox = false;

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDB(config) {
  if (typeof window === 'undefined' || !window.indexedDB) {
    console.warn('[DB] IndexedDB not available.');
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const version = config?.version || 1;
    const request = indexedDB.open(DB_NAME, version);

    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;
      console.log(`[DB] Upgrading database to version ${version}`);

      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'opId' });
      }

      config?.clientTables?.forEach((tableSchema) => {
        if (!db.objectStoreNames.contains(tableSchema.name)) {
          const store = db.createObjectStore(tableSchema.name, {
            keyPath: tableSchema.keyPath,
            autoIncrement: tableSchema.autoIncrement,
          });
          tableSchema.indexes?.forEach((index) =>
            store.createIndex(index.name, index.keyPath, index.options),
          );
        } else {
          const store = tx.objectStore(tableSchema.name);
          const existingIndices = new Set(store.indexNames);
          tableSchema.indexes?.forEach((index) => {
            if (!existingIndices.has(index.name)) {
              store.createIndex(index.name, index.keyPath, index.options);
            }
          });
        }
      });
    };
  });
  return dbPromise;
}

const tableSubscribers = new Map();
function notify(tableName) {
  tableSubscribers.get(tableName)?.forEach((callback) => callback());
}

const coreDB = {
  db: null,
  _getDB() {
    if (!this.db) this.db = openDB(window.__WEBS_DB_CONFIG__);
    return this.db;
  },
  async performTransaction(tableNames, mode, action) {
    const db = await this._getDB();
    if (!db) return;
    const tableNamesArray = Array.isArray(tableNames)
      ? tableNames
      : [tableNames];
    const tx = db.transaction(tableNamesArray, mode);
    const result = await action(tx);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  },
  get: (tableName, key) =>
    coreDB.performTransaction(tableName, 'readonly', (tx) =>
      promisifyRequest(tx.objectStore(tableName).get(key)),
    ),
  getAll: (tableName) =>
    coreDB.performTransaction(tableName, 'readonly', (tx) =>
      promisifyRequest(tx.objectStore(tableName).getAll()),
    ),
  getAllWithPrefix: (tableName, prefix) =>
    coreDB.performTransaction(tableName, 'readonly', (tx) => {
      const store = tx.objectStore(tableName);
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
      return promisifyRequest(store.getAll(range));
    }),
  query: (tableName, indexName, query) =>
    coreDB.performTransaction(tableName, 'readonly', (tx) => {
      const store = tx.objectStore(tableName);
      const index = store.index(indexName);
      return promisifyRequest(index.getAll(query));
    }),
  put: async (tableName, record) => {
    const isSynced = window.__WEBS_DB_CONFIG__?.clientTables.find(
      (t) => t.name === tableName && t.sync,
    );
    const tables = isSynced ? [tableName, 'outbox'] : [tableName];

    await coreDB.performTransaction(tables, 'readwrite', (tx) => {
      tx.objectStore(tableName).put(record);
      if (isSynced) {
        tx.objectStore('outbox').add({
          tableName,
          type: 'put',
          data: record,
          opId: crypto.randomUUID(),
        });
      }
    });
    if (isSynced) syncEngine.process();
    notify(tableName);
  },
  bulkPut: async (tableName, records) => {
    if (!records || records.length === 0) return;
    await coreDB.performTransaction(tableName, 'readwrite', (tx) => {
      const store = tx.objectStore(tableName);
      records.forEach((record) => store.put(record));
    });
    notify(tableName);
  },
  delete: async (tableName, key) => {
    const isSynced = window.__WEBS_DB_CONFIG__?.clientTables.find(
      (t) => t.name === tableName && t.sync,
    );
    const tables = isSynced ? [tableName, 'outbox'] : [tableName];

    await coreDB.performTransaction(tables, 'readwrite', (tx) => {
      tx.objectStore(tableName).delete(key);
      if (isSynced) {
        tx.objectStore('outbox').add({
          tableName,
          type: 'delete',
          id: key,
          opId: crypto.randomUUID(),
        });
      }
    });
    if (isSynced) syncEngine.process();
    notify(tableName);
  },
  subscribe: (tableName, callback) => {
    if (!tableSubscribers.has(tableName)) {
      tableSubscribers.set(tableName, new Set());
    }
    tableSubscribers.get(tableName).add(callback);
    return () => tableSubscribers.get(tableName)?.delete(callback);
  },
  handleSyncMessage: async ({ tableName, type, data, id }) => {
    await coreDB.performTransaction(tableName, 'readwrite', (tx) => {
      const store = tx.objectStore(tableName);
      if (type === 'put') store.put(data);
      else if (type === 'delete') store.delete(id);
    });
    notify(tableName);
  },
};

export function performTransaction(tableNames, mode, action) {
  return coreDB.performTransaction(tableNames, mode, action);
}

function connectToSyncServer() {
  if (socket?.readyState === WebSocket.OPEN) return processOutbox();
  if (!isOnline) return;
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${window.location.host}/api/sync`);

  socket.onopen = () => {
    console.log('[Sync] WebSocket connection established.');
    reconnectAttempts = 0;
    processOutbox();
  };

  socket.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'sync') {
        await coreDB.handleSyncMessage(payload.data);
      } else if (payload.type === 'ack' || payload.type === 'sync-error') {
        if (payload.type === 'sync-error') {
          console.error(
            `[Sync] Server failed op ${payload.opId}:`,
            payload.error,
          );
        }
        await coreDB.performTransaction('outbox', 'readwrite', (tx) => {
          tx.objectStore('outbox').delete(payload.opId);
        });
        isProcessingOutbox = false;
        processOutbox();
      }
      messageListeners.forEach((listener) => listener(payload));
    } catch (err) {
      console.error('[Sync] Failed to process message:', err);
    }
  };

  socket.onclose = (event) => {
    if (event.code !== 1000) {
      reconnectAttempts++;
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      reconnectTimeout = setTimeout(connectToSyncServer, delay);
    }
  };

  socket.onerror = (error) => socket.close();
}

async function processOutbox() {
  if (isProcessingOutbox || socket?.readyState !== WebSocket.OPEN) return;

  const db = await coreDB._getDB();
  if (!db) return;

  coreDB
    .performTransaction('outbox', 'readonly', (tx) => {
      const store = tx.objectStore('outbox');
      const request = store.openCursor();
      return new Promise((resolve, reject) => {
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            isProcessingOutbox = true;
            socket.send(JSON.stringify(cursor.value));
          } else {
            isProcessingOutbox = false;
            resolve();
          }
        };
        request.onerror = (e) => reject(e.target.error);
      });
    })
    .catch((err) => {
      console.error('[Sync] Error reading from outbox:', err);
      isProcessingOutbox = false;
    });
}

export function db(tableName) {
  if (!tableName) throw new Error('db() requires a table name.');
  return {
    get: (key) => coreDB.get(tableName, key),
    getAll: () => coreDB.getAll(tableName),
    getAllWithPrefix: (prefix) => coreDB.getAllWithPrefix(tableName, prefix),
    query: (indexName, query) => coreDB.query(tableName, indexName, query),
    put: (record) => coreDB.put(tableName, record),
    bulkPut: (records) => coreDB.bulkPut(tableName, records),
    delete: (key) => coreDB.delete(tableName, key),
    subscribe: (callback) => coreDB.subscribe(tableName, callback),
  };
}

export const syncEngine = {
  start() {
    if (typeof window === 'undefined') return;

    watch(
      () => session.user,
      (newUser, oldUser) => {
        if (newUser && !oldUser) connectToSyncServer();
        else if (!newUser && oldUser) socket?.close(1000, 'User logged out');
      },
    );

    window.addEventListener('online', () => {
      isOnline = true;
      if (session.user) connectToSyncServer();
    });
    window.addEventListener('offline', () => {
      isOnline = false;
      socket?.close(1000, 'Network offline');
    });
  },
  process: () => {
    if (isOnline) processOutbox();
  },
  send: (message) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  },
  onMessage: (callback) => {
    messageListeners.add(callback);
    return () => messageListeners.delete(callback);
  },
};
