import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { AI } from './ai.server.js';
import { Store } from './vector-store.js';
import { Ollama } from 'ollama';
import { EventEmitter } from 'events';
import { resolve } from 'path';

mock('./vector-store.js', () => ({
  Store: class {
    init = mock(() => Promise.resolve());
    index = mock(() => Promise.resolve());
    remove = mock(() => Promise.resolve());
    search = mock(() => Promise.resolve([]));
    close = mock(() => {});
  },
}));

mock('ollama', () => ({
  Ollama: class {
    list = mock(() => Promise.resolve({ models: [] }));
    pull = mock(() => Promise.resolve({ status: 'success' }));
    delete = mock(() => Promise.resolve({ status: 'success' }));
  },
}));

const mockSpawn = {
  send: mock(() => {}),
  kill: mock(() => {}),
};
mock('bun', () => ({
  ...require('bun'),
  spawn: mock(() => mockSpawn),
  file: mock((path) => ({
    exists: mock(() => {
      return Promise.resolve(path === resolve(import.meta.dir, 'ai.worker.js'));
    }),
  })),
}));

describe('AI Server Service', () => {
  let ai;
  const config = {
    host: 'http://localhost:11434',
    models: {
      chat: 'test-chat-model',
      embedding: 'test-embedding-model',
    },
    worker: {
      path: resolve(import.meta.dir, 'ai.worker.js'),
    },
    db: {
      path: ':memory:',
      dimensions: 384,
    },
  };

  beforeEach(() => {
    ai = new AI(config);
    ai.store.index = mock(() => Promise.resolve());
    ai.store.remove = mock(() => Promise.resolve());
    ai.store.search = mock(() => Promise.resolve([]));
    ai.ollama.list = mock(() => Promise.resolve({ models: [] }));
    ai.ollama.pull = mock(() => Promise.resolve({ status: 'success' }));
    ai.ollama.delete = mock(() => Promise.resolve({ status: 'success' }));
  });

  afterEach(() => {
    mock.restore();
  });

  test('constructor initializes properties correctly', () => {
    expect(ai.config).toEqual(config);
    expect(ai.store).toBeInstanceOf(Store);
    expect(ai.ollama).toBeInstanceOf(Ollama);
    expect(ai.isReady).toBe(false);
    expect(ai.requestEmitter).toBeInstanceOf(EventEmitter);
  });

  describe('Ollama model management', () => {
    test('list should call ollama.list', async () => {
      await ai.list();
      expect(ai.ollama.list).toHaveBeenCalled();
    });

    test('pull should call ollama.pull', async () => {
      await ai.pull('new-model');
      expect(ai.ollama.pull).toHaveBeenCalledWith({
        model: 'new-model',
        stream: true,
      });
    });

    test('delete should call ollama.delete', async () => {
      await ai.delete('old-model');
      expect(ai.ollama.delete).toHaveBeenCalledWith({ model: 'old-model' });
    });
  });
});
