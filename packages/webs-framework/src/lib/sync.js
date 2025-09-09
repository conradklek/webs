import { session } from './session.js';
import { effect, state } from './engine.js';
import { onUnmounted, onMounted } from './renderer.js';
import { generateUUID, createLogger } from './shared.js';

const logger = createLogger('[Sync]');

const DB_NAME = 'webs-local-db';
let dbPromise = null;
let socket = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let reconnectTimeout = null;
let reconnectAttempts = 0;
let isProcessingOutbox = false;

const eventEmitter = {
  listeners: new Map(),
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const eventListeners = this.listeners.get(event);
    eventListeners.add(callback);
    return () => eventListeners.delete(callback);
  },
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(data));
    }
  },
};

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDB(config) {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;
  logger.log('Opening IndexedDB...');
  dbPromise = new Promise((resolve, reject) => {
    const version = config?.version || 1;
    const request = indexedDB.open(DB_NAME, version);

    request.onerror = (e) => {
      logger.error('IndexedDB error:', e.target.error);
      reject(e.target.error);
    };
    request.onsuccess = () => {
      logger.log('IndexedDB opened successfully.');
      resolve(request.result);
    };

    request.onupgradeneeded = (e) => {
      logger.log('IndexedDB upgrade needed.', {
        oldVersion: e.oldVersion,
        newVersion: e.newVersion,
      });
      const db = e.target.result;
      const tx = e.target.transaction;

      if (!db.objectStoreNames.contains('outbox')) {
        logger.debug("Creating 'outbox' object store.");
        db.createObjectStore('outbox', { keyPath: 'opId' });
      }

      config?.clientTables?.forEach((tableSchema) => {
        if (!db.objectStoreNames.contains(tableSchema.name)) {
          logger.debug(`Creating '${tableSchema.name}' object store.`);
          const store = db.createObjectStore(tableSchema.name, {
            keyPath: tableSchema.keyPath,
            autoIncrement: tableSchema.autoIncrement,
          });
          tableSchema.indexes?.forEach((index) =>
            store.createIndex(index.name, index.keyPath, index.options),
          );
        } else {
          logger.debug(
            `Checking indexes for '${tableSchema.name}' object store.`,
          );
          const store = tx.objectStore(tableSchema.name);
          const existingIndices = new Set(store.indexNames);
          tableSchema.indexes?.forEach((index) => {
            if (!existingIndices.has(index.name)) {
              logger.debug(
                `Creating index '${index.name}' on '${tableSchema.name}'.`,
              );
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
  logger.debug(`Notifying subscribers for table: ${tableName}`);
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

    const transactionPromise = new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error);
      };
      tx.onabort = () => {
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
      if (isSynced) {
        const op = {
          tableName,
          type: 'put',
          data: recordWithUser,
          opId: generateUUID(),
        };
        tx.objectStore('outbox').add(op);
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
        const op = {
          tableName,
          type: 'delete',
          id: key,
          opId: generateUUID(),
        };
        tx.objectStore('outbox').add(op);
      }
    });
    if (isSynced) syncEngine.process();
    notify(tableName);
  },
  clear: (tableName) =>
    coreDB.performTransaction(tableName, 'readwrite', (tx) =>
      promisifyRequest(tx.objectStore(tableName).clear()),
    ),
  subscribe: (tableName, callback) => {
    if (!tableSubscribers.has(tableName)) {
      tableSubscribers.set(tableName, new Set());
    }
    tableSubscribers.get(tableName).add(callback);
    return () => tableSubscribers.get(tableName)?.delete(callback);
  },
  handleSyncMessage: async ({ tableName, type, data, id }) => {
    logger.log(`Handling incoming sync message`, { tableName, type, data, id });
    await coreDB.performTransaction(tableName, 'readwrite', (tx) => {
      const store = tx.objectStore(tableName);
      if (type === 'put') {
        store.put(data);
      } else if (type === 'delete') {
        store.delete(id);
      }
    });
    notify(tableName);
  },
};

export function performTransaction(tableNames, mode, action) {
  return coreDB.performTransaction(tableNames, mode, action);
}

function createSsrDbMock() {
  const fn = () => Promise.resolve(null);
  const empty = () => Promise.resolve([]);
  return {
    get: fn,
    getAll: empty,
    getAllWithPrefix: empty,
    query: empty,
    put: fn,
    bulkPut: fn,
    delete: fn,
    subscribe: () => () => { },
    clear: fn,
  };
}

export function db(tableName) {
  if (typeof window === 'undefined') {
    return createSsrDbMock();
  }
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
    clear: () => coreDB.clear(tableName),
  };
}

const coreFS = {
  readFile: (path) =>
    db('files')
      .get(path)
      .then((file) => (file ? file.content : null)),

  listDirectory: async (path) => {
    logger.debug(`[FS] Listing directory: "${path}"`);
    const normalizedPath = path.replace(/\/$/, '');
    const prefix = normalizedPath ? `${normalizedPath}/` : '';
    const allFiles = await db('files').getAllWithPrefix(prefix);
    const directChildren = new Map();

    for (const file of allFiles) {
      const relativePath = file.path.substring(prefix.length);
      const segments = relativePath.split('/');
      const childName = segments[0];

      if (!childName) continue;

      if (!directChildren.has(childName)) {
        const isDirectory = segments.length > 1;
        directChildren.set(childName, {
          name: childName,
          isDirectory: isDirectory,
          path: isDirectory ? `${prefix}${childName}` : file.path,
        });
      }
    }
    const result = Array.from(directChildren.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    logger.debug(`[FS] Directory listing for "${path}" result:`, result);
    return result;
  },

  async createOperation(payload) {
    if (!session.isLoggedIn) throw new Error('User not logged in.');
    const op = { ...payload, opId: generateUUID() };
    logger.log(`[FS] Creating operation:`, op);

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
        const key =
          typeof op.path === 'string'
            ? { path: op.path, user_id: session.user.id }
            : op.path;
        filesStore.delete([key.path, key.user_id]);
      }
      outboxStore.put(op);
    });

    notify('files');
    syncEngine.process();
  },
};

export function fs(path = '') {
  if (typeof window === 'undefined') {
    const use = (initialData = null) => {
      const s = state({
        data: initialData,
        isLoading: false,
        error: null,
      });
      s.hydrate = async () => { };
      s.write = async () => { };
      s.rm = async () => { };
      return s;
    };
    return {
      read: () => Promise.resolve(null),
      ls: () => Promise.resolve([]),
      write: () => Promise.resolve(),
      rm: () => Promise.resolve(),
      use,
    };
  }

  const isDirectoryOp =
    typeof path === 'function' ? true : path === '' || path.endsWith('/');

  const methods = {
    read: () => {
      if (isDirectoryOp) throw new Error('Cannot call .read() on a directory.');
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.readFile(currentPath);
    },
    ls: () => {
      if (!isDirectoryOp)
        throw new Error(
          'Can only call .ls() on a directory path (ending with "/").',
        );
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.listDirectory(currentPath);
    },
    write: (content, options = { access: 'private' }) => {
      if (isDirectoryOp)
        throw new Error('Cannot call .write() on a directory.');
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.createOperation({
        type: 'fs:write',
        path: currentPath,
        data: content,
        options,
      });
    },
    rm: (options = { access: 'private' }) => {
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.createOperation({
        type: 'fs:rm',
        path: currentPath,
        options,
      });
    },
    use(initialData = null) {
      const hasInitialData =
        initialData && (!Array.isArray(initialData) || initialData.length > 0);
      logger.log(
        `[fs.use] Initializing for path: ${typeof path === 'function' ? path() : path}`,
        { initialData, hasInitialData },
      );

      const s = state({
        data: initialData,
        isLoading: !hasInitialData,
        error: null,
      });

      let unsubscribe = null;

      const fetchData = async () => {
        const currentDynamicPath = typeof path === 'function' ? path() : path;

        const isDir =
          Array.isArray(s.data) ||
          currentDynamicPath === '' ||
          currentDynamicPath.endsWith('/');

        logger.log(`[fs.use] Fetching data for path: "${currentDynamicPath}"`);
        try {
          s.isLoading = true;
          s.error = null;
          const newData = isDir
            ? await coreFS.listDirectory(currentDynamicPath)
            : await coreFS.readFile(currentDynamicPath);
          logger.log(
            `[fs.use] Fetched data for "${currentDynamicPath}":`,
            newData,
          );
          s.data = newData;
        } catch (e) {
          logger.error(
            `[fs.use] Error fetching data for "${currentDynamicPath}":`,
            e,
          );
          s.error = e.message;
        } finally {
          s.isLoading = false;
        }
      };

      const setupSubscription = (skipInitialFetch = false) => {
        if (unsubscribe) unsubscribe();
        const currentDynamicPath = typeof path === 'function' ? path() : path;
        logger.log(
          `[fs.use] Setting up subscription for path: "${currentDynamicPath}"`,
        );
        unsubscribe = db('files').subscribe(fetchData);
        if (!skipInitialFetch) {
          fetchData();
        }
      };

      onMounted(() => {
        setupSubscription(hasInitialData);

        if (typeof path === 'function') {
          const stopWatch = effect(path, () => {
            logger.log(
              `[fs.use] Watched path changed to: "${path()}", re-subscribing.`,
            );
            setupSubscription(true);
          });
          onUnmounted(stopWatch);
        }
      });

      onUnmounted(() => {
        if (unsubscribe) {
          logger.log(
            `[fs.use] Unsubscribing for path: "${typeof path === 'function' ? path() : path}"`,
          );
          unsubscribe();
        }
      });

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

function connectToSyncServer() {
  if (socket?.readyState === WebSocket.OPEN) return processOutbox();
  if (!isOnline) {
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
    if (payload.type === 'sync') {
      await coreDB.handleSyncMessage(payload.data);
    } else if (payload.type === 'ack' || payload.type === 'sync-error') {
      if (payload.type === 'sync-error') {
        logger.error('Sync error from server:', payload);
      }
      await coreDB.performTransaction('outbox', 'readwrite', (tx) => {
        tx.objectStore('outbox').delete(payload.opId);
      });
      processOutbox();
    }
  };

  socket.onclose = (event) => {
    logger.warn('Sync server connection closed.', {
      code: event.code,
      reason: event.reason,
    });
    if (event.code !== 1000) {
      reconnectAttempts++;
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      logger.log(`Will attempt to reconnect in ${delay}ms.`);
      reconnectTimeout = setTimeout(connectToSyncServer, delay);
    }
  };

  socket.onerror = (err) => {
    logger.error('Sync server connection error:', err);
    socket.close();
  };
}

async function processOutbox() {
  if (isProcessingOutbox || socket?.readyState !== WebSocket.OPEN) {
    logger.debug('Skipping outbox processing.', {
      isProcessingOutbox,
      socketState: socket?.readyState,
    });
    return;
  }

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
            const op = cursor.value;
            logger.log('Processing and sending operation from outbox:', op);
            socket.send(JSON.stringify(op));
          } else {
            isProcessingOutbox = false;
            logger.debug('Outbox is empty.');
            resolve();
          }
        };
        request.onerror = (e) => reject(e.target.error);
      });
    })
    .catch((err) => {
      logger.error('Error processing outbox:', err);
      isProcessingOutbox = false;
    });
}

export const syncEngine = {
  start() {
    if (typeof window === 'undefined') return;

    effect(
      () => session.user,
      (newUser, oldUser) => {
        if (newUser && !oldUser) {
          logger.log('User logged in, starting sync engine.');
          connectToSyncServer();
        } else if (oldUser && !newUser) {
          logger.log('User logged out, stopping sync engine.');
          socket?.close(1000, 'User logged out');
        }
      },
    );

    window.addEventListener('online', () => {
      logger.log('Browser is online.');
      isOnline = true;
      if (session.user) connectToSyncServer();
    });
    window.addEventListener('offline', () => {
      logger.log('Browser is offline.');
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
  addEventListener: (event, callback) => {
    return eventEmitter.on(event, callback);
  },
};
