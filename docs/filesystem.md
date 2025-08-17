# Filesystem API

Webs provides a convenient, promise-based filesystem API for use within **Server Actions**. This allows your server-side logic to safely interact with the server's file system.

The API is exposed as the `fs` object in the context of a Server Action.

```javascript
// Example Server Action
export default {
  name: "MyComponent",
  actions: {
    async read_a_file(context) {
      const { fs } = context;
      const file_content = await fs.cat("./some-file.txt").text();
      return file_content;
    },
  },
};
```

---

## API Reference

The `fs` object provides a set of familiar, command-line inspired methods.

### `fs.cat(path)`

Reads the content of a file.

- **`path`**: `string` - The path to the file.
- **Returns**: `Promise<File>` - A Bun File object. You can then use `.text()`, `.json()`, etc. to get the content.

### `fs.ls(path, recursive?, stats?)`

Lists the contents of a directory.

- **`path`**: `string` - The path to the directory.
- **`recursive`**: `boolean` (optional, default: `false`) - If true, lists contents recursively.
- **`stats`**: `boolean` (optional, default: `false`) - If true, returns detailed stats for each item.
- **Returns**: `Promise<Array<string|object>>` - An array of file/directory names or stat objects.

### `fs.mkdir(path, recursive?)`

Creates a new directory.

- **`path`**: `string` - The path of the directory to create.
- **`recursive`**: `boolean` (optional, default: `false`) - If true, creates parent directories as needed.
- **Returns**: `Promise<string|undefined>`

### `fs.touch(path, data?)`

Creates a file, optionally with content. If the file exists, it will be overwritten.

- **`path`**: `string` - The path of the file to create.
- **`data`**: `string | Blob | ArrayBuffer` (optional, default: `""`) - The content to write.
- **Returns**: `Promise<void>`

### `fs.rm(path, recursive?)`

Removes a file or directory.

- **`path`**: `string` - The path to remove.
- **`recursive`**: `boolean` (optional, default: `false`) - Required to remove non-empty directories.
- **Returns**: `Promise<void>`

### `fs.cp(from, to, recursive?)`

Copies a file or directory.

- **`from`**: `string` - The source path.
- **`to`**: `string` - The destination path.
- **`recursive`**: `boolean` (optional, default: `false`) - Required to copy a directory.
- **Returns**: `Promise<void>`

### `fs.mv(from, to)`

Moves or renames a file or directory.

- **`from`**: `string` - The source path.
- **`to`**: `string` - The destination path.
- **Returns**: `Promise<void>`

### `fs.stat(path)`

Gets file system stats for a path.

- **`path`**: `string` - The path to get stats for.
- **Returns**: `Promise<object>` - A stats object containing information like `is_file`, `is_directory`, `size`, etc.

### `fs.glob(pattern, cwd)`

Finds files matching a glob pattern.

- **`pattern`**: `string` - The glob pattern (e.g., `**/*.js`).
- **`cwd`**: `string` - The directory to scan from.
- **Returns**: `Promise<string[]>` - An array of matching file paths.
