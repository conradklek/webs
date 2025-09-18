/**
 * @file Orchestrates the client-side IndexedDB instance, providing a high-level API for schema management, transactional operations, and data access.
 */

import { createLogger } from '../developer/logger.js';
import { session } from './runtime.js';

/**
 * @typedef {object} IndexSchema
 * @property {string} name - The name of the index.
 * @property {string | string[]} keyPath - The key path for the index.
 * @property {IDBIndexParameters} [options] - Options for the index (e.g., unique, multiEntry).
 */

/**
 * @typedef {object} TableSchema
 * @property {string} name - The name of the object store.
 * @property {string | string[]} keyPath - The key path for the object store.
 * @property {boolean} [autoIncrement] - Whether the key should be auto-incrementing.
 * @property {IndexSchema[]} [indexes] - An array of index definitions for the object store.
 * @property {boolean} [sync] - Whether the table should be synchronized with the server.
 */

/**
 * @typedef {object} DbConfig
 * @property {number} version - The version of the database schema.
 * @property {TableSchema[]} clientTables - An array of table schemas for the client-side database.
 */

/**
 * @typedef {object} DbTableApi
 * @property {(key: IDBValidKey) => Promise<any | null | undefined>} get - Retrieves a single record by its primary key.
 * @property {() => Promise<any[] | undefined>} getAll - Retrieves all records from the table.
 * @property {(prefix: string) => Promise<any[] | undefined>} findByPrefix - Retrieves records whose primary key starts with a given prefix.
 * @property {(indexName: string, query: IDBValidKey | IDBKeyRange) => Promise<any[] | undefined>} query - Queries the table using a specified index.
 * @property {(record: object) => Promise<void>} put - Adds or updates a record in the table.
 * @property {(records: object[]) => Promise<void>} bulkPut - Adds or updates multiple records in the table.
 * @property {(key: IDBValidKey) => Promise<void>} delete - Deletes a record by its primary key.
 * @property {(callback: () => void) => () => void} subscribe - Subscribes to changes in the table.
 * @property {() => Promise<void | undefined>} clear - Clears all records from the table.
 */

const logger = createLogger('[DB]');

const DB_NAME = 'webs-local-db';

/**
 * @internal
 * @type {Promise<IDBDatabase | null> | null}
 * A promise that resolves with the database instance.
 */
let dbPromise = null;

/**
 * @internal
 * @type {import('./sync-engine.js').SyncEngine | null} A reference to the synchronization engine.
 */
let syncEngineRef = null;

/**
 * @internal
 * Promisifies an IDBRequest, providing a modern async/await-compatible interface for IndexedDB's event-based operations.
 * @template T
 * @param {IDBRequest<T>} request The IndexedDB request.
 * @returns {Promise<T>} A promise that resolves with the request's result or rejects with its error.
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @internal
 * Opens and initializes the IndexedDB database.
 * @param {DbConfig} config The database configuration.
 * @returns {Promise<IDBDatabase | null>} A promise that resolves with the database instance.
 */
function openDB(config) {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;
  logger.log('Opening IndexedDB...');
  dbPromise = new Promise((resolve, reject) => {
    const version = config?.version || 1;
    const request = window.indexedDB.open(DB_NAME, version);

    request.onerror = (e) => {
      logger.error('IndexedDB error:', /** @type {any} */ (e.target).error);
      reject(/** @type {any} */ (e.target).error);
    };
    request.onsuccess = () => {
      logger.log('IndexedDB opened successfully.');
      resolve(request.result);
    };

    request.onupgradeneeded = (e) => {
      logger.log('IndexedDB upgrade needed.', {
        oldVersion: e.oldVersion,
        newVersion: e.newVersion,
      });
      const db = /** @type {IDBDatabase} */ (
        /** @type {any} */ (e.target).result
      );
      const tx = /** @type {IDBTransaction} */ (
        /** @type {any} */ (e.target).transaction
      );

      if (!db.objectStoreNames.contains('outbox')) {
        logger.debug("Creating 'outbox' object store.");
        db.createObjectStore('outbox', { keyPath: 'opId' });
      }

      config?.clientTables?.forEach((tableSchema) => {
        if (!db.objectStoreNames.contains(tableSchema.name)) {
          logger.debug(`Creating '${tableSchema.name}' object store.`);
          const store = db.createObjectStore(tableSchema.name, {
            keyPath: tableSchema.keyPath,
            autoIncrement: tableSchema.autoIncrement,
          });
          tableSchema.indexes?.forEach((index) =>
            store.createIndex(index.name, index.keyPath, index.options),
          );
        } else {
          logger.debug(
            `Checking indexes for '${tableSchema.name}' object store.`,
          );
          if (tx) {
            const store = tx.objectStore(tableSchema.name);
            const existingIndices = new Set(store.indexNames);
            tableSchema.indexes?.forEach((index) => {
              if (!existingIndices.has(index.name)) {
                logger.debug(
                  `Creating index '${index.name}' on '${tableSchema.name}'.`,
                );
                store.createIndex(index.name, index.keyPath, index.options);
              }
            });
          }
        }
      });
    };
  });
  return dbPromise;
}

