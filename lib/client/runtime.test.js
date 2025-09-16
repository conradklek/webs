import { test, expect, describe, beforeEach, mock } from 'bun:test';
import * as runtime from './runtime.js';
import * as reactivity from '../core/reactivity.js';
import * as lifecycle from '../core/component.js';
import * as vdom from '../core/vdom.js';
import * as core from '../core/core.js';
import { db } from './db.client.js';

let mountedCallback = null;
mock.module('../core/component.js', () => ({
  ...lifecycle,
  onMounted: mock((fn) => {
    mountedCallback = fn;
  }),
  onUnmounted: mock(() => {}),
}));

mock.module('./db.client.js', () => {
  const mockDbInstance = {
    getAll: mock(() => Promise.resolve([])),
    subscribe: mock(() => () => {}),
    put: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
    bulkPut: mock(() => Promise.resolve()),
  };
  return {
    db: mock(() => mockDbInstance),
  };
});

describe('Runtime', () => {
  beforeEach(() => {
    if (global.window) {
      delete global.window.__WEBS_STATE__;
    }
    mountedCallback = null;
    mock.restore();
  });

  describe('Exports', () => {
    test('should re-export core functionalities', () => {
      expect(runtime.createApp).toBe(core.createApp);
      expect(runtime.hydrate).toBe(core.hydrate);
      expect(runtime.router).toBe(core.router);
      expect(runtime.route).toBe(core.route);
    });

    test('should re-export reactivity functionalities', () => {
      expect(runtime.state).toBe(reactivity.state);
      expect(runtime.ref).toBe(reactivity.ref);
      expect(runtime.effect).toBe(reactivity.effect);
      expect(runtime.computed).toBe(reactivity.computed);
      expect(runtime.store).toBe(reactivity.store);
    });

    test('should re-export lifecycle hooks', () => {
      expect(runtime.onMounted).toBe(lifecycle.onMounted);
      expect(runtime.onUnmounted).toBe(lifecycle.onUnmounted);
      expect(runtime.onBeforeMount).toBe(lifecycle.onBeforeMount);
      expect(runtime.onUpdated).toBe(lifecycle.onUpdated);
    });

    test('should re-export VDOM utilities', () => {
      expect(runtime.h).toBe(vdom.h);
      expect(runtime.Text).toBe(vdom.Text);
      expect(runtime.Fragment).toBe(vdom.Fragment);
    });
  });

  describe('action()', () => {
    beforeEach(() => {
      global.window = { __WEBS_STATE__: { componentName: 'TestComponent' } };
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: 'success' }),
        }),
      );
    });

    test('should return a call function and a state object', () => {
      const myAction = runtime.action('doSomething');
      expect(typeof myAction.call).toBe('function');
      expect(typeof myAction.state).toBe('object');
      expect(myAction.state.isLoading).toBe(false);
    });

    test('should call fetch with the correct URL and body', async () => {
      const myAction = runtime.action('doSomething');
      await myAction.call('arg1', { data: 'arg2' });

      expect(global.fetch).toHaveBeenCalledWith(
        '/__actions__/TestComponent/doSomething',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(['arg1', { data: 'arg2' }]),
        },
      );
    });

    test('should update state to success on OK response', async () => {
      const myAction = runtime.action('doSomething');
      const promise = myAction.call();

      expect(myAction.state.isLoading).toBe(true);
      await promise;
      expect(myAction.state.isLoading).toBe(false);
      expect(myAction.state.data).toEqual({ result: 'success' });
      expect(myAction.state.error).toBe(null);
    });

    test('should update state to error on non-OK response', async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error'),
        }),
      );

      const myAction = runtime.action('doSomething');
      await myAction.call();

      expect(myAction.state.isLoading).toBe(false);
      expect(myAction.state.data).toBe(null);
      expect(myAction.state.error).toBeInstanceOf(Error);
      expect(myAction.state.error.message).toBe('Server Error');
    });
  });

  describe('table()', () => {
    beforeEach(() => {
      global.window = {};
    });

    test('should initialize and fetch data on mount', async () => {
      const mockDbInstance = db('test');
      const getAllMock = mockDbInstance.getAll;
      getAllMock.mockResolvedValueOnce([{ id: 1, name: 'Test' }]);

      const myTable = runtime.table('test', []);

      if (mountedCallback) {
        await mountedCallback();
      } else {
        throw new Error('onMounted callback was not captured');
      }

      expect(db).toHaveBeenCalledWith('test');
      expect(getAllMock).toHaveBeenCalled();
      expect(myTable.data).toEqual([{ id: 1, name: 'Test' }]);
      expect(myTable.isLoading).toBe(false);
    });

    test('should call db methods correctly', async () => {
      const mockDbInstance = db('test');
      const myTable = runtime.table('test');

      const record = { id: 2, name: 'New' };
      await myTable.put(record);
      expect(mockDbInstance.put).toHaveBeenCalledWith(record);

      await myTable.destroy(2);
      expect(mockDbInstance.delete).toHaveBeenCalledWith(2);
    });
  });
});
