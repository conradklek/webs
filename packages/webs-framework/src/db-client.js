const DB_NAME = 'webs-local-first';

const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('todos')) {
        db.createObjectStore('todos', { keyPath: 'id' });
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
  async getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async put(storeName, item) {
    const db = await openDB();
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
    const db = await openDB();
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

  async deleteAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
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
