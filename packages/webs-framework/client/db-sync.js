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
  async put(tableName, item) {
    const db = await this._getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readwrite');
      const store = transaction.objectStore(tableName);
      const request = store.put(item);
      request.onsuccess = () => {
        notify(tableName);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  },
  async putAll(tableName, items) {
    const db = await this._getDB();
    if (!db || !items || items.length === 0) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readwrite');
      const store = transaction.objectStore(tableName);

      items.forEach((item) => {
        store.put(item);
      });

      transaction.oncomplete = () => {
        notify(tableName);
        resolve();
      };
      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  },
  async get(tableName, key) {
    const db = await this._getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readonly');
      const store = transaction.objectStore(tableName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async getAll(tableName) {
    const db = await this._getDB();
    if (!db) return [];
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readonly');
      const store = transaction.objectStore(tableName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async delete(tableName, key) {
    const db = await this._getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readwrite');
      const store = transaction.objectStore(tableName);
      const request = store.delete(key);
      request.onsuccess = () => {
        notify(tableName);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },
  async deleteAll(tableName) {
    const db = await this._getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(tableName, 'readwrite');
      const store = transaction.objectStore(tableName);
      const request = store.clear();
      request.onsuccess = () => {
        notify(tableName);
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
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

async function connectToSyncServer() {
  if (
    typeof window === 'undefined' ||
    !isOnline ||
    (socket && socket.readyState < 2)
  ) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketURL = `${protocol}//${window.location.host}/api/sync`;
  socket = new WebSocket(socketURL);

  socket.onopen = () => {
    console.log('[Sync Engine] WebSocket connected.');
    processOutbox();
  };

  socket.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      const { type, tableName, data, id } = payload;

      console.log('[Sync Engine] Received message:', payload);

      if (type === 'put') {
        await localDB.put(tableName, data);
      } else if (type === 'delete') {
        await localDB.delete(tableName, id);
      }
    } catch (e) {
      console.error('[Sync Engine] Error processing incoming message:', e);
    }
  };

  socket.onclose = () => {
    socket = null;
    if (isOnline) {
      console.log(
        '[Sync Engine] WebSocket closed. Will attempt to reconnect on next online event.',
      );
    } else {
      console.log('[Sync Engine] WebSocket closed due to being offline.');
    }
  };

  socket.onerror = (error) => {
    console.error('[Sync Engine] WebSocket Error:', error);
    socket.close();
  };
}

async function processOutbox() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const outboxItems = await localDB.getAll('outbox');
    if (outboxItems.length === 0) return;

    console.log(
      `[Sync Engine] Processing ${outboxItems.length} items from outbox...`,
    );

    const db = await localDB._getDB();
    if (!db) return;
    const transaction = db.transaction('outbox', 'readonly');
    const store = transaction.objectStore('outbox');
    const keysRequest = store.getAllKeys();

    keysRequest.onsuccess = async () => {
      const keys = keysRequest.result;
      for (let i = 0; i < outboxItems.length; i++) {
        const payload = outboxItems[i];
        const key = keys[i];
        socket.send(JSON.stringify(payload));
        await localDB.delete('outbox', key);
      }
      console.log('[Sync Engine] Outbox processed.');
    };
    keysRequest.onerror = (e) =>
      console.error('[Sync Engine] Could not get outbox keys:', e);
  }
}

export const syncEngine = {
  start() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        isOnline = true;
        console.log('[Sync Engine] Application is online.');
        connectToSyncServer();
      });
      window.addEventListener('offline', () => {
        isOnline = false;
        console.log('[Sync Engine] Application is offline.');
        if (socket) socket.close();
      });
      connectToSyncServer();
    }
  },
};
