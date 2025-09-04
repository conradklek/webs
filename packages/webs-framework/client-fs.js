import { state } from './webs-engine';
import { onUnmounted } from './webs-renderer';
import { db, syncEngine, performTransaction } from './client-db';
import { session } from './client-me';

const coreFS = {
  readFile: (path) =>
    db('files')
      .get(path)
      .then((file) => (file ? file.content : null)),
  listDirectory: (path) =>
    db('files')
      .getAllWithPrefix(path)
      .then((files) =>
        files.map((file) => ({
          name: file.path.substring(path.length),
          ...file,
        })),
      ),

  async createOperation(payload) {
    if (!session.isLoggedIn) throw new Error('User not logged in.');
    const op = { ...payload, opId: crypto.randomUUID() };

    // This is the corrected part: Use the imported 'performTransaction'
    // to correctly handle a transaction across both 'files' and 'outbox'.
    await performTransaction(['files', 'outbox'], 'readwrite', (tx) => {
      const filesStore = tx.objectStore('files');
      const outboxStore = tx.objectStore('outbox');

      if (op.type === 'fs:write') {
        filesStore.put({
          path: op.path,
          content: op.data,
          user_id: session.user.id,
          access: op.options.access || 'private',
          size: op.data?.length || 0,
          last_modified: new Date().toISOString(),
        });
      } else if (op.type === 'fs:rm') {
        filesStore.delete(op.path);
      }
      outboxStore.put(op);
    });

    syncEngine.process();
  },
};

/**
 * Creates a file system API object for a specific path.
 * @param {string} path - The path to the file or directory.
 * @returns {object} An object with chainable methods to interact with the path.
 */
export function fs(path) {
  if (!path) throw new Error('fs() requires a path.');
  const isDirectory = path.endsWith('/');

  const methods = {
    read: () => {
      if (isDirectory) throw new Error('Cannot call .read() on a directory.');
      return coreFS.readFile(path);
    },
    ls: () => {
      if (!isDirectory)
        throw new Error(
          'Can only call .ls() on a directory path (ending with "/").',
        );
      return coreFS.listDirectory(path);
    },
    write: (content, options = { access: 'private' }) => {
      if (isDirectory) throw new Error('Cannot call .write() on a directory.');
      return coreFS.createOperation({
        type: 'fs:write',
        path,
        data: content,
        options,
      });
    },
    rm: (options = { access: 'private' }) => {
      return coreFS.createOperation({ type: 'fs:rm', path, options });
    },
    use(initialData = null) {
      const s = state({
        data: initialData,
        isLoading: initialData === null,
        error: null,
      });

      const fetchData = async () => {
        try {
          s.isLoading = true;
          s.error = null;
          s.data = isDirectory
            ? await coreFS.listDirectory(path)
            : await coreFS.readFile(path);
        } catch (e) {
          s.error = e.message;
        } finally {
          s.isLoading = false;
        }
      };

      const unsubscribe = db('files').subscribe(fetchData);
      onUnmounted(unsubscribe);

      if (initialData === null && typeof window !== 'undefined') fetchData();

      s.hydrate = async (serverData) => {
        if (serverData !== null && serverData !== undefined) {
          const records = isDirectory
            ? serverData
            : [{ path, content: serverData }];
          if (records.length > 0) await db('files').bulkPut(records);
        }
        await fetchData();
      };
      s.write = this.write;
      s.rm = this.rm;

      return s;
    },
  };

  methods.write = methods.write.bind(methods);
  methods.rm = methods.rm.bind(methods);
  methods.use = methods.use.bind(methods);

  return methods;
}
