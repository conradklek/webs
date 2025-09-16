import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { db, coreDB, notify } from './db.client.js';

const createMockIndexedDB = () => {
  const stores = {};

  const mockRequest = (result, error = null) => {
    return {
      _result: result,
      _error: error,
      onsuccess: null,
      onerror: null,
      get result() {
        if (this._error) throw this._error;
        return this._result;
      },
      get error() {
        return this._error;
      },
      _runCallbacks() {
        setTimeout(() => {
          if (this._error && this.onerror) this.onerror({ target: this });
          else if (this.onsuccess) this.onsuccess({ target: this });
        }, 0);
      },
    };
  };

  const mockObjectStore = (name) => {
    if (!stores[name]) stores[name] = new Map();
    const store = stores[name];
    const keyPath =
      window.__WEBS_DB_CONFIG__?.clientTables.find((t) => t.name === name)
        ?.keyPath || 'id';

    const commonPut = (record) => {
      const key = record[keyPath];
      store.set(key, record);
      const req = mockRequest(key);
      req._runCallbacks();
      return req;
    };

    return {
      get: (key) => {
        const req = mockRequest(store.get(key));
        req._runCallbacks();
        return req;
      },
      getAll: () => {
        const req = mockRequest(Array.from(store.values()));
        req._runCallbacks();
        return req;
      },
      put: commonPut,
      add: commonPut,
      delete: (key) => {
        store.delete(key);
        const req = mockRequest(undefined);
        req._runCallbacks();
        return req;
      },
      clear: () => {
        store.clear();
        const req = mockRequest(undefined);
        req._runCallbacks();
        return req;
      },
      createIndex: () => {},
      index: () => ({
        getAll: () => {
          const req = mockRequest(Array.from(store.values()));
          req._runCallbacks();
          return req;
        },
      }),
    };
  };

  const mockTransaction = {
    objectStore: mockObjectStore,
    oncomplete: null,
    onerror: null,
    onabort: null,
    _runCallbacks() {
      setTimeout(() => {
        if (this.oncomplete) this.oncomplete();
      }, 0);
    },
  };

  const mockDB = {
    transaction: () => {
      const tx = { ...mockTransaction };
      tx._runCallbacks();
      return tx;
    },
    createObjectStore: (name, options) => {
      stores[name] = new Map();
      return mockObjectStore(name);
    },
    objectStoreNames: {
      contains: (name) => name in stores,
      ...Object.keys(stores),
    },
    close: () => {},
  };

  return {
    open: (dbName, version) => {
      const req = mockRequest(mockDB);
      if (req.onsuccess) {
        req.onupgradeneeded?.({
          target: req,
          oldVersion: 0,
          newVersion: version,
        });
      }
      req._runCallbacks();
      return req;
    },
    _stores: stores,
  };
};

describe('Client DB API', () => {
  beforeEach(() => {
    global.window = {
      indexedDB: createMockIndexedDB(),
      __WEBS_DB_CONFIG__: {
        version: 1,
        clientTables: [
          { name: 'todos', keyPath: 'id', sync: true },
          { name: 'notes', keyPath: 'id', sync: false },
        ],
      },
      crypto: {
        randomUUID: () => 'mock-uuid-' + Math.random(),
      },
    };
    coreDB.db = null;
  });

  afterEach(() => {
    delete global.window;
    mock.restore();
  });

  test('db("tableName") should return a table API', () => {
    const todosDb = db('todos');
    expect(todosDb.get).toBeInstanceOf(Function);
    expect(todosDb.put).toBeInstanceOf(Function);
    expect(todosDb.delete).toBeInstanceOf(Function);
    expect(todosDb.getAll).toBeInstanceOf(Function);
    expect(todosDb.subscribe).toBeInstanceOf(Function);
  });

  test('put should add a record to the store', async () => {
    const todosDb = db('todos');
    const todo = { id: '1', text: 'Test todo' };
    await todosDb.put(todo);

    const stored = await todosDb.get('1');
    expect(stored).toEqual(expect.objectContaining(todo));
  });

  test('get should retrieve a record from the store', async () => {
    const todosDb = db('todos');
    const todo = { id: '2', text: 'Another todo' };
    await todosDb.put(todo);

    const result = await todosDb.get('2');
    expect(result).toEqual(expect.objectContaining(todo));
  });

  test('delete should remove a record from the store', async () => {
    const todosDb = db('todos');
    const todo = { id: '3', text: 'To be deleted' };
    await todosDb.put(todo);
    let stored = await todosDb.get('3');
    expect(stored).toBeDefined();

    await todosDb.delete('3');
    stored = await todosDb.get('3');
    expect(stored).toBeUndefined();
  });

  test('getAll should retrieve all records from the store', async () => {
    const todosDb = db('todos');
    await todosDb.put({ id: '1', text: 'A' });
    await todosDb.put({ id: '2', text: 'B' });

    const allTodos = await todosDb.getAll();
    expect(allTodos).toHaveLength(2);
    expect(allTodos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '1', text: 'A' }),
        expect.objectContaining({ id: '2', text: 'B' }),
      ]),
    );
  });

  test('subscribe and notify should trigger callback on data change', async () => {
    const todosDb = db('todos');
    const callback = mock(() => {});

    const unsubscribe = todosDb.subscribe(callback);
    expect(callback).not.toHaveBeenCalled();

    notify('todos');
    expect(callback).toHaveBeenCalledTimes(1);

    notify('otherTable');
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    notify('todos');
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
