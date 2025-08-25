const DB_NAME = 'webs-local-db';
const DB_VERSION = 1;

let dbPromise = null;

function openDB(config) {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const version = config?.version || DB_VERSION;
    const request = indexedDB.open(DB_NAME, version);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      console.log('[Framework] Upgrading IndexedDB...');
      const db = event.target.result;

      if (config && typeof config.upgrade === 'function') {
        config.upgrade(db, event.oldVersion);
      }

      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { autoIncrement: true });
      }
    };
  });
  return dbPromise;
}

const tableSubscribers = new Map();
function notify(tableName) {
  if (tableSubscribers.has(tableName)) {
    tableSubscribers.get(tableName).forEach((callback) => callback());
  }
}

export const localDB = {
  db: null,
  async _getDB() {
    if (!this.db) {
      this.db = await openDB(window.__WEBS_DB_CONFIG__);
    }
    return this.db;
  },

  async getAll(storeName) {
    const db = await this._getDB();
    if (!db) return [];
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async put(storeName, item) {
    const db = await this._getDB();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => {
        notify(storeName);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName, key) {
    const db = await this._getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => {
        notify(storeName);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  subscribe(tableName, callback) {
    if (!tableSubscribers.has(tableName)) {
      tableSubscribers.set(tableName, new Set());
    }
    tableSubscribers.get(tableName).add(callback);
    return () => {
      tableSubscribers.get(tableName).delete(callback);
    };
  },
};

let socket = null;
let reconnectInterval = 1000;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

function connectToSyncServer() {
  if (
    typeof window === 'undefined' ||
    (socket && socket.readyState < 2) ||
    !isOnline
  ) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketURL = `${protocol}//${window.location.host}/api/sync`;

  socket = new WebSocket(socketURL);

  socket.onopen = () => {
    console.log('[Sync Engine] Connection established.');
    reconnectInterval = 1000;
    processOutbox();
  };

  socket.onmessage = async (event) => {
    const { type, tableName, data, id } = JSON.parse(event.data);
    if (type === 'put') {
      await localDB.put(tableName, data);
    } else if (type === 'delete') {
      await localDB.delete(tableName, id);
    }
  };

  socket.onclose = () => {
    socket = null;
    if (isOnline) {
      setTimeout(connectToSyncServer, reconnectInterval);
      reconnectInterval = Math.min(reconnectInterval * 2, 30000);
    }
  };

  socket.onerror = (error) => {
    console.error('[Sync Engine] WebSocket Error:', error);
    socket.close();
  };
}

async function processOutbox() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const outboxStore = await localDB.getAll('outbox');
    const db = await localDB._getDB();
    if (!db) return;
    const transaction = db.transaction('outbox', 'readonly');
    const store = transaction.objectStore('outbox');
    const keysRequest = store.getAllKeys();

    keysRequest.onsuccess = async () => {
      const keys = keysRequest.result;
      for (let i = 0; i < outboxStore.length; i++) {
        const payload = outboxStore[i];
        const key = keys[i];
        socket.send(JSON.stringify(payload));
        await localDB.delete('outbox', key);
      }
    };
  }
}

export const syncEngine = {
  start() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        isOnline = true;
        connectToSyncServer();
      });
      window.addEventListener('offline', () => {
        isOnline = false;
        if (socket) socket.close();
      });
    }

    connectToSyncServer();
    localDB.subscribe('outbox', processOutbox);
  },
};