/**
 * @internal
 * @type {Map<string, Set<() => void>>}
 * A map of table names to their subscriber callback functions.
 */
const tableSubscribers = new Map();

/**
 * Notifies all subscribers for a given table that its data has changed.
 * @param {string} tableName The name of the table that was updated.
 */
export function notify(tableName) {
  logger.debug(`Notifying subscribers for table: ${tableName}`);
  tableSubscribers.get(tableName)?.forEach((callback) => callback());
}

/**
 * The core database object containing low-level methods.
 * @internal
 */
export const coreDB = {
  /** @type {Promise<IDBDatabase | null> | null} */
  db: null,
  _getDB() {
    if (!this.db) {
      this.db = openDB(/** @type {any} */ (window).__WEBS_DB_CONFIG__);
    }
    return this.db;
  },

  /**
   * Sets a reference to the sync engine for push notifications.
   * @param {import('./sync-engine.js').SyncEngine} engine The sync engine instance.
   */
  setSyncEngine(engine) {
    syncEngineRef = engine;
  },

  /**
   * Performs an IndexedDB transaction.
   * @template T
   * @param {string | string[]} tableNames The name(s) of the object stores to include in the transaction.
   * @param {IDBTransactionMode} mode The transaction mode ('readonly' or 'readwrite').
   * @param {(tx: IDBTransaction) => T | Promise<T>} action The function to execute within the transaction context.
   * @returns {Promise<T | undefined>} A promise that resolves with the result of the action.
   */
  async transaction(tableNames, mode, action) {
    const db = await this._getDB();
    if (!db) return undefined;
    const tableNamesArray = Array.isArray(tableNames)
      ? tableNames
      : [tableNames];

    const tx = db.transaction(tableNamesArray, mode);

    const transactionPromise = new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        resolve(undefined);
      };
      tx.onerror = () => {
        reject(tx.error);
      };
      tx.onabort = () => {
        reject(new Error('Transaction aborted'));
      };
    });

    try {
      const actionResult = await action(tx);
      await transactionPromise;
      return actionResult;
    } catch (err) {
      tx.abort();
      throw err;
    }
  },

  /**
   * @param {string} tableName
   * @param {IDBValidKey} key
   */
  get: (tableName, key) =>
    coreDB.transaction(tableName, 'readonly', (tx) =>
      promisifyRequest(tx.objectStore(tableName).get(key)),
    ),

  /** @param {string} tableName */
  getAll: (tableName) =>
    coreDB.transaction(tableName, 'readonly', (tx) =>
      promisifyRequest(tx.objectStore(tableName).getAll()),
    ),

  /**
   * @param {string} tableName
   * @param {string} prefix
   */
  findByPrefix: (tableName, prefix) =>
    coreDB.transaction(tableName, 'readonly', (tx) => {
      const store = tx.objectStore(tableName);
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff');
      return promisifyRequest(store.getAll(range));
    }),

  /**
   * @param {string} tableName
   * @param {string} indexName
   * @param {IDBValidKey | IDBKeyRange} query
   */
  query: (tableName, indexName, query) =>
    coreDB.transaction(tableName, 'readonly', (tx) => {
      const store = tx.objectStore(tableName);
      const index = store.index(indexName);
      return promisifyRequest(index.getAll(query));
    }),

  /**
   * @param {string} tableName
   * @param {any} record
   */
  put: async (tableName, record) => {
    const tableConfig = /** @type {any} */ (
      window
    ).__WEBS_DB_CONFIG__?.clientTables.find(
      (/** @type {TableSchema} */ t) => t.name === tableName,
    );
    const isSynced = tableConfig?.sync;
    const tables = isSynced ? [tableName, 'outbox'] : [tableName];

    const recordWithUser = {
      ...record,
      user_id: record.user_id || session.user?.id,
    };

    await coreDB.transaction(tables, 'readwrite', (tx) => {
      tx.objectStore(tableName).put(recordWithUser);
      if (isSynced) {
        const op = {
          tableName,
          type: 'put',
          data: recordWithUser,
          opId: crypto.randomUUID(),
        };
        tx.objectStore('outbox').add(op);
      }
    });
    if (isSynced && syncEngineRef) syncEngineRef.process();
    notify(tableName);
  },

  /**
   * @param {string} tableName
   * @param {object[]} records
   */
  bulkPut: async (tableName, records) => {
    if (!records || records.length === 0) return;
    await coreDB.transaction(tableName, 'readwrite', (tx) => {
      const store = tx.objectStore(tableName);
      records.forEach((record) => store.put(record));
    });
    notify(tableName);
  },

  /**
   * @param {string} tableName
   * @param {IDBValidKey} key
   */
  delete: async (tableName, key) => {
    const tableConfig = /** @type {any} */ (
      window
    ).__WEBS_DB_CONFIG__?.clientTables.find(
      (/** @type {TableSchema} */ t) => t.name === tableName,
    );
    const isSynced = tableConfig?.sync;
    const tables = isSynced ? [tableName, 'outbox'] : [tableName];

    await coreDB.transaction(tables, 'readwrite', (tx) => {
      tx.objectStore(tableName).delete(key);
      if (isSynced) {
        const op = {
          tableName,
          type: 'delete',
          id: key,
          opId: crypto.randomUUID(),
        };
        tx.objectStore('outbox').add(op);
      }
    });
    if (isSynced && syncEngineRef) syncEngineRef.process();
    notify(tableName);
  },

  /** @param {string} tableName */
  clear: (tableName) =>
    coreDB.transaction(tableName, 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(tableName).clear());
      notify(tableName);
    }),

  /**
   * @param {string} tableName
   * @param {() => void} callback
   * @returns {() => void} An unsubscribe function.
   */
  subscribe: (tableName, callback) => {
    if (!tableSubscribers.has(tableName)) {
      tableSubscribers.set(tableName, new Set());
    }
    tableSubscribers.get(tableName)?.add(callback);
    return () => tableSubscribers.get(tableName)?.delete(callback);
  },

  /**
   * Handles incoming sync messages from the server.
   * @param {object} message
   * @param {string} message.tableName
   * @param {'put' | 'delete'} message.type
   * @param {object} [message.data]
   * @param {IDBValidKey} [message.id]
   */
  handleSyncMessage: async ({ tableName, type, data, id }) => {
    logger.log(`Handling incoming sync message`, { tableName, type, data, id });
    await coreDB.transaction(tableName, 'readwrite', (tx) => {
      const store = tx.objectStore(tableName);
      if (type === 'put' && data) {
        store.put(data);
      } else if (type === 'delete' && id !== undefined) {
        store.delete(id);
      }
    });
    notify(tableName);
  },
};

