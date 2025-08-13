import { file, Glob, write } from "bun";
import {
  cp,
  mkdir as fs_mkdir,
  readdir,
  rename,
  rm as fs_rm,
  stat as fs_stat,
} from "node:fs/promises";

export async function cat(path) {
  const file_ref = file(path);
  const file_exists = await file_ref.exists();
  if (!file_exists) {
    throw new Error("File not found");
  }
  return file_ref;
}

export async function copy(from, to, recursive = false) {
  if (!from || !to) {
    throw new Error("Missing 'from' or 'to' path");
  }
  try {
    const from_stats = await fs_stat(from);
    if (from_stats.isDirectory() && !recursive) {
      throw new Error("Source is a directory but 'recursive' flag is not set.");
    }
    await cp(from, to, { recursive });
  } catch (error) {
    console.error("Error in copy:", error);
    throw error;
  }
}

export async function exists(path) {
  try {
    await fs_stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function glob(pattern, cwd) {
  const globber = new Glob(pattern);
  const matches = [];
  for await (const file of globber.scan(cwd)) {
    matches.push(file);
  }
  return matches;
}

export async function ls(path, recursive = false, stats = false) {
  let dir = await readdir(path, { recursive });

  if (stats) {
    const sort = (data) => {
      return data.sort((a, b) => {
        const diff = a.is_file - b.is_file;
        if (diff === 0) {
          return a.path.localeCompare(b.path);
        }
        return diff;
      });
    };

    let files_with_stats = dir
      .map((name) => {
        if (
          name === "node_modules" ||
          name === "DS_Store" ||
          name.split("/").pop().startsWith(".") ||
          name === "bun.lock" ||
          name === "bunfig.toml" ||
          name === "package.json"
        ) {
          return null;
        }
        const ref = file(name);
        return {
          path: name,
          size: ref.size,
          type: ref.type,
          date: ref.lastModified,
        };
      })
      .filter(Boolean);

    let detailed_stats = await Promise.all(
      files_with_stats.map((i) => fs_stat(`${path}/${i.path}`)),
    );

    detailed_stats = detailed_stats.map((i) => ({
      is_file: i.isFile(),
      is_directory: i.isDirectory(),
    }));

    dir = sort(
      files_with_stats.map((item, index) => ({
        ...item,
        ...detailed_stats[index],
        path: `${path}/${item.path}`,
      })),
    );
  }
  return dir;
}

export async function mkdir(path, recursive = false) {
  return await fs_mkdir(path, { recursive });
}

export async function mv(from, to) {
  if (!from || !to) {
    throw new Error("Missing 'from' or 'to' path");
  }
  try {
    await rename(from, to);
  } catch (error) {
    console.error("Error in mv:", error);
    throw error;
  }
}

export async function rm(path, recursive = false) {
  if (!path) {
    throw new Error("Missing 'path'");
  }
  try {
    await fs_rm(path, { recursive, force: true });
  } catch (error) {
    console.error("Error in rm:", error);
    throw error;
  }
}

export async function stat(path) {
  if (!path) {
    throw new Error("Missing 'path'");
  }
  try {
    const stats = await fs_stat(path);
    return {
      is_file: stats.isFile(),
      is_directory: stats.isDirectory(),
      is_symbolic_link: stats.isSymbolicLink(),
      size: stats.size,
      mtime: stats.mtime,
      atime: stats.atime,
      ctime: stats.ctime,
      birthtime: stats.birthtime,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Path not found: ${error.path}`);
    }
    console.error("Error in stat:", error);
    throw error;
  }
}

export async function touch(path, data = "") {
  await write(path, data);
}
