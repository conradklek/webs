import { reactive, computed } from './reactivity';
import { onUnmounted } from './renderer';
import { localDB } from './db-client';

export function useAction(actionName) {
  const state = reactive({
    data: null,
    chunk: null,
    error: null,
    isLoading: false,
    isStreaming: false,
    currentResponse: computed(() => state.data || ''),
  });
  const getActionPath = () => {
    const componentName = window.__WEBS_STATE__?.componentName;
    if (!componentName) {
      console.error(
        'useAction: Could not determine the component name for the action.',
      );
      return null;
    }
    return `/__actions__/${componentName}/${actionName}`;
  };
  const call = async (...args) => {
    const lastArg = args[args.length - 1];
    const hasOptions =
      typeof lastArg === 'object' && lastArg !== null && 'onFinish' in lastArg;
    const options = hasOptions ? args.pop() : {};
    const bodyArgs = args;
    state.isLoading = true;
    state.error = null;
    state.data = null;
    state.chunk = null;
    try {
      const response = await fetch(getActionPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyArgs),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
        state.isStreaming = true;
        state.data = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkText = decoder.decode(value);
          state.chunk = chunkText;
          state.data += chunkText;
        }
        state.isStreaming = false;
        if (options.onFinish && typeof options.onFinish === 'function') {
          options.onFinish(state.data.trim());
        }
      } else {
        state.data = await response.json();
      }
    } catch (e) {
      state.error = e.message;
    } finally {
      state.isLoading = false;
      state.isStreaming = false;
    }
    return state.data;
  };
  return {
    call,
    stream: call,
    state,
  };
}

export function useQuery(tableName) {
  const state = reactive({
    data: [],
    isLoading: true,
    error: null,
  });
  const fetchData = async () => {
    try {
      state.isLoading = true;
      state.data = await localDB.getAll(tableName);
    } catch (e) {
      state.error = e;
    } finally {
      state.isLoading = false;
    }
  };
  fetchData();
  const unsubscribe = localDB.subscribe(tableName, fetchData);
  onUnmounted(unsubscribe);
  return state;
}

export function useMutate(tableName) {
  const state = reactive({
    isLoading: false,
    error: null,
  });
  const mutate = async (item) => {
    state.isLoading = true;
    state.error = null;
    try {
      await localDB.put(tableName, item);
      await localDB.put('outbox', {
        type: 'put',
        tableName,
        data: item,
        timestamp: Date.now(),
      });
    } catch (e) {
      state.error = e;
    } finally {
      state.isLoading = false;
    }
  };
  const destroy = async (id) => {
    state.isLoading = true;
    state.error = null;
    try {
      await localDB.delete(tableName, id);
      await localDB.put('outbox', {
        type: 'delete',
        tableName,
        id: id,
        timestamp: Date.now(),
      });
    } catch (e) {
      state.error = e;
    } finally {
      state.isLoading = false;
    }
  };
  return { mutate, destroy, state };
}

let socket = null;

let messageListeners = new Set();

function connect() {
  if (typeof window === 'undefined') {
    return;
  }
  if (socket && socket.readyState < 2) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketURL = `${protocol}//${window.location.host}${window.location.pathname}`;
  console.log(`[WebSocket] Attempting to connect to ${socketURL}...`);
  socket = new WebSocket(socketURL);
  socket.onopen = () => {
    console.log('[WebSocket] Connection established.');
  };
  socket.onmessage = (event) => {
    messageListeners.forEach((listener) => listener(event.data));
  };
  socket.onclose = () => {
    console.log('[WebSocket] Connection closed.');
    socket = null;
  };
  socket.onerror = (error) => {
    console.error('[WebSocket] Error:', error);
  };
}

export function useSocket() {
  return {
    connect,
    send(message) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      } else {
        console.warn('[WebSocket] Cannot send message, socket is not open.', {
          readyState: socket?.readyState,
        });
      }
    },
    onMessage(callback) {
      messageListeners.add(callback);
      return () => messageListeners.delete(callback);
    },
  };
}

export * from './db-client';
export * from './sync';
export * from './reactivity';
export * from './renderer';
export * from './runtime';
