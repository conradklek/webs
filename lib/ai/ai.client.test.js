import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { ai } from './ai.client.js';

describe('AI Client', () => {
  let mockFetch;

  beforeEach(() => {
    mock.restore();

    mockFetch = global.fetch;
    global.fetch = mock(async (url, options) => {
      const urlString = url.toString();
      if (urlString.endsWith('/api/ai/search/files')) {
        if (options?.body?.includes('fail')) {
          return new Response('Search failed', { status: 500 });
        }
        return new Response(
          JSON.stringify([{ text: 'result1', score: 0.9, metadata: {} }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (
        urlString.endsWith('/api/ai/chat') ||
        urlString.startsWith('/api/ai/agent/run/')
      ) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('Hello'));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }
      if (urlString.endsWith('/api/ai/models/list')) {
        return new Response(JSON.stringify([{ name: 'test-model' }]), {
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

  describe('ai() service', () => {
    test('ai() should be a singleton', () => {
      const instance1 = ai();
      const instance2 = ai();
      expect(instance1).toBe(instance2);
    });

    test('search should perform a search and return results', async () => {
      const results = await ai().search('test query');
      expect(results).toEqual([{ text: 'result1', score: 0.9, metadata: {} }]);
      expect(global.fetch).toHaveBeenCalledWith('/api/ai/search/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test query', limit: 5 }),
      });
    });

    test('chat should initiate chat and return a stream', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const stream = await ai().chat(messages);
      expect(stream).toBeInstanceOf(ReadableStream);
    });
  });
});
