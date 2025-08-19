import {
  cp as copy,
  mkdir as fs_mkdir,
  readdir,
  rename,
  rm as fs_rm,
  stat as fs_stat,
} from "node:fs/promises";

async function exists(path) {
  try {
    await fs_stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function cat(path) {
  if (!(await exists(path))) throw new Error("File not found");
  return Bun.file(path);
}

export const fs = {
  touch: async (path, data = "") => await Bun.write(path, data),
  stat: async (path) => {
    if (!path) throw new Error("Missing 'path'");
    const stats = await fs_stat(path);
    return {
      is_file: stats.isFile(),
      is_directory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
      birthtime: stats.birthtime,
    };
  },
  rm: async (path, recursive = false) =>
    await fs_rm(path, { recursive, force: true }),
  mkdir: async (path, recursive = false) => await fs_mkdir(path, { recursive }),
  mv: async (from, to) => await rename(from, to),
  ls: async (path) => await readdir(path),
  glob: async (pattern, cwd = ".") => {
    const globber = new Bun.Glob(pattern);
    return await Array.fromAsync(globber.scan(cwd));
  },
  cp: async (from, to, recursive = false) =>
    await copy(from, to, { recursive }),
  cat,
  exists,
};