/**
 * A wrapper around `coreDB.transaction` for external use.
 * @template T
 * @param {string | string[]} tableNames The name(s) of the object stores.
 * @param {IDBTransactionMode} mode The transaction mode.
 * @param {(tx: IDBTransaction) => T | Promise<T>} action The function to execute.
 * @returns {Promise<T | undefined>} A promise that resolves with the result of the action.
 */
export function transaction(tableNames, mode, action) {
  return coreDB.transaction(tableNames, mode, action);
}

/**
 * @internal
 * Creates a no-op stub of the database API for server-side rendering (SSR) environments, ensuring isomorphic code compatibility.
 * @returns {DbTableApi}
 */
function createSsrDbMock() {
  const fn = () => Promise.resolve();
  const getFn = () => Promise.resolve(null);
  const empty = () => Promise.resolve([]);
  return {
    get: getFn,
    getAll: empty,
    findByPrefix: empty,
    query: empty,
    put: fn,
    bulkPut: fn,
    delete: fn,
    subscribe: () => () => {},
    clear: fn,
  };
}

/**
 * Returns a high-level API for interacting with a specific database table.
 * @param {string} tableName The name of the table to interact with.
 * @returns {DbTableApi} An object with methods for interacting with the specified table.
 */
export function db(tableName) {
  if (typeof window === 'undefined') {
    return createSsrDbMock();
  }
  if (!tableName) throw new Error('db() requires a table name.');

  return {
    get: (key) => coreDB.get(tableName, key),
    getAll: () => coreDB.getAll(tableName),
    findByPrefix: (prefix) => coreDB.findByPrefix(tableName, prefix),
    query: (indexName, query) => coreDB.query(tableName, indexName, query),
    put: (record) => coreDB.put(tableName, record),
    bulkPut: (records) => coreDB.bulkPut(tableName, records),
    delete: (key) => coreDB.delete(tableName, key),
    subscribe: (callback) => coreDB.subscribe(tableName, callback),
    clear: () => coreDB.clear(tableName),
  };
}

/**
 * Resets the database state for testing purposes.
 * @internal
 */
export function _resetDBForTests() {
  dbPromise = null;
  coreDB.db = null;
  tableSubscribers.clear();
}
