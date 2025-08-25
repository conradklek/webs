import { useState, computed } from '../lib/reactivity';
import { onUnmounted } from '../lib/renderer';
import { localDB } from './db-sync';

export * from '../lib/reactivity';
export * from '../lib/renderer';
export * from '../lib/runtime';
export * from './session';
export * from './db-sync';

export function useAction(actionName) {
  if (typeof window === 'undefined') {
    return { call: () => Promise.resolve(null), state: {} };
  }
  const state = useState({
    data: null,
    chunk: null,
    error: null,
    isLoading: false,
    isStreaming: false,
  });

  state.value.currentResponse = computed(() => state.value.data || '');

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
    state.value = {
      ...state.value,
      isLoading: true,
      error: null,
      data: null,
      chunk: null,
    };
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
        state.value = { ...state.value, isStreaming: true, data: '' };
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkText = decoder.decode(value);
          state.value = {
            ...state.value,
            chunk: chunkText,
            data: state.value.data + chunkText,
          };
        }
        if (options.onFinish && typeof options.onFinish === 'function') {
          options.onFinish(state.value.data.trim());
        }
      } else {
        const data = await response.json();
        state.value = { ...state.value, data };
      }
    } catch (e) {
      state.value = { ...state.value, error: e.message };
    } finally {
      state.value = { ...state.value, isLoading: false, isStreaming: false };
    }
    return state.value.data;
  };
  return {
    call,
    stream: call,
    state,
  };
}

export function useQuery(tableName, initialData = null) {
  const state = useState({
    data: initialData || [],
    isLoading: !initialData,
    error: null,
  });

  if (typeof window !== 'undefined') {
    const fetchData = async () => {
      state.value = { ...state.value, isLoading: true };
      try {
        const data = await localDB.getAll(tableName);
        state.value = { ...state.value, data, isLoading: false, error: null };
      } catch (e) {
        state.value = { ...state.value, error: e, isLoading: false };
      }
    };

    if (!initialData) {
      fetchData();
    }

    const unsubscribe = localDB.subscribe(tableName, fetchData);
    onUnmounted(unsubscribe);
  }

  return state;
}

export function useMutate(tableName) {
  if (typeof window === 'undefined') {
    return {
      mutate: () => Promise.resolve(),
      destroy: () => Promise.resolve(),
      state: { isLoading: false, error: null },
    };
  }

  const state = useState({
    isLoading: false,
    error: null,
  });

  const mutate = async (item) => {
    state.value = { isLoading: true, error: null };
    try {
      await localDB.put(tableName, item);
      await localDB.put('outbox', {
        type: 'put',
        tableName,
        data: item,
        timestamp: Date.now(),
      });
      state.value = { isLoading: false, error: null };
    } catch (e) {
      state.value = { isLoading: false, error: e };
    }
  };

  const destroy = async (id) => {
    state.value = { isLoading: true, error: null };
    try {
      await localDB.delete(tableName, id);
      await localDB.put('outbox', {
        type: 'delete',
        tableName,
        id: id,
        timestamp: Date.now(),
      });
      state.value = { isLoading: false, error: null };
    } catch (e) {
      state.value = { isLoading: false, error: e };
    }
  };

  return { mutate, destroy, state };
}

let socket = null;
let messageListeners = new Set();

function connect() {
  if (typeof window === 'undefined' || (socket && socket.readyState < 2)) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketURL = `${protocol}//${window.location.host}/api/sync`;
  console.log(`[WebSocket] Attempting to connect to ${socketURL}...`);
  socket = new WebSocket(socketURL);
  socket.onopen = () => console.log('[WebSocket] Connection established.');
  socket.onmessage = (event) => {
    messageListeners.forEach((listener) => listener(event.data));
  };
  socket.onclose = () => {
    console.log('[WebSocket] Connection closed.');
    socket = null;
  };
  socket.onerror = (error) => console.error('[WebSocket] Error:', error);
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
