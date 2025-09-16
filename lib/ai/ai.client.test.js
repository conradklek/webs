import { describe, test, expect, mock, afterEach, beforeEach } from 'bun:test';
import { ai } from './ai.client.js';
import { effect } from '../core/reactivity.js';

describe('AI Client Service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Mock the global fetch function before each test
    global.fetch = mock(async (url, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};

      // Search Endpoint
      if (url.toString().endsWith('/api/ai/search/files')) {
        if (body.query === 'error') {
          return new Response('Search failed', { status: 500 });
        }
        return new Response(
          JSON.stringify([{ text: 'result', score: 0.9, metadata: {} }]),
          { status: 200 },
        );
      }

      // Chat Endpoint
      if (url.toString().endsWith('/api/ai/chat')) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('Hello'));
            controller.enqueue(new TextEncoder().encode(' '));
            controller.enqueue(new TextEncoder().encode('World'));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }

      // Models List Endpoint
      if (url.toString().endsWith('/api/ai/models/list')) {
        return new Response(JSON.stringify([{ name: 'test-model' }]), {
          status: 200,
        });
      }

      return new Response('Not Found', { status: 404 });
    });
  });

  afterEach(() => {
    // Restore the original fetch function after each test
    global.fetch = originalFetch;
    // Reset the singleton instance for isolation
    // This requires a way to reset the internal state, which we don't have.
    // For this test, we'll assume the singleton is created once.
  });

  const aiService = ai();

  test('search should return results on success', async () => {
    const results = await aiService.search('test query');
    expect(results).toEqual([{ text: 'result', score: 0.9, metadata: {} }]);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ai/search/files',
      expect.any(Object),
    );
  });

  test('search should throw an error on failure', async () => {
    await expect(aiService.search('error')).rejects.toThrow(
      'AI search failed: Search failed',
    );
  });

  test('chat should return a readable stream', async () => {
    const messages = [{ role: 'user', content: 'hello' }];
    const stream = await aiService.chat(messages);
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  test('models.list should return a list of models', async () => {
    const models = await aiService.models.list();
    expect(models).toEqual([{ name: 'test-model' }]);
    expect(global.fetch).toHaveBeenCalledWith('/api/ai/models/list');
  });

  describe('useChat', () => {
    test('should initialize with correct default state', () => {
      const { state } = aiService.useChat();
      expect(state.data).toBe('');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    test('send should update state reactively', async (done) => {
      const { state, send } = aiService.useChat();
      const messages = [{ role: 'user', content: 'hello' }];

      let effectCount = 0;
      let finalData = '';

      effect(() => {
        // This effect tracks changes to state.data
        const currentData = state.data;
        if (effectCount === 0) {
          // Initial run
          expect(currentData).toBe('');
        } else if (effectCount === 1) {
          // After 'Hello' chunk
          expect(currentData).toBe('Hello');
        } else if (effectCount === 2) {
          // After ' ' chunk
          expect(currentData).toBe('Hello ');
        } else if (effectCount === 3) {
          // After 'World' chunk
          finalData = currentData;
          expect(finalData).toBe('Hello World');

          // Use a timeout to check loading state after stream is done
          setTimeout(() => {
            expect(state.isLoading).toBe(false);
            done();
          }, 100);
        }
        effectCount++;
      });

      await send(messages);
      expect(state.isLoading).toBe(true);
    });
  });
});
