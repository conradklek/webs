import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { AI } from './ai.server.js';
import { Store } from './vector-store.js';
import { Ollama } from 'ollama';
import { EventEmitter } from 'events';
import { resolve } from 'path';

mock.module('./vector-store.js', () => ({
  Store: class {
    init = mock(() => Promise.resolve());
    index = mock(() => Promise.resolve());
    remove = mock(() => Promise.resolve());
    search = mock(() => Promise.resolve([]));
    close = mock(() => {});
  },
}));

mock.module('ollama', () => ({
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

const mockBun = {
  spawn: mock(() => mockSpawn),
  file: mock((path) => ({
    exists: mock(() => Promise.resolve(true)),
  })),
};
mock.module('bun', () => mockBun);

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
    mockBun.spawn.mockClear();
    mockSpawn.kill.mockClear();
    ai = new AI(config);
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

  test('removeFileIndex should call store.remove', async () => {
    await ai.removeFileIndex('test.txt');
    expect(ai.store.remove).toHaveBeenCalledWith('test.txt', undefined);
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
