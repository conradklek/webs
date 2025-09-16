import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { resolve } from 'path';

const mockFsPromises = {
  stat: mock(),
  mkdir: mock(),
  rm: mock(),
  rename: mock(),
  cp: mock(),
  readdir: mock(),
  writeFile: mock(),
};
mock.module('node:fs/promises', () => mockFsPromises);

const mockBunFileInstance = {
  exists: mock(),
  text: mock(),
  arrayBuffer: mock(),
};
const mockBunWrite = mock();
mock.module('bun', () => ({
  ...require('bun'),
  file: mock(() => mockBunFileInstance),
  write: mockBunWrite,
}));

import { createFileSystemForUser } from './fs.server.js';

describe('Server File System API', () => {
  let fs;
  const userId = 1;
  const USER_FILES_ROOT = resolve(process.cwd(), '.webs/files');
  const userRoot = `${USER_FILES_ROOT}/${userId}`;

  beforeEach(() => {
    Object.values(mockFsPromises).forEach((m) => m.mockReset());
    Object.values(mockBunFileInstance).forEach((m) => m.mockReset());
    mockBunWrite.mockReset();

    mockFsPromises.mkdir.mockResolvedValue(undefined);
    mockFsPromises.rm.mockResolvedValue(undefined);
    mockFsPromises.readdir.mockResolvedValue([]);
    mockFsPromises.writeFile.mockResolvedValue(undefined);
    mockBunWrite.mockResolvedValue(0);
    mockBunFileInstance.exists.mockResolvedValue(false);

    fs = createFileSystemForUser(userId);
  });

  afterEach(() => {
    mock.restore();
  });

  test('should throw an error if userId is not provided', () => {
    expect(() => createFileSystemForUser(null)).toThrow(
      'A valid userId is required.',
    );
  });

  test('mkdir should create a directory inside the user sandbox', async () => {
    await fs.mkdir('new-folder');
    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      `${userRoot}/public/new-folder`,
      { recursive: true },
    );

    await fs.mkdir('private-folder', { access: 'private' });
    expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
      `${userRoot}/private/private-folder`,
      { recursive: true },
    );
  });

  test('rm should remove a file/directory inside the user sandbox', async () => {
    await fs.rm('to-delete');
    const expectedPath = `${userRoot}/public/to-delete`;
    expect(mockFsPromises.rm).toHaveBeenCalledWith(expectedPath, {
      recursive: true,
      force: true,
    });
  });

  test('ls should read from the filesystem and return sorted entries', async () => {
    const dirPath = 'documents';
    const expectedPath = `${userRoot}/public/${dirPath}`;
    const mockDirentDir = { name: 'subdir', isDirectory: () => true };
    const mockDirentFile = { name: 'a-file.txt', isDirectory: () => false };
    mockFsPromises.stat.mockResolvedValue({ isDirectory: () => true });
    mockFsPromises.readdir.mockResolvedValue([mockDirentDir, mockDirentFile]);

    const result = await fs.ls(dirPath);

    expect(mockFsPromises.stat).toHaveBeenCalledWith(expectedPath);
    expect(mockFsPromises.readdir).toHaveBeenCalledWith(expectedPath, {
      withFileTypes: true,
    });
    expect(result).toEqual([
      { name: 'a-file.txt', isDirectory: false, path: 'documents/a-file.txt' },
      { name: 'subdir', isDirectory: true, path: 'documents/subdir' },
    ]);
  });

  test('ls should return an empty array for a non-existent directory', async () => {
    const enoentError = new Error('ENOENT');
    enoentError.code = 'ENOENT';
    mockFsPromises.stat.mockRejectedValue(enoentError);
    const result = await fs.ls('non-existent-dir');
    expect(result).toEqual([]);
    expect(mockFsPromises.readdir).not.toHaveBeenCalled();
  });
});
