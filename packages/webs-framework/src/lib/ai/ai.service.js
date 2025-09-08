import { onUnmounted, onMounted } from '../renderer.js';
import { session } from '../session.js';
import { state, watch } from '../engine.js';
import { db } from '../sync.js';
import { generateUUID } from '../shared.js';

let aiServiceInstance;

function createAIService() {
  const search = async (query, limit = 5) => {
    const response = await fetch('/api/ai/search/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI search failed: ${errorText}`);
    }
    return response.json();
  };

  const chat = async (messages, options = {}) => {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, options }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI chat failed: ${errorText}`);
    }
    return response.body;
  };

  const models = {
    list: async () => {
      const response = await fetch('/api/ai/models/list');
      if (!response.ok) throw new Error('Failed to list models.');
      return response.json();
    },
    pull: async (modelName) => {
      const response = await fetch('/api/ai/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to pull model: ${errorText}`);
      }
      return response.body;
    },
    delete: async (modelName) => {
      const response = await fetch('/api/ai/models/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      if (!response.ok) throw new Error('Failed to delete model.');
      return response.json();
    },
  };

  const useChat = (initialMessages = []) => {
    const s = state({
      data: '',
      isLoading: false,
      error: null,
      stream: null,
    });

    let reader;

    const cleanup = () => {
      if (reader) {
        reader.cancel();
        reader = null;
      }
      s.isLoading = false;
    };

    onUnmounted(cleanup);

    const send = async (messages) => {
      if (s.isLoading) return;
      s.isLoading = true;
      s.error = null;
      s.data = '';
      try {
        const stream = await chat(messages);
        s.stream = stream;
        reader = stream.getReader();
        const decoder = new TextDecoder();

        function read() {
          reader.read().then(({ done, value }) => {
            if (done) {
              cleanup();
              return;
            }
            s.data += decoder.decode(value, { stream: true });
            read();
          });
        }
        read();
      } catch (err) {
        s.error = err.message;
        s.isLoading = false;
      }
    };

    if (initialMessages.length > 0) {
      send(initialMessages);
    }

    return { state: s, send };
  };

  const useChannel = (channelName) => {
    // SSR Guard: Return a mock object on the server to prevent errors
    if (typeof window === 'undefined') {
      const mockState = state({
        messages: [],
        users: new Set(),
        isConnected: false,
        error: null,
      });
      const mockSend = () => console.warn('Cannot send message on the server.');
      return { state: mockState, send: mockSend };
    }

    const s = state({
      messages: [],
      users: new Set(),
      isConnected: false,
      error: null,
    });
    let ws = null;
    const chatTable = db('chat_messages');

    const fetchMessages = async () => {
      if (!channelName) return;
      const channelMessages = await chatTable.query(
        'by_channel',
        `#${channelName}`,
      );
      s.messages = channelMessages.sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      );
    };

    const connect = () => {
      if (ws) return; // Prevent multiple connections
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/api/chat?channel=${encodeURIComponent(
        channelName,
      )}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        s.isConnected = true;
        s.error = null;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'join') {
            s.users.add(data.user);
            s.messages.push({
              type: 'system',
              text: `${data.user} has joined the channel.`,
              id: generateUUID(),
            });
          } else if (data.type === 'part') {
            s.users.delete(data.user);
            s.messages.push({
              type: 'system',
              text: `${data.user} has left the channel.`,
              id: generateUUID(),
            });
          }
        } catch (e) {
          console.error('Failed to parse chat message:', e);
        }
      };

      ws.onclose = () => {
        s.isConnected = false;
        ws = null; // Clear the instance on close
      };

      ws.onerror = (err) => {
        s.error = 'WebSocket connection error.';
        console.error('WebSocket error:', err);
      };
    };

    const send = (text) => {
      if (ws?.readyState === WebSocket.OPEN) {
        const message = {
          id: generateUUID(),
          channel: `#${channelName}`,
          username: session.user?.username || 'anon',
          message: text,
          user_id: session.user?.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        // Optimistically update local state
        chatTable.put(message);
        // Send to server
        ws.send(text);
      }
    };

    onMounted(() => {
      const stopWatchingUser = watch(
        () => session.user,
        (user) => {
          if (user && !ws) {
            connect();
          }
        },
        { immediate: true },
      );

      const unsubscribe = chatTable.subscribe(fetchMessages);
      fetchMessages();

      onUnmounted(() => {
        stopWatchingUser();
        unsubscribe();
        if (ws) {
          ws.close();
        }
      });
    });

    return { state: s, send };
  };

  return {
    chat,
    models,
    useChat,
    useChannel,
    search,
  };
}

export function ai() {
  if (!aiServiceInstance) {
    aiServiceInstance = createAIService();
  }
  return aiServiceInstance;
}
