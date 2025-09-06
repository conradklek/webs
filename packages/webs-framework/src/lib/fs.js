import { join, resolve, dirname } from 'path';
import {
  cp as copy,
  mkdir as fsMkdir,
  rename,
  rm as fsRm,
  stat as fsStat,
} from 'node:fs/promises';

const USER_FILES_ROOT = resolve(process.cwd(), '.webs/files');

export function createFileSystemForUser(userId, db) {
  if (!userId) throw new Error('A valid userId is required.');
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
      throw new Error('Permission denied.');
    }
    return absolutePath;
  };

  const ensureDirectoryExists = async (filePath) => {
    const dir = dirname(filePath);
    try {
      await fsStat(dir);
    } catch (e) {
      if (e.code === 'ENOENT') await fsMkdir(dir, { recursive: true });
      else throw e;
    }
  };

  return {
    getPrivateRootPath: () => privatePath,

    exists: async (path, { access = 'public' } = {}) => {
      try {
        return await Bun.file(await secureResolvePath(path, access)).exists();
      } catch (error) {
        if (
          error.code === 'ENOENT' ||
          error.message.startsWith('Permission denied')
        )
          return false;
        throw error;
      }
    },
    stat: async (path, { access = 'public' } = {}) => {
      const stats = await fsStat(await secureResolvePath(path, access));
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
      if (!(await file.exists())) throw new Error(`File not found at: ${path}`);
      return file;
    },
    ls: async (path = '.', { access = 'public' } = {}) => {
      if (!db) {
        throw new Error(
          'Database instance is required for the ls operation on the server.',
        );
      }
      try {
        const normalizedPath = path === '.' || path === '' ? '' : path;
        const prefix = normalizedPath ? `${normalizedPath}/` : '';

        const query = 'SELECT path FROM files WHERE user_id = ? AND access = ?';
        const allUserPaths = db
          .query(query)
          .all(userId, access)
          .map((row) => row.path);

        const directChildren = new Map();

        for (const fullPath of allUserPaths) {
          if (prefix && !fullPath.startsWith(prefix)) {
            continue;
          }

          const relativePath = fullPath.substring(prefix.length);
          const segments = relativePath.split('/');
          const childName = segments[0];

          if (!childName || directChildren.has(childName)) continue;

          const isDirectory = segments.length > 1;
          directChildren.set(childName, {
            name: childName,
            isDirectory,
            path: isDirectory ? `${prefix}${childName}` : fullPath,
          });
        }
        return Array.from(directChildren.values());
      } catch (e) {
        console.error('Error in server fs.ls:', e);
        return [];
      }
    },
    mkdir: (path, { access = 'public' } = {}) =>
      secureResolvePath(path, access).then((p) =>
        fsMkdir(p, { recursive: true }),
      ),

    write: async (path, data, { access = 'public' } = {}) => {
      const resolvedPath = await secureResolvePath(path, access);
      await ensureDirectoryExists(resolvedPath);

      if (data instanceof ReadableStream) {
        const writer = Bun.file(resolvedPath).writer();
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
        return Bun.write(resolvedPath, data);
      }
    },

    mv: async (from, to, { access = 'public' } = {}) => {
      const fromPath = await secureResolvePath(from, access);
      const toPath = await secureResolvePath(to, access);
      await ensureDirectoryExists(toPath);
      return rename(fromPath, toPath);
    },
    rm: (path, { access = 'public' } = {}) =>
      secureResolvePath(path, access).then((p) =>
        fsRm(p, { recursive: true, force: true }),
      ),
    cp: async (from, to, { access = 'public' } = {}) => {
      const fromPath = await secureResolvePath(from, access);
      const toPath = await secureResolvePath(to, access);
      await ensureDirectoryExists(toPath);
      const stats = await fsStat(fromPath);
      return copy(fromPath, toPath, { recursive: stats.isDirectory() });
    },
  };
}
