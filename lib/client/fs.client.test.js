import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { fs } from './fs.client.js';

const mockDbInstance = {
  get: mock(),
  getAllWithPrefix: mock(),
};

mock.module('./db.client.js', () => ({
  db: mock(() => mockDbInstance),
  performTransaction: mock(),
  notify: mock(() => {}),
}));

let mockSession = {
  isLoggedIn: false,
  user: null,
};

mock.module('./session.js', () => ({
  session: mockSession,
}));

let onMountedCallback;

mock.module('../core/lifecycle.js', () => ({
  onMounted: mock((fn) => {
    onMountedCallback = fn;
  }),
  onUnmounted: mock(() => {}),
}));

mock.module('../core/reactivity.js', () => ({
  state: mock((initial) => ({ ...initial })),
  effect: mock(() => {}),
}));

describe('Client File System API', () => {
  beforeEach(() => {
    global.window = {};
    onMountedCallback = null;

    mockSession.isLoggedIn = false;
    mockSession.user = null;
    mockDbInstance.get.mockClear();
    mockDbInstance.getAllWithPrefix.mockClear();
  });

  afterEach(() => {
    delete global.window;
    mock.restore();
  });

  describe('Core Operations', () => {
    test('ls should correctly process and return directory entries', async () => {
      const mockFiles = [
        { path: 'docs/guide.txt' },
        { path: 'image.png' },
        { path: 'docs/tutorial.txt' },
        { path: 'archive/old.zip' },
      ];
      mockDbInstance.getAllWithPrefix.mockResolvedValue(mockFiles);

      const rootFs = fs('/');
      const entries = await rootFs.ls();

      expect(mockDbInstance.getAllWithPrefix).toHaveBeenCalledWith('');
      expect(entries).toEqual([
        { name: 'archive', isDirectory: true, path: 'archive' },
        { name: 'docs', isDirectory: true, path: 'docs' },
        { name: 'image.png', isDirectory: false, path: 'image.png' },
      ]);
    });

    test('write should create a "fs:write" operation and process the sync queue', async () => {
      mockSession.isLoggedIn = true;
      mockSession.user = { id: 1, name: 'testuser' };

      const fileFs = fs('new-file.txt');
      await fileFs.write('hello world', { access: 'private' });

      const performTransactionMock = (await import('./db.client.js'))
        .performTransaction;
      expect(performTransactionMock).toHaveBeenCalledWith(
        ['files', 'outbox'],
        'readwrite',
        expect.any(Function),
      );
    });

    test('rm should create an "fs:rm" operation', async () => {
      mockSession.isLoggedIn = true;
      mockSession.user = { id: 1, name: 'testuser' };

      const fileFs = fs('file-to-delete.txt');
      await fileFs.rm({ access: 'public' });

      const performTransactionMock = (await import('./db.client.js'))
        .performTransaction;
      expect(performTransactionMock).toHaveBeenCalled();
    });

    test('read should get file content from the database', async () => {
      mockDbInstance.get.mockResolvedValue({ content: 'file content' });

      const fileFs = fs('my-file.txt');
      const content = await fileFs.read();

      expect(mockDbInstance.get).toHaveBeenCalledWith('my-file.txt');
      expect(content).toBe('file content');
    });
  });
});
