import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { ai } from './ai.client.js';

mock('../core/reactivity.js', () => ({
  state: (initial) => {
    let internalState = initial;
    const proxy = new Proxy(
      {},
      {
        get(_, prop) {
          return internalState[prop];
        },
        set(_, prop, value) {
          internalState[prop] = value;
          return true;
        },
      },
    );
    return proxy;
  },
}));

describe('AI Client Service', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = global.fetch;
    global.fetch = mock(async (url, options) => {
      if (url.toString().endsWith('/api/ai/search/files')) {
        return new Response(
          JSON.stringify([{ text: 'result1', score: 0.9, metadata: {} }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.toString().endsWith('/api/ai/chat')) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('Hello'));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }
      if (url.toString().endsWith('/api/ai/models/list')) {
        return new Response(JSON.stringify([{ name: 'test-model' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.toString().endsWith('/api/ai/models/pull')) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('pulling...'));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }
      if (url.toString().endsWith('/api/ai/models/delete')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });
  });

  afterEach(() => {
    global.fetch = mockFetch;
  });

  test('ai() should be a singleton', () => {
    const instance1 = ai();
    const instance2 = ai();
    expect(instance1).toBe(instance2);
  });

  describe('search', () => {
    test('should perform a search and return results', async () => {
      const results = await ai().search('test query');
      expect(results).toEqual([{ text: 'result1', score: 0.9, metadata: {} }]);
      expect(global.fetch).toHaveBeenCalledWith('/api/ai/search/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test query', limit: 5 }),
      });
    });
  });

  describe('chat', () => {
    test('should initiate chat and return a stream', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const stream = await ai().chat(messages);
      expect(stream).toBeInstanceOf(ReadableStream);
    });
  });

  describe('models', () => {
    test('list should fetch available models', async () => {
      const models = await ai().models.list();
      expect(models).toEqual([{ name: 'test-model' }]);
      expect(global.fetch).toHaveBeenCalledWith('/api/ai/models/list');
    });

    test('pull should return a stream for model download', async () => {
      const stream = await ai().models.pull('test-model');
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    test('delete should remove a model', async () => {
      const result = await ai().models.delete('test-model');
      expect(result).toEqual({ success: true });
    });
  });

  describe('useChat', () => {
    test('should initialize and send messages', async () => {
      const { state, send } = ai().useChat();
      expect(state.isLoading).toBe(false);
      expect(state.data).toBe('');

      const messages = [{ role: 'user', content: 'Test message' }];
      const sendPromise = send(messages);

      expect(state.isLoading).toBe(true);

      await sendPromise;

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(state.data).toBe('Hello');
      expect(state.isLoading).toBe(false);
    });
  });
});
