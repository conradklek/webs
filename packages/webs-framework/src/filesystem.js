import {
  cp as copy,
  mkdir as fsMkdir,
  readdir,
  rename,
  rm as fsRm,
  stat as fsStat,
} from 'node:fs/promises';

async function exists(path) {
  try {
    await fsStat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function cat(path) {
  if (!(await exists(path))) throw new Error('File not found');
  return Bun.file(path);
}

export const fs = {
  touch: async (path, data = '') => await Bun.write(path, data),
  stat: async (path) => {
    if (!path) throw new Error("Missing 'path'");
    const stats = await fsStat(path);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
      birthtime: stats.birthtime,
    };
  },
  rm: async (path, recursive = false) =>
    await fsRm(path, { recursive, force: true }),
  mkdir: async (path, recursive = false) => await fsMkdir(path, { recursive }),
  mv: async (from, to) => await rename(from, to),
  ls: async (path) => await readdir(path),
  glob: async (pattern, cwd = '.') => {
    const globber = new Bun.Glob(pattern);
    return await Array.fromAsync(globber.scan(cwd));
  },
  cp: async (from, to, recursive = false) =>
    await copy(from, to, { recursive }),
  cat,
  exists,
};
