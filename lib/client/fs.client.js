/**
 * @file Client-side file system abstraction over IndexedDB.
 */

import { session } from './session.js';
import { db, performTransaction, notify } from './db.client.js';
import { state, effect } from '../core/reactivity.js';
import { onUnmounted, onMounted } from '../core/lifecycle.js';
import { createLogger } from '../core/logger.js';

/**
 * @template T
 * @typedef {import('../core/reactivity.js').ReactiveProxy<T>} ReactiveProxy
 */

const logger = createLogger('[FS]');

/**
 * @typedef {object} FsOperationOptions
 * @property {'private' | 'public'} [access] - The access level of the file.
 */

/**
 * @typedef {object} DirectoryEntry
 * @property {string} name - The name of the file or directory.
 * @property {boolean} isDirectory - True if the entry is a directory.
 * @property {string} path - The full path of the entry.
 */

/**
 * @internal
 * Core file system logic that directly interacts with the database.
 */
const coreFS = {
  /**
   * Reads the content of a file.
   * @param {string} path - The path to the file.
   * @returns {Promise<any | null>} A promise that resolves with the file content, or null if not found.
   */
  readFile: (path) =>
    db('files')
      .get(path)
      .then((file) => (file ? file.content : null)),

  /**
   * Lists the contents of a directory.
   * @param {string} path - The path to the directory.
   * @returns {Promise<DirectoryEntry[]>} A promise that resolves with an array of directory entries.
   */
  listDirectory: async (path) => {
    logger.debug(`[FS] Listing directory: "${path}"`);
    const normalizedPath = path.replace(/\/$/, '');
    const prefix = normalizedPath ? `${normalizedPath}/` : '';
    const allFiles = (await db('files').getAllWithPrefix(prefix)) || [];
    const directChildren = new Map();

    for (const file of allFiles) {
      const relativePath = file.path.substring(prefix.length);
      const segments = relativePath.split('/');
      const childName = segments[0];

      if (!childName) continue;

      if (!directChildren.has(childName)) {
        const isDirectory = segments.length > 1;
        directChildren.set(childName, {
          name: childName,
          isDirectory: isDirectory,
          path: isDirectory ? `${prefix}${childName}` : file.path,
        });
      }
    }
    const result = Array.from(directChildren.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    logger.debug(`[FS] Directory listing for "${path}" result:`, result);
    return result;
  },

  /**
   * Creates a file system operation and adds it to the outbox for synchronization.
   * @param {object} payload - The operation payload.
   * @param {'fs:write' | 'fs:rm'} payload.type - The type of operation.
   * @param {string} payload.path - The path of the file or directory.
   * @param {any} [payload.data] - The data for a write operation.
   * @param {FsOperationOptions} payload.options - Options for the operation.
   * @returns {Promise<void>}
   */
  async createOperation(payload) {
    if (!session.isLoggedIn || !session.user)
      throw new Error('User not logged in.');
    const op = { ...payload, opId: crypto.randomUUID() };
    logger.log(`[FS] Creating operation:`, op);

    const currentUser = session.user;
    if (!currentUser) {
      throw new Error('User session not found during transaction.');
    }

    await performTransaction(['files', 'outbox'], 'readwrite', (tx) => {
      const filesStore = tx.objectStore('files');
      const outboxStore = tx.objectStore('outbox');

      if (op.type === 'fs:write') {
        filesStore.put({
          path: op.path,
          content: op.data,
          user_id: currentUser.id,
          access: op.options.access || 'private',
          size: op.data?.length || 0,
          last_modified: new Date().toISOString(),
        });
      } else if (op.type === 'fs:rm') {
        const key =
          typeof op.path === 'string'
            ? { path: op.path, user_id: currentUser.id }
            : op.path;
        filesStore.delete([key.path, key.user_id]);
      }
      outboxStore.add(op);
    });

    notify('files');
  },
};

/**
 * @template T
 * @typedef {ReactiveProxy<{ data: T | null; isLoading: boolean; error: Error | null; }> & { write: FsApi['write'], rm: FsApi['rm'] }} UseFsState
 */

/**
 * @typedef {object} FsApi
 * @property {() => Promise<any | null>} read - Reads the content of a file. Throws if used on a directory path.
 * @property {() => Promise<DirectoryEntry[]>} ls - Lists the contents of a directory. Throws if used on a file path.
 * @property {(content: any, options?: FsOperationOptions) => Promise<void>} write - Writes content to a file. Throws if used on a directory path.
 * @property {(options?: FsOperationOptions) => Promise<void>} rm - Removes a file or directory.
 * @property {<T>(initialData?: T | null) => UseFsState<T>} use - A composable that provides reactive access to a file or directory's state.
 */

/**
 * Provides a high-level API for interacting with the client-side file system.
 * @param {string | (() => string)} [path=''] - The path to a file or directory. Can be a string or a reactive getter function.
 * @returns {FsApi} An object with methods for file system interaction.
 */
export function fs(path = '') {
  if (typeof window === 'undefined') {
    /**
     * @template T
     * @param {T | null} [initialData=null]
     * @returns {UseFsState<T>}
     */
    const use = (initialData = null) => {
      const s = state({
        data: initialData,
        isLoading: false,
        error: null,
      });
      /** @type {UseFsState<any>} */
      const reactiveState = /** @type {any} */ (s);
      reactiveState.write = async (
        /**@type {any}*/ _content,
        /**@type {any}*/ _options,
      ) => {};
      reactiveState.rm = async (/**@type {any}*/ _options) => {};
      return reactiveState;
    };
    return {
      read: () => Promise.resolve(null),
      ls: () => Promise.resolve([]),
      write: () => Promise.resolve(),
      rm: () => Promise.resolve(),
      use,
    };
  }

  const isDirectoryOp =
    typeof path === 'function' ? true : path === '' || path.endsWith('/');

  const methods = {
    read: () => {
      if (isDirectoryOp) throw new Error('Cannot call .read() on a directory.');
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.readFile(currentPath);
    },
    ls: () => {
      if (!isDirectoryOp)
        throw new Error(
          'Can only call .ls() on a directory path (ending with "/").',
        );
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.listDirectory(currentPath);
    },
    /**
     * @param {any} content
     * @param {FsOperationOptions} [options]
     */
    write: (content, options = { access: 'private' }) => {
      if (isDirectoryOp)
        throw new Error('Cannot call .write() on a directory.');
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.createOperation({
        type: 'fs:write',
        path: currentPath,
        data: content,
        options,
      });
    },
    /** @param {FsOperationOptions} [options] */
    rm: (options = { access: 'private' }) => {
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.createOperation({
        type: 'fs:rm',
        path: currentPath,
        options,
      });
    },
    /**
     * @template T
     * @param {T | null} [initialData=null]
     * @returns {UseFsState<T>}
     */
    use(initialData = null) {
      const hasInitialData = !!(
        initialData &&
        (!Array.isArray(initialData) || initialData.length > 0)
      );
      logger.log(
        `[fs.use] Initializing for path: ${
          typeof path === 'function' ? path() : path
        }`,
        { initialData, hasInitialData },
      );

      const s = state({
        data: initialData,
        isLoading: !hasInitialData,
        error: /** @type {Error | null} */ (null),
      });

      /** @type {(() => void) | null} */
      let unsubscribe = null;

      const fetchData = async () => {
        const currentDynamicPath = typeof path === 'function' ? path() : path;

        const isDir =
          Array.isArray(s.data) ||
          currentDynamicPath === '' ||
          currentDynamicPath.endsWith('/');

        logger.log(`[fs.use] Fetching data for path: "${currentDynamicPath}"`);
        try {
          s.isLoading = true;
          s.error = null;
          const newData = isDir
            ? await coreFS.listDirectory(currentDynamicPath)
            : await coreFS.readFile(currentDynamicPath);
          logger.log(
            `[fs.use] Fetched data for "${currentDynamicPath}":`,
            newData,
          );
          s.data = newData;
        } catch (e) {
          logger.error(
            `[fs.use] Error fetching data for "${currentDynamicPath}":`,
            e,
          );
          s.error = e instanceof Error ? e : new Error(String(e));
        } finally {
          s.isLoading = false;
        }
      };

      const setupSubscription = (skipInitialFetch = false) => {
        if (unsubscribe) unsubscribe();
        const currentDynamicPath = typeof path === 'function' ? path() : path;
        logger.log(
          `[fs.use] Setting up subscription for path: "${currentDynamicPath}"`,
        );
        unsubscribe = db('files').subscribe(fetchData);
        if (!skipInitialFetch) {
          fetchData();
        }
      };

      onMounted(() => {
        setupSubscription(hasInitialData);

        if (typeof path === 'function') {
          const stopWatch = effect(path, () => {
            logger.log(
              `[fs.use] Watched path changed to: "${path()}", re-subscribing.`,
            );
            setupSubscription(true);
          });
          onUnmounted(stopWatch);
        }
      });

      onUnmounted(() => {
        if (unsubscribe) {
          logger.log(
            `[fs.use] Unsubscribing for path: "${
              typeof path === 'function' ? path() : path
            }"`,
          );
          unsubscribe();
        }
      });

      const reactiveState = /** @type {UseFsState<T>} */ (
        /** @type {any} */ (s)
      );
      reactiveState.write = this.write;
      reactiveState.rm = this.rm;

      return reactiveState;
    },
  };

  methods.write = methods.write.bind(methods);
  methods.rm = methods.rm.bind(methods);
  methods.use = methods.use.bind(methods);

  return methods;
}
