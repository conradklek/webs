import { localDB } from './db-client';

let socket = null;
let reconnectInterval = 1000;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

function connect() {
  if (
    typeof window === 'undefined' ||
    (socket && socket.readyState < 2) ||
    !isOnline
  ) {
    console.log('[Sync Engine] Not connecting: already connected or offline.');
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketURL = `${protocol}//${window.location.host}/api/sync`;

  console.log(`[Sync Engine] Connecting to ${socketURL}...`);
  socket = new WebSocket(socketURL);

  socket.onopen = () => {
    console.log('[Sync Engine] Connection established.');
    reconnectInterval = 1000;
    processOutbox();
  };

  socket.onmessage = async (event) => {
    console.log('[Sync Engine] Message received from server:', event.data);
    const { type, tableName, data, id } = JSON.parse(event.data);
    if (type === 'put') {
      await localDB.put(tableName, data);
    } else if (type === 'delete') {
      await localDB.delete(tableName, id);
    }
  };

  socket.onclose = () => {
    console.log('[Sync Engine] Connection closed. Attempting to reconnect...');
    socket = null;
    if (isOnline) {
      setTimeout(connect, reconnectInterval);
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
    const mutations = await localDB.getAll('outbox');
    if (mutations.length > 0) {
      console.log(
        `[Sync Engine] Processing ${mutations.length} items from outbox...`,
      );
    }
    for (const mutation of mutations) {
      const { key, ...payload } = mutation;
      socket.send(JSON.stringify(payload));
      await localDB.delete('outbox', key);
    }
  }
}

export const syncEngine = {
  start() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        isOnline = true;
        console.log('[Sync Engine] App is online. Reconnecting...');
        connect();
      });
      window.addEventListener('offline', () => {
        isOnline = false;
        console.log(
          '[Sync Engine] App is offline. Pausing reconnection attempts.',
        );
      });
    }

    connect();
    localDB.subscribe('outbox', processOutbox);
  },
};
