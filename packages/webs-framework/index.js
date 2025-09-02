import { store, state, computed } from './reactivity';

export * from './reactivity';
export * from './renderer';
export * from './runtime';

const sessionStore = store({
  state: () => ({
    user: null,
    error: null,
    isReady: false,
  }),
  getters: {
    isLoggedIn() {
      return !!this.user;
    },
  },
  actions: {
    async register({ email, username, password }) {
      this.error = null;
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, username, password }),
        });
        if (!response.ok) {
          const error_text = await response.text();
          throw new Error(error_text || 'Registration failed');
        }
      } catch (err) {
        this.error = err.message;
        console.error('Registration failed:', err);
        throw err;
      }
    },
    async login(email, password) {
      this.error = null;
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          const error_text = await response.text();
          throw new Error(error_text || 'Login failed');
        }
        const user_data = await response.json();
        this.user = user_data;
      } catch (err) {
        this.error = err.message;
        console.error('Login failed:', err);
        throw err;
      }
    },
    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.user = null;
        this.error = null;
      } catch (err) {
        console.error('Logout failed:', err);
      }
    },
    setUser(user) {
      this.user = user || null;
      this.isReady = true;
    },
  },
});

const session = sessionStore;

const DB_NAME = 'webs-local-db';
const DB_VERSION = 1;

let dbPromise = null;
let socket = null;
let isOnline = navigator.onLine;
let reconnectTimeout = null;
const messageListeners = new Set();

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

const localDB = {
  db: null,
  async _getDB() {
    if (!this.db) {
      this.db = await openDB(window.__WEBS_DB_CONFIG__);
    }
    return this.db;
  },
  async get(tableName, key) {
    const db = await this._getDB();
    if (!db) return null;
    const transaction = db.transaction(tableName, 'readonly');
    const store = transaction.objectStore(tableName);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async getAll(tableName) {
    const db = await this._getDB();
    if (!db) return [];
    const transaction = db.transaction(tableName, 'readonly');
    const store = transaction.objectStore(tableName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async put(tableName, record) {
    const db = await this._getDB();
    if (!db) return;
    const transaction = db.transaction([tableName, 'outbox'], 'readwrite');
    const store = transaction.objectStore(tableName);
    const outboxStore = transaction.objectStore('outbox');

    const serializedRecord = JSON.parse(
      JSON.stringify(record, (_, value) => {
        if (value instanceof Set) return { __type: 'Set', values: [...value] };
        if (value instanceof Map)
          return { __type: 'Map', entries: [...value.entries()] };
        return value;
      }),
    );

    await new Promise((resolve, reject) => {
      const request = store.put(serializedRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    const payload = { tableName, type: 'put', data: serializedRecord };
    outboxStore.add(payload);
    await transaction.done;
    notify(tableName);
    syncEngine.process();
  },
  async delete(tableName, key) {
    const db = await this._getDB();
    if (!db) return;
    const transaction = db.transaction([tableName, 'outbox'], 'readwrite');
    const store = transaction.objectStore(tableName);
    const outboxStore = transaction.objectStore('outbox');

    await new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    const payload = { tableName, type: 'delete', id: key };
    outboxStore.add(payload);
    await transaction.done;
    notify(tableName);
    syncEngine.process();
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
  async sync(data) {
    const db = await this._getDB();
    if (!db) return;
    const { tableName, type, data: record, id } = data;
    const transaction = db.transaction(tableName, 'readwrite');
    const store = transaction.objectStore(tableName);

    if (type === 'put') {
      store.put(record);
    } else if (type === 'delete') {
      store.delete(id);
    }
    await transaction.done;
    notify(tableName);
  },
};

function connectToSyncServer() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    processOutbox();
    return;
  }
  if (!isOnline) {
    console.warn('[Sync Engine] Not online, skipping WebSocket connection.');
    return;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${window.location.host}/api/sync`);

  socket.onopen = () => {
    processOutbox();
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.tableName && payload.type) {
        localDB.sync(payload);
      }
      messageListeners.forEach((listener) => listener(payload));
    } catch (e) {
      console.error('[Sync Engine] Failed to parse message:', e);
    }
  };

  socket.onclose = (event) => {
    console.warn(
      `[Sync Engine] Disconnected. Code: ${event.code}, Reason: ${event.reason}`,
    );
    if (event.code !== 1000 && event.code !== 1008) {
      reconnectTimeout = setTimeout(connectToSyncServer, 3000);
    }
  };

  socket.onerror = (error) => {
    console.error('[Sync Engine] WebSocket error:', error);
    socket.close();
  };
}

async function processOutbox() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const outboxItems = await localDB.getAll('outbox');
    if (outboxItems.length === 0) return;

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
    };
    keysRequest.onerror = (e) =>
      console.error('[Sync Engine] Could not get outbox keys:', e);
  }
}

const syncEngine = {
  start() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        isOnline = true;
        connectToSyncServer();
      });
      window.addEventListener('offline', () => {
        isOnline = false;
        console.warn('[Sync Engine] Application is offline.');
      });
      connectToSyncServer();
    }
  },
  process() {
    if (isOnline) {
      processOutbox();
    }
  },
  send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('[Sync Engine] Cannot send message, socket is not open.');
    }
  },
  onMessage(callback) {
    messageListeners.add(callback);
    return () => messageListeners.delete(callback);
  },
};

function action(actionName, componentName) {
  if (typeof window === 'undefined') {
    return { call: () => Promise.resolve(null), state: {} };
  }
  const s = state({
    data: null,
    chunk: null,
    error: null,
    isLoading: false,
    isStreaming: false,
  });

  s.currentResponse = computed(() => s.data || '');

  const getActionPath = () => {
    const finalComponentName =
      componentName || window.__WEBS_STATE__?.componentName;
    if (!finalComponentName) {
      console.error(
        'Action: Could not determine the component name for the action.',
      );
      return null;
    }
    return `/__actions__/${finalComponentName}/${actionName}`;
  };
  const call = async (...args) => {
    const lastArg = args[args.length - 1];
    const hasOptions =
      typeof lastArg === 'object' && lastArg !== null && 'onFinish' in lastArg;
    const options = hasOptions ? args.pop() : {};
    const bodyArgs = args;

    s.isLoading = true;
    s.error = null;
    s.data = null;
    s.chunk = null;
    s.isStreaming = !!options.stream;

    try {
      const response = await fetch(getActionPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyArgs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText || `Action failed with status: ${response.status}`,
        );
      }

      if (options.stream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        s.data = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          s.data += chunk;
          s.chunk = chunk;
        }

        if (options.onFinish) {
          options.onFinish(s.data);
        }
      } else {
        const result = await response.json();
        s.data = result;
      }
    } catch (err) {
      s.error = err.message;
      console.error('Action failed:', err);
    } finally {
      s.isLoading = false;
      s.isStreaming = false;
    }
  };

  return { call, state: s };
}

export { session, localDB, syncEngine, action };
