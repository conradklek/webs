import { join, resolve, dirname } from 'path';
import {
  cp as copy,
  mkdir as fsMkdir,
  rename,
  rm as fsRm,
  stat as fsStat,
  readdir,
} from 'node:fs/promises';
import { createLogger } from '../shared/logger.js';
import { write, file as bunFile } from 'bun';

/** @typedef {import('bun:sqlite').Database} BunDatabase */
/** @typedef {import('bun').BunFile} BunFile */

/**
 * @typedef {'public' | 'private'} FileAccessLevel
 */

/**
 * @typedef {object} FsOptions
 * @property {FileAccessLevel} [access='public'] - The access level for the file operation.
 */

/**
 * @typedef {object} FileStats
 * @property {boolean} isFile - True if the path points to a file.
 * @property {boolean} isDirectory - True if the path points to a directory.
 * @property {number} size - The size of the file in bytes.
 * @property {Date} mtime - The last modification time.
 * @property {Date} birthtime - The creation time.
 */

/**
 * @typedef {object} ServerFsApi
 * @property {() => string} getPrivateRootPath - Gets the absolute path to the user's private directory.
 * @property {(path: string, options?: FsOptions) => Promise<boolean>} exists - Checks if a file or directory exists.
 * @property {(path: string, options?: FsOptions) => Promise<FileStats>} stat - Retrieves stats for a file or directory.
 * @property {(path: string, options?: FsOptions) => Promise<import('bun').BunFile>} cat - Reads a file and returns a `BunFile` object for streaming or consumption.
 * @property {(path?: string, options?: FsOptions) => Promise<Array<{name: string, isDirectory: boolean, path: string}>>} ls - Lists the contents of a directory.
 * @property {(path: string, options?: FsOptions) => Promise<string | undefined>} mkdir - Creates a new directory.
 * @property {(path: string, data: import('bun').file | Blob | string | Buffer | ArrayBuffer | ReadableStream, options?: FsOptions) => Promise<number | void>} write - Writes data to a file.
 * @property {(from: string, to: string, options?: FsOptions) => Promise<void>} mv - Moves or renames a file or directory.
 * @property {(path: string, options?: FsOptions) => Promise<void>} rm - Removes a file or directory.
 * @property {(from: string, to: string, options?: FsOptions) => Promise<void>} cp - Copies a file or directory.
 */

const logger = createLogger('[FS]');

/**
 * The root directory for all user files on the server.
 * @internal
 * @type {string}
 */
const USER_FILES_ROOT = resolve(process.cwd(), '.webs/files');

/**
 * Creates a sandboxed file system API for a specific user.
 * All paths are resolved relative to the user's dedicated directory to prevent path traversal attacks.
 * @param {string | number} userId - The unique identifier for the user.
 * @returns {ServerFsApi} An object with secure methods for file system manipulation.
 */
export function createFileSystemForUser(userId) {
  if (!userId) throw new Error('A valid userId is required.');
  const userRootPath = join(USER_FILES_ROOT, String(userId));
  const publicPath = join(userRootPath, 'public');
  const privatePath = join(userRootPath, 'private');

  /**
   * @internal
   * Resolves a user-provided path to an absolute path within the user's sandboxed directory.
   * @param {string} [userPath='.'] - The path provided by the user.
   * @param {FileAccessLevel} [access='public'] - The access level.
   * @returns {string} The secure, absolute path.
   * @throws {Error} If the path attempts to traverse outside the user's directory.
   */
  const secureResolvePath = (userPath = '.', access = 'public') => {
    const basePath = access === 'private' ? privatePath : publicPath;
    const absolutePath = resolve(basePath, userPath);
    if (!absolutePath.startsWith(basePath)) {
      throw new Error('Permission denied: Path traversal attempt detected.');
    }
    return absolutePath;
  };

  /**
   * @internal
   * Ensures the parent directory of a given file path exists.
   * @param {string} filePath - The full path to the file.
   * @returns {Promise<void>}
   */
  const ensureDirectoryExists = async (filePath) => {
    const dir = dirname(filePath);
    try {
      await fsStat(dir);
    } catch (e) {
      const nodeError = /** @type {NodeJS.ErrnoException} */ (e);
      if (nodeError.code === 'ENOENT') {
        await fsMkdir(dir, { recursive: true });
      } else {
        throw e;
      }
    }
  };

  return {
    getPrivateRootPath: () => privatePath,

    exists: async (path, { access = 'public' } = {}) => {
      try {
        await fsStat(secureResolvePath(path, access));
        return true;
      } catch (error) {
        const nodeError = /** @type {NodeJS.ErrnoException} */ (error);
        if (nodeError.code === 'ENOENT') {
          return false;
        }
        throw error;
      }
    },
    stat: async (path, { access = 'public' } = {}) => {
      const stats = await fsStat(secureResolvePath(path, access));
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime,
        birthtime: stats.birthtime,
      };
    },
    cat: async (path, { access = 'public' } = {}) => {
      const resolvedPath = secureResolvePath(path, access);
      const file = bunFile(resolvedPath);
      if (!(await file.exists())) throw new Error(`File not found at: ${path}`);
      return file;
    },
    ls: async (path = '.', { access = 'public' } = {}) => {
      const resolvedPath = secureResolvePath(path, access);
      logger.debug(`[FS] Listing directory: "${resolvedPath}"`);
      try {
        const stats = await fsStat(resolvedPath);
        if (!stats.isDirectory()) {
          logger.warn(`[FS] Path "${resolvedPath}" is not a directory.`);
          return [];
        }

        const entries = await readdir(resolvedPath, { withFileTypes: true });
        return entries
          .map((entry) => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            path: join(path, entry.name).replace(/\\/g, '/'),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch (error) {
        const nodeError = /** @type {NodeJS.ErrnoException} */ (error);
        if (nodeError.code === 'ENOENT') {
          return [];
        }
        logger.error(
          `[FS] Error in ls for path "${resolvedPath}" (code: ${nodeError.code}):`,
          error,
        );
        throw error;
      }
    },
    mkdir: async (path, { access = 'public' } = {}) => {
      const p = secureResolvePath(path, access);
      return fsMkdir(p, { recursive: true });
    },

    write: async (path, data, { access = 'public' } = {}) => {
      const resolvedPath = secureResolvePath(path, access);
      await ensureDirectoryExists(resolvedPath);

      if (data instanceof ReadableStream) {
        const writer = bunFile(resolvedPath).writer();
        const reader = data.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            writer.end();
            break;
          }
          writer.write(value);
        }
        await writer.flush();
      } else {
        return write(
          resolvedPath,
          /** @type {Blob | Buffer | string | ArrayBuffer} */ (data),
        );
      }
    },

    mv: async (from, to, { access = 'public' } = {}) => {
      const fromPath = secureResolvePath(from, access);
      const toPath = secureResolvePath(to, access);
      await ensureDirectoryExists(toPath);
      return rename(fromPath, toPath);
    },
    rm: async (path, { access = 'public' } = {}) => {
      const p = secureResolvePath(path, access);
      return fsRm(p, { recursive: true, force: true });
    },
    cp: async (from, to, { access = 'public' } = {}) => {
      const fromPath = secureResolvePath(from, access);
      const toPath = secureResolvePath(to, access);
      await ensureDirectoryExists(toPath);
      const stats = await fsStat(fromPath);
      return copy(fromPath, toPath, { recursive: stats.isDirectory() });
    },
  };
}
