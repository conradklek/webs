import {
  cp as copy,
  mkdir as fs_mkdir,
  readdir,
  rename,
  rm as fs_rm,
  stat as fs_stat,
} from "node:fs/promises";

/**
 * Checks if a path exists.
 * @param {string} path - The path to check.
 * @returns {Promise<boolean>} True if the path exists, false otherwise.
 */
async function exists(path) {
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

/**
 * Reads the content of a file. Equivalent to the 'cat' command.
 * @param {string} path - The path to the file.
 * @returns {Promise<File>} A Bun File object.
 * @throws Will throw an error if the file is not found.
 */
async function cat(path) {
  const file_exists = await exists(path);
  if (!file_exists) {
    throw new Error("File not found");
  }
  return Bun.file(path);
}

/**
 * Copies a file or directory.
 * @param {string} from - The source path.
 * @param {string} to - The destination path.
 * @param {boolean} [recursive=false] - If true, copies directories recursively.
 * @throws Will throw an error if 'from' is a directory and 'recursive' is false.
 */
async function cp(from, to, recursive = false) {
  if (!from || !to) {
    throw new Error("Missing 'from' or 'to' path");
  }
  const from_stats = await fs_stat(from);
  if (from_stats.isDirectory() && !recursive) {
    throw new Error("Source is a directory but 'recursive' flag is not set.");
  }
  await copy(from, to, { recursive });
}

/**
 * Finds files matching a glob pattern.
 * @param {string} pattern - The glob pattern to match.
 * @param {string} cwd - The current working directory to scan from.
 * @returns {Promise<string[]>} An array of matching file paths.
 */
async function glob(pattern, cwd) {
  const globber = new Bun.Glob(pattern);
  const matches = [];
  for await (const file of globber.scan(cwd)) {
    matches.push(file);
  }
  return matches;
}

/**
 * Lists the contents of a directory. Equivalent to 'ls'.
 * @param {string} path - The path to the directory.
 * @param {boolean} [recursive=false] - If true, lists contents recursively.
 * @param {boolean} [stats=false] - If true, returns detailed stats for each item.
 * @returns {Promise<Array<string|object>>} An array of file/directory names or stat objects.
 */
async function ls(path, recursive = false, stats = false) {
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
        const ref = Bun.file(name);
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

/**
 * Creates a new directory.
 * @param {string} path - The path of the directory to create.
 * @param {boolean} [recursive=false] - If true, creates parent directories as needed.
 * @returns {Promise<string|undefined>} The path of the first directory created if recursive.
 */
async function mkdir(path, recursive = false) {
  return await fs_mkdir(path, { recursive });
}

/**
 * Moves or renames a file or directory. Equivalent to 'mv'.
 * @param {string} from - The source path.
 * @param {string} to - The destination path.
 */
async function mv(from, to) {
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

/**
 * Removes a file or directory. Equivalent to 'rm'.
 * @param {string} path - The path to remove.
 * @param {boolean} [recursive=false] - If true, removes directories recursively.
 */
async function rm(path, recursive = false) {
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

/**
 * Gets file system stats for a path.
 * @param {string} path - The path to get stats for.
 * @returns {Promise<object>} A stats object.
 */
async function stat(path) {
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

/**
 * Creates a file at a given path, optionally with content. Equivalent to 'touch'.
 * @param {string} path - The path of the file to create.
 * @param {string|Blob|ArrayBuffer} [data=""] - The content to write to the file.
 */
async function touch(path, data = "") {
  await Bun.write(path, data);
}

export const fs = {
  touch,
  stat,
  rm,
  mkdir,
  mv,
  ls,
  glob,
  cp,
  cat,
};
