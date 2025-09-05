import { session } from './session.js';
import { watch, state } from './engine.js';
import { onUnmounted } from './renderer.js';

const LOG_PREFIX = '[Sync] Client:';
const log = (...args) => console.log(LOG_PREFIX, ...args);
const warn = (...args) => console.warn(LOG_PREFIX, ...args);
const error = (...args) => console.error(LOG_PREFIX, ...args);

const coreFS = {
  readFile: (path) =>
    db('files')
      .get(path)
      .then((file) => (file ? file.content : null)),
  listDirectory: (path) =>
    db('files')
      .getAllWithPrefix(path)
      .then((files) =>
        files.map((file) => ({
          name: file.path.substring(path.length),
          ...file,
        })),
      ),

  async createOperation(payload) {
    if (!session.isLoggedIn) throw new Error('User not logged in.');
    const op = { ...payload, opId: crypto.randomUUID() };

    log('Creating FS operation and adding to outbox:', op);

    await performTransaction(['files', 'outbox'], 'readwrite', (tx) => {
      const filesStore = tx.objectStore('files');
      const outboxStore = tx.objectStore('outbox');

      if (op.type === 'fs:write') {
        filesStore.put({
          path: op.path,
          content: op.data,
          user_id: session.user.id,
          access: op.options.access || 'private',
          size: op.data?.length || 0,
          last_modified: new Date().toISOString(),
        });
      } else if (op.type === 'fs:rm') {
        filesStore.delete(op.path);
      }
      outboxStore.put(op);
    });

    syncEngine.process();
  },
};

export function fs(path) {
  if (!path) throw new Error('fs() requires a path.');
  const isDirectory = path.endsWith('/');

  const methods = {
    read: () => {
      if (isDirectory) throw new Error('Cannot call .read() on a directory.');
      return coreFS.readFile(path);
    },
    ls: () => {
      if (!isDirectory)
        throw new Error(
          'Can only call .ls() on a directory path (ending with "/").',
        );
      return coreFS.listDirectory(path);
    },
    write: (content, options = { access: 'private' }) => {
      if (isDirectory) throw new Error('Cannot call .write() on a directory.');
      return coreFS.createOperation({
        type: 'fs:write',
        path,
        data: content,
        options,
      });
    },
    rm: (options = { access: 'private' }) => {
      return coreFS.createOperation({ type: 'fs:rm', path, options });
    },
    use(initialData = null) {
      const s = state({
        data: initialData,
        isLoading: initialData === null,
        error: null,
      });

      const fetchData = async () => {
        try {
          s.isLoading = true;
          s.error = null;
          s.data = isDirectory
            ? await coreFS.listDirectory(path)
            : await coreFS.readFile(path);
        } catch (e) {
          s.error = e.message;
        } finally {
          s.isLoading = false;
        }
      };

      const unsubscribe = db('files').subscribe(fetchData);
      onUnmounted(unsubscribe);

      if (initialData === null && typeof window !== 'undefined') fetchData();

      s.hydrate = async (serverData) => {
        log('Hydrating filesystem data from server.');
        if (serverData !== null && serverData !== undefined) {
          const records = isDirectory
            ? serverData
            : [{ path, content: serverData }];
          if (records.length > 0) await db('files').bulkPut(records);
        }
        await fetchData();
      };
      s.write = this.write;
      s.rm = this.rm;

      return s;
    },
  };

  methods.write = methods.write.bind(methods);
  methods.rm = methods.rm.bind(methods);
  methods.use = methods.use.bind(methods);

  return methods;
}

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
    warn('IndexedDB not available.');
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  log('Opening IndexedDB...');
  dbPromise = new Promise((resolve, reject) => {
    const version = config?.version || 1;
    const request = indexedDB.open(DB_NAME, version);

    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = () => {
      log('IndexedDB opened successfully.');
      resolve(request.result);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;
      log(`Upgrading database to version ${version}`);

      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'opId' });
        log('Created outbox object store.');
      }

      config?.clientTables?.forEach((tableSchema) => {
        if (!db.objectStoreNames.contains(tableSchema.name)) {
          const store = db.createObjectStore(tableSchema.name, {
            keyPath: tableSchema.keyPath,
            autoIncrement: tableSchema.autoIncrement,
          });
          log(`Created object store for table: ${tableSchema.name}`);
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

    log(`Starting transaction on tables: ${tableNamesArray} in mode: ${mode}`);
    const tx = db.transaction(tableNamesArray, mode);

    const transactionPromise = new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        log('Transaction completed successfully.');
        resolve();
      };
      tx.onerror = () => {
        error('Transaction failed:', tx.error);
        reject(tx.error);
      };
      tx.onabort = () => {
        error('Transaction aborted.');
        reject(new Error('Transaction aborted'));
      };
    });

    const actionResult = action(tx);

    await transactionPromise;

    return actionResult;
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
    log(`Attempting to 'put' record into '${tableName}':`, record);

    const isSynced = window.__WEBS_DB_CONFIG__?.clientTables.find(
      (t) => t.name === tableName && t.sync,
    );
    const tables = isSynced ? [tableName, 'outbox'] : [tableName];

    const recordWithUser = {
      ...record,
      user_id: record.user_id || session.user?.id,
    };

    await coreDB.performTransaction(tables, 'readwrite', (tx) => {
      tx.objectStore(tableName).put(recordWithUser);
      log(`Local put operation on table '${tableName}'.`);
      if (isSynced) {
        const op = {
          tableName,
          type: 'put',
          data: recordWithUser,
          opId: crypto.randomUUID(),
        };
        tx.objectStore('outbox').add(op);
        log(`Added operation with opId '${op.opId}' to outbox.`);
      }
    });
    if (isSynced) syncEngine.process();
    notify(tableName);
  },
  bulkPut: async (tableName, records) => {
    if (!records || records.length === 0) return;
    log(
      `Local bulk put on table '${tableName}' with ${records.length} records.`,
    );
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
      log(`Local delete operation on table '${tableName}'.`);
      if (isSynced) {
        const op = {
          tableName,
          type: 'delete',
          id: key,
          opId: crypto.randomUUID(),
        };
        tx.objectStore('outbox').add(op);
        log(`Added operation with opId '${op.opId}' to outbox.`);
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
    log(`Subscribed to table '${tableName}'.`);
    return () => tableSubscribers.get(tableName)?.delete(callback);
  },
  handleSyncMessage: async ({ tableName, type, data, id }) => {
    log(`Received sync message for table '${tableName}': type '${type}'.`);
    await coreDB.performTransaction(tableName, 'readwrite', (tx) => {
      const store = tx.objectStore(tableName);
      if (type === 'put') {
        store.put(data);
        log(`Applied sync 'put' operation on '${tableName}'.`);
      } else if (type === 'delete') {
        store.delete(id);
        log(`Applied sync 'delete' operation on '${tableName}'.`);
      }
    });
    notify(tableName);
  },
};

