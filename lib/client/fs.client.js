/**
 * @file Client-side file system abstraction over IndexedDB.
 */

import { session } from './runtime.js';
import { db, transaction, notify } from './db.client.js';
import { createLogger } from '../developer/logger.js';

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
 * @typedef {object} FsApi
 * @property {() => Promise<any | null>} read - Reads the content of a file. Throws if used on a directory path.
 * @property {() => Promise<DirectoryEntry[]>} ls - Lists the contents of a directory. Throws if used on a file path.
 * @property {(content: any, options?: FsOperationOptions) => Promise<void>} write - Writes content to a file. Throws if used on a directory path.
 * @property {(options?: FsOperationOptions) => Promise<void>} rm - Removes a file or directory.
 */

const logger = createLogger('[FS]');

/**
 * @internal
 * Core file system logic that directly interacts with the database.
 */
export const coreFS = {
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
    const allFiles = (await db('files').findByPrefix(prefix)) || [];
    const directChildren = new Map();

    for (const file of allFiles) {
      if (!file.path.startsWith(prefix)) continue;

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

    await transaction(['files', 'outbox'], 'readwrite', (tx) => {
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
 * Provides a high-level API for direct, non-reactive interaction with the client-side file system.
 * @param {string | (() => string)} [path=''] - The path to a file or directory. Can be a string or a reactive getter function.
 * @returns {FsApi} An object with methods for file system interaction.
 */
export function fs(path = '') {
  if (typeof window === 'undefined') {
    return {
      read: () => Promise.resolve(null),
      ls: () => Promise.resolve([]),
      write: () => Promise.resolve(),
      rm: () => Promise.resolve(),
    };
  }

  const getIsDirectory = (/** @type {string | (() => string)} */ p) => {
    const currentPath = typeof p === 'function' ? p() : p;
    return currentPath === '' || currentPath.endsWith('/');
  };

  const methods = {
    read: () => {
      if (getIsDirectory(path))
        return Promise.reject(new Error('Cannot call .read() on a directory.'));
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.readFile(currentPath);
    },
    ls: () => {
      if (!getIsDirectory(path))
        return Promise.reject(
          new Error(
            'Can only call .ls() on a directory path (ending with "/").',
          ),
        );
      const currentPath = typeof path === 'function' ? path() : path;
      return coreFS.listDirectory(currentPath);
    },
    /**
     * @param {any} content
     * @param {FsOperationOptions} [options]
     */
    write: (content, options = { access: 'private' }) => {
      if (getIsDirectory(path))
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
  };

  return methods;
}
