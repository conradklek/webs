import { session } from './session.js';
import { watch, state } from './engine.js';
import { onUnmounted } from './renderer.js';

const coreFS = {
  readFile: (path) =>
    db('files')
      .get(path)
      .then((file) => (file ? file.content : null)),

  listDirectory: async (path) => {
    const prefix = path ? `${path}/` : '';
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
    return Array.from(directChildren.values());
  },

  async createOperation(payload) {
    if (!session.isLoggedIn) throw new Error('User not logged in.');
    const op = { ...payload, opId: crypto.randomUUID() };

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

export function fs(path = '') {
  const isDirectory = path === '' || path.endsWith('/');
  const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

  const methods = {
    read: () => {
      if (isDirectory) throw new Error('Cannot call .read() on a directory.');
      return coreFS.readFile(normalizedPath);
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
        path: normalizedPath,
        data: content,
        options,
      });
    },
    rm: (options = { access: 'private' }) => {
      return coreFS.createOperation({
        type: 'fs:rm',
        path: normalizedPath,
        options,
      });
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
            : await coreFS.readFile(normalizedPath);
        } catch (e) {
          s.error = e.message;
        } finally {
          s.isLoading = false;
        }
      };

      if (typeof window !== 'undefined') {
        const unsubscribe = db('files').subscribe(fetchData);
        onUnmounted(unsubscribe);

        if (initialData === null) fetchData();
      }

      s.hydrate = async (serverData) => {
        if (serverData !== null && serverData !== undefined) {
          await db('files').bulkPut(serverData);
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
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const version = config?.version || 1;
    const request = indexedDB.open(DB_NAME, version);

    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;

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
          opId: crypto.randomUUID(),
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
          opId: crypto.randomUUID(),
        };
        tx.objectStore('outbox').add(op);
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

function connectToSyncServer() {
  if (socket?.readyState === WebSocket.OPEN) return processOutbox();
  if (!isOnline) {
    return;
  }
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/api/sync`;
  socket = new WebSocket(url);

  socket.onopen = () => {
    reconnectAttempts = 0;
    processOutbox();
  };

  socket.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'sync') {
        if (payload.data.tableName === 'files' && payload.data.type === 'put') {
          const records = [payload.data.data];
          await coreDB.bulkPut('files', records);
        } else {
          await coreDB.handleSyncMessage(payload.data);
        }
      } else if (payload.type === 'ack' || payload.type === 'sync-error') {
        await coreDB.performTransaction('outbox', 'readwrite', (tx) => {
          tx.objectStore('outbox').delete(payload.opId);
        });
        isProcessingOutbox = false;
        processOutbox();
      }
      messageListeners.forEach((listener) => listener(payload));
    } catch (e) {
      /* e */
    }
  };

  socket.onclose = (event) => {
    if (event.code !== 1000) {
      reconnectAttempts++;
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      reconnectTimeout = setTimeout(connectToSyncServer, delay);
    }
  };

  socket.onerror = () => {
    socket.close();
  };
}

async function processOutbox() {
  if (isProcessingOutbox || socket?.readyState !== WebSocket.OPEN) {
    if (!isOnline) {
      /* e */
    }
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
            socket.send(JSON.stringify(op));
          } else {
            isProcessingOutbox = false;
            resolve();
          }
        };
        request.onerror = (e) => reject(e.target.error);
      });
    })
    .catch(() => {
      isProcessingOutbox = false;
    });
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
    subscribe: () => () => {},
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
  };
}

export const syncEngine = {
  start() {
    if (typeof window === 'undefined') return;

    watch(
      () => session.user,
      (newUser, oldUser) => {
        if (newUser && !oldUser) {
          connectToSyncServer();
        } else if (oldUser && !newUser) {
          socket?.close(1000, 'User logged out');
        }
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
