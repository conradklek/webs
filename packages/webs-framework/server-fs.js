import { join, resolve, dirname } from 'path';
import {
  cp as copy,
  mkdir as fsMkdir,
  readdir,
  rename,
  rm as fsRm,
  stat as fsStat,
} from 'node:fs/promises';

const USER_FILES_ROOT = resolve(process.cwd(), '.webs/files');

export function createFileSystemForUser(userId) {
  if (!userId) {
    throw new Error('A valid userId is required to create a file system.');
  }

  const userRootPath = join(USER_FILES_ROOT, String(userId));
  const publicPath = join(userRootPath, 'public');
  const privatePath = join(userRootPath, 'private');

  const ensureUserRootExists = async () => {
    try {
      await fsStat(userRootPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fsMkdir(publicPath, { recursive: true });
        await fsMkdir(privatePath, { recursive: true });
      } else {
        throw error;
      }
    }
  };

  const secureResolvePath = async (userPath = '.', access = 'public') => {
    await ensureUserRootExists();
    const basePath = access === 'private' ? privatePath : publicPath;
    const absolutePath = resolve(basePath, userPath);

    if (!absolutePath.startsWith(basePath)) {
      throw new Error(
        'Permission denied: Cannot access files outside your directory.',
      );
    }
    return absolutePath;
  };

  const ensureDirectoryExists = async (filePath) => {
    const dir = dirname(filePath);
    try {
      await fsStat(dir);
    } catch (e) {
      if (e.code === 'ENOENT') {
        await fsMkdir(dir, { recursive: true });
      } else {
        throw e;
      }
    }
  };

  return {
    exists: async (path, { access = 'public' } = {}) => {
      try {
        const resolvedPath = await secureResolvePath(path, access);
        return await Bun.file(resolvedPath).exists();
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        if (error.message.startsWith('Permission denied')) return false;
        throw error;
      }
    },
    stat: async (path, { access = 'public' } = {}) => {
      const resolvedPath = await secureResolvePath(path, access);
      const stats = await fsStat(resolvedPath);
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime,
        birthtime: stats.birthtime,
      };
    },
    cat: async (path, { access = 'public' } = {}) => {
      const resolvedPath = await secureResolvePath(path, access);
      const file = Bun.file(resolvedPath);
      if (!(await file.exists())) {
        throw new Error(`File not found at: ${path}`);
      }
      return file;
    },
    ls: async (path = '.', { access = 'public' } = {}) => {
      const resolvedPath = await secureResolvePath(path, access);
      try {
        return await readdir(resolvedPath);
      } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
      }
    },
    mkdir: async (path, { access = 'public' } = {}) => {
      const resolvedPath = await secureResolvePath(path, access);
      return await fsMkdir(resolvedPath, { recursive: true });
    },
    write: async (path, data, { access = 'public' } = {}) => {
      const resolvedPath = await secureResolvePath(path, access);
      await ensureDirectoryExists(resolvedPath);
      return await Bun.write(resolvedPath, data);
    },
    mv: async (from, to, { access = 'public' } = {}) => {
      const fromPath = await secureResolvePath(from, access);
      const toPath = await secureResolvePath(to, access);
      await ensureDirectoryExists(toPath);
      return await rename(fromPath, toPath);
    },
    rm: async (path, { access = 'public' } = {}) => {
      const resolvedPath = await secureResolvePath(path, access);
      return await fsRm(resolvedPath, { recursive: true, force: true });
    },
    cp: async (from, to, { access = 'public' } = {}) => {
      const fromPath = await secureResolvePath(from, access);
      const toPath = await secureResolvePath(to, access);
      await ensureDirectoryExists(toPath);
      const stats = await fsStat(fromPath);
      return await copy(fromPath, toPath, { recursive: stats.isDirectory() });
    },
  };
}
