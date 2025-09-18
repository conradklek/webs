import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { table } from './runtime.js';

const mockDbInstance = {
  getAll: mock(() => Promise.resolve([])),
  put: mock(() => Promise.resolve()),
  delete: mock(() => Promise.resolve()),
  subscribe: mock(() => () => {}),
  bulkPut: mock(() => Promise.resolve()),
};

mock.module('./db.client.js', () => ({
  db: mock(() => mockDbInstance),
}));

let onMountedCallback;
const onUnmountedCallbacks = [];
mock.module('../core/component.js', () => ({
  onMounted: mock((fn) => {
    onMountedCallback = fn;
  }),
  onUnmounted: mock((fn) => {
    onUnmountedCallbacks.push(fn);
  }),
}));

const stateMock = (initial) => {
  let internalState = { ...initial };
  return new Proxy(internalState, {
    get: (target, prop) => internalState[prop],
    set: (target, prop, value) => {
      internalState[prop] = value;
      return true;
    },
  });
};
mock.module('../core/reactivity.js', () => ({
  state: mock(stateMock),
}));

describe('Runtime Composables', () => {
  beforeEach(() => {
    onMountedCallback = null;
    onUnmountedCallbacks.length = 0;
    mock.restore();
    mockDbInstance.getAll.mockResolvedValue([{ id: 1, text: 'Mock Item' }]);
    global.window = {
      location: { protocol: 'http:', host: 'localhost', pathname: '/test' },
    };
  });

  afterEach(() => {
    delete global.window;
  });

  describe('table', () => {
    test('should fetch initial data on mount', async () => {
      const tableState = table('todos');
      expect(tableState.isLoading).toBe(true);

      if (onMountedCallback) {
        await onMountedCallback();
      }

      expect(mockDbInstance.getAll).toHaveBeenCalledWith();
      expect(tableState.data).toEqual([{ id: 1, text: 'Mock Item' }]);
      expect(tableState.isLoading).toBe(false);
    });

    test('put() should call the underlying db method', async () => {
      const tableState = table('todos');
      const newItem = { id: 2, text: 'New Item' };
      await tableState.put(newItem);
      expect(mockDbInstance.put).toHaveBeenCalledWith(newItem);
    });

    test('destroy() should call the underlying db method', async () => {
      const tableState = table('todos');
      await tableState.destroy(1);
      expect(mockDbInstance.delete).toHaveBeenCalledWith(1);
    });
  });
});