export function performTransaction(tableNames, mode, action) {
  return coreDB.performTransaction(tableNames, mode, action);
}

function connectToSyncServer() {
  if (socket?.readyState === WebSocket.OPEN) return processOutbox();
  if (!isOnline) {
    warn('Not online. Skipping WebSocket connection.');
    return;
  }
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/api/sync`;
  log(`Attempting to connect to sync server at ${url}...`);
  socket = new WebSocket(url);

  socket.onopen = () => {
    log('WebSocket connection established.');
    reconnectAttempts = 0;
    processOutbox();
  };

  socket.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      log('Received message from server:', payload);
      if (payload.type === 'sync') {
        await coreDB.handleSyncMessage(payload.data);
      } else if (payload.type === 'ack' || payload.type === 'sync-error') {
        if (payload.type === 'sync-error') {
          error(`Server failed op ${payload.opId}:`, payload.error);
        }
        await coreDB.performTransaction('outbox', 'readwrite', (tx) => {
          tx.objectStore('outbox').delete(payload.opId);
          log(`Removed op '${payload.opId}' from outbox.`);
        });
        isProcessingOutbox = false;
        processOutbox();
      }
      messageListeners.forEach((listener) => listener(payload));
    } catch (err) {
      error('Failed to process message:', err);
    }
  };

  socket.onclose = (event) => {
    log(
      `WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`,
    );
    if (event.code !== 1000) {
      reconnectAttempts++;
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      log(`Reconnecting in ${delay}ms...`);
      reconnectTimeout = setTimeout(connectToSyncServer, delay);
    }
  };

  socket.onerror = (err) => {
    error('WebSocket error:', err);
    socket.close();
  };
}

async function processOutbox() {
  if (isProcessingOutbox || socket?.readyState !== WebSocket.OPEN) {
    if (!isOnline) {
      warn('Not online, cannot process outbox.');
    }
    return;
  }

  const db = await coreDB._getDB();
  if (!db) return;

  log('Checking outbox for pending operations...');
  coreDB
    .performTransaction('outbox', 'readonly', (tx) => {
      const store = tx.objectStore('outbox');
      const request = store.openCursor();
      return new Promise((resolve, reject) => {
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            isProcessingOutbox = true;
            const op = cursor.value;
            log(`Sending op '${op.opId}' to server...`);
            socket.send(JSON.stringify(op));
          } else {
            isProcessingOutbox = false;
            log('Outbox is empty.');
            resolve();
          }
        };
        request.onerror = (e) => reject(e.target.error);
      });
    })
    .catch((err) => {
      error('Error reading from outbox:', err);
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
        if (newUser && !oldUser) {
          log('User logged in. Attempting to connect to sync server.');
          connectToSyncServer();
        } else if (oldUser && !newUser) {
          log('User logged out. Closing WebSocket connection.');
          socket?.close(1000, 'User logged out');
        }
      },
    );

    window.addEventListener('online', () => {
      isOnline = true;
      log('Network is back online. Attempting to connect.');
      if (session.user) connectToSyncServer();
    });
    window.addEventListener('offline', () => {
      isOnline = false;
      log('Network is offline.');
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
