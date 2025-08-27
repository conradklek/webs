import { state, computed } from '../lib/reactivity';
import { onUnmounted } from '../lib/renderer';
import { localDB } from './db-sync';

export * from '../lib/reactivity';
export * from '../lib/renderer';
export * from '../lib/runtime';
export * from './session';
export * from './db-sync';

export function action(actionName) {
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

  s.value.currentResponse = computed(() => s.value.data || '');

  const getActionPath = () => {
    const componentName = window.__WEBS_STATE__?.componentName;
    if (!componentName) {
      console.error(
        'Action: Could not determine the component name for the action.',
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
    s.value = {
      ...s.value,
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
        s.value = { ...s.value, isStreaming: true, data: '' };
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkText = decoder.decode(value);
          s.value = {
            ...s.value,
            chunk: chunkText,
            data: s.value.data + chunkText,
          };
        }
        if (options.onFinish && typeof options.onFinish === 'function') {
          options.onFinish(s.value.data.trim());
        }
      } else {
        const data = await response.json();
        s.value = { ...s.value, data };
      }
    } catch (e) {
      s.value = { ...s.value, error: e.message };
    } finally {
      s.value = { ...s.value, isLoading: false, isStreaming: false };
    }
    return s.value.data;
  };
  return {
    call,
    stream: call,
    state: s,
  };
}

export function query(tableName, initialData = null) {
  const s = state({
    data: initialData || [],
    isLoading: !initialData,
    error: null,
  });

  if (typeof window !== 'undefined') {
    const fetchData = async () => {
      s.value = { ...s.value, isLoading: true };
      try {
        const data = await localDB.getAll(tableName);
        s.value = { ...s.value, data, isLoading: false, error: null };
      } catch (e) {
        s.value = { ...s.value, error: e, isLoading: false };
      }
    };

    if (!initialData) {
      fetchData();
    }

    const unsubscribe = localDB.subscribe(tableName, fetchData);
    onUnmounted(unsubscribe);
  }

  return { state: s };
}

export function mutate(tableName) {
  if (typeof window === 'undefined') {
    return {
      mutate: () => Promise.resolve(),
      destroy: () => Promise.resolve(),
      state: { isLoading: false, error: null },
    };
  }

  const s = state({
    isLoading: false,
    error: null,
  });

  const mutate = async (item) => {
    s.value = { isLoading: true, error: null };
    try {
      await localDB.put(tableName, item);
      await localDB.put('outbox', {
        type: 'put',
        tableName,
        data: item,
        timestamp: Date.now(),
      });
      s.value = { isLoading: false, error: null };
    } catch (e) {
      s.value = { isLoading: false, error: e };
    }
  };

  const destroy = async (id) => {
    s.value = { isLoading: true, error: null };
    try {
      await localDB.delete(tableName, id);
      await localDB.put('outbox', {
        type: 'delete',
        tableName,
        id: id,
        timestamp: Date.now(),
      });
      s.value = { isLoading: false, error: null };
    } catch (e) {
      s.value = { isLoading: false, error: e };
    }
  };

  return { mutate, destroy, state: s };
}

let currentSocket = null;
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

export function socket() {
  return {
    connect,
    send(message) {
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        currentSocket.send(message);
      } else {
        console.warn('[WebSocket] Cannot send message, socket is not open.', {
          readyState: currentSocket?.readyState,
        });
      }
    },
    onMessage(callback) {
      messageListeners.add(callback);
      return () => messageListeners.delete(callback);
    },
  };
}

export function effect(fn) {
  const ops = {
    run: fn,
    retry(times) {
      const next = async (...args) => {
        let left = times;
        while (true) {
          try {
            return await this.run(...args);
          } catch (error) {
            left--;
            if (left <= 0) {
              throw error;
            }
            console.warn(`Effect failed. Retrying... (${left} attempts left)`);
          }
        }
      };
      return effect(next);
    },
    time() {
      const next = async (...args) => {
        const start = Date.now();
        const res = await this.run(...args);
        const end = Date.now();
        return [end - start, res];
      };
      return effect(next);
    },
    then(f) {
      const next = async (...args) => {
        const res = await this.run(...args);
        const nextEffect = f(res);
        return nextEffect(...args);
      };
      return effect(next);
    },
  };
  const p = new Proxy(() => { }, {
    apply(target, thisArg, args) {
      return ops.run(...args);
    },
    get(target, prop, receiver) {
      return ops[prop];
    },
  });
  return p;
}
