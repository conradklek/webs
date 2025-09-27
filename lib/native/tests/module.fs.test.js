import { test, expect, describe, afterAll, beforeAll } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';
import { unlinkSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_read_file, webs_write_file, webs_free_string } = lib.symbols;
const TEST_FILE_PATH = resolve(import.meta.dir, './test-file.txt');

afterAll(() => {
  if (existsSync(TEST_FILE_PATH)) {
    unlinkSync(TEST_FILE_PATH);
  }
});

describe('Webs C Filesystem Operations', () => {
  test('should write content to a new file', () => {
    const content = 'Hello, Webs FS!';
    const pathBuffer = Buffer.from(TEST_FILE_PATH + '\0');
    const contentBuffer = Buffer.from(content + '\0');

    const errorPtr = webs_write_file(pathBuffer, contentBuffer);

    expect(errorPtr).toBe(null);
    expect(existsSync(TEST_FILE_PATH)).toBe(true);
  });

  test('should read content from an existing file', () => {
    const expectedContent = 'Hello, Webs FS!';
    const pathBuffer = Buffer.from(TEST_FILE_PATH + '\0');

    const resultPtr = webs_read_file(pathBuffer);
    let content = '';

    try {
      expect(resultPtr).toBeTruthy();
      content = new CString(resultPtr).toString();
    } finally {
      if (resultPtr) {
        webs_free_string(resultPtr);
      }
    }

    expect(content).toBe(expectedContent);
  });

  test('should overwrite an existing file', () => {
    const newContent = 'This file has been overwritten.';
    const pathBuffer = Buffer.from(TEST_FILE_PATH + '\0');
    const contentBuffer = Buffer.from(newContent + '\0');

    const writeErrorPtr = webs_write_file(pathBuffer, contentBuffer);
    expect(writeErrorPtr).toBe(null);

    const readResultPtr = webs_read_file(pathBuffer);
    let content = '';
    try {
      expect(readResultPtr).toBeTruthy();
      content = new CString(readResultPtr).toString();
    } finally {
      if (readResultPtr) {
        webs_free_string(readResultPtr);
      }
    }
    expect(content).toBe(newContent);
  });
});

const TEST_DIR_PATH = resolve(import.meta.dir, './test-dir');

describe('Webs C Directory Operations', () => {
  const { webs_dir, webs_delete_dir, webs_list_dir, webs_free_string } =
    lib.symbols;

  beforeAll(() => {
    if (existsSync(TEST_DIR_PATH)) {
      rmSync(TEST_DIR_PATH, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (existsSync(TEST_DIR_PATH)) {
      rmSync(TEST_DIR_PATH, { recursive: true, force: true });
    }
  });

  test('should create a new directory', () => {
    const pathBuffer = Buffer.from(TEST_DIR_PATH + '\0');
    const errorPtr = webs_dir(pathBuffer);

    expect(errorPtr).toBe(null);
    expect(existsSync(TEST_DIR_PATH)).toBe(true);
  });

  test('should list an empty directory, returning an empty JSON array', () => {
    const pathBuffer = Buffer.from(TEST_DIR_PATH + '\0');
    const resultPtr = webs_list_dir(pathBuffer);
    let content = '';
    try {
      expect(resultPtr).toBeTruthy();
      content = new CString(resultPtr).toString();
    } finally {
      if (resultPtr) {
        webs_free_string(resultPtr);
      }
    }
    expect(JSON.parse(content)).toEqual([]);
  });

  test('should list a directory with contents', () => {
    const file1 = resolve(TEST_DIR_PATH, 'file1.txt');
    const subdir = resolve(TEST_DIR_PATH, 'subdir');
    writeFileSync(file1, 'hello');
    mkdirSync(subdir);

    const pathBuffer = Buffer.from(TEST_DIR_PATH + '\0');
    const resultPtr = webs_list_dir(pathBuffer);
    let content = '';
    try {
      expect(resultPtr).toBeTruthy();
      content = new CString(resultPtr).toString();
    } finally {
      if (resultPtr) {
        webs_free_string(resultPtr);
      }
    }
    const listedFiles = JSON.parse(content);
    expect(listedFiles).toHaveLength(2);
    expect(listedFiles).toContain('file1.txt');
    expect(listedFiles).toContain('subdir');
  });

  test('should recursively delete a directory with contents', () => {
    const pathBuffer = Buffer.from(TEST_DIR_PATH + '\0');
    const errorPtr = webs_delete_dir(pathBuffer);

    expect(errorPtr).toBe(null);
    expect(existsSync(TEST_DIR_PATH)).toBe(false);
  });
});

describe('Webs C Advanced FS Operations (Stat, Rename)', () => {
  const { webs_rename_path, webs_stat_path, webs_free_string } = lib.symbols;
  const RENAME_DIR = resolve(import.meta.dir, './rename-test');

  beforeAll(() => {
    if (existsSync(RENAME_DIR)) {
      rmSync(RENAME_DIR, { recursive: true, force: true });
    }
    mkdirSync(RENAME_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(RENAME_DIR)) {
      rmSync(RENAME_DIR, { recursive: true, force: true });
    }
  });

  test('should get stats for a file', () => {
    const filePath = resolve(RENAME_DIR, 'stat_file.txt');
    const fileContent = '12345';
    writeFileSync(filePath, fileContent);

    const pathBuffer = Buffer.from(filePath + '\0');
    const resultPtr = webs_stat_path(pathBuffer);
    let stats = {};
    try {
      expect(resultPtr).toBeTruthy();
      const jsonString = new CString(resultPtr).toString();
      stats = JSON.parse(jsonString);
    } finally {
      if (resultPtr) {
        webs_free_string(resultPtr);
      }
    }

    expect(stats.size).toBe(fileContent.length);
    expect(stats.isFile).toBe(true);
    expect(stats.isDirectory).toBe(false);
  });

  test('should get stats for a directory', () => {
    const dirPath = resolve(RENAME_DIR, 'stat_dir');
    mkdirSync(dirPath);

    const pathBuffer = Buffer.from(dirPath + '\0');
    const resultPtr = webs_stat_path(pathBuffer);
    let stats = {};
    try {
      expect(resultPtr).toBeTruthy();
      const jsonString = new CString(resultPtr).toString();
      stats = JSON.parse(jsonString);
    } finally {
      if (resultPtr) {
        webs_free_string(resultPtr);
      }
    }

    expect(stats.isFile).toBe(false);
    expect(stats.isDirectory).toBe(true);
  });

  test('should rename a file', () => {
    const oldPath = resolve(RENAME_DIR, 'original-name.txt');
    const newPath = resolve(RENAME_DIR, 'new-name.txt');
    writeFileSync(oldPath, 'content');

    const oldPathBuffer = Buffer.from(oldPath + '\0');
    const newPathBuffer = Buffer.from(newPath + '\0');

    const errorPtr = webs_rename_path(oldPathBuffer, newPathBuffer);
    expect(errorPtr).toBe(null);

    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(newPath)).toBe(true);
  });

  test('should move a file into a subdirectory', () => {
    const subdir = resolve(RENAME_DIR, 'a-subdir');
    mkdirSync(subdir);
    const oldPath = resolve(RENAME_DIR, 'move-me.txt');
    const newPath = resolve(subdir, 'move-me.txt');
    writeFileSync(oldPath, 'content');

    const oldPathBuffer = Buffer.from(oldPath + '\0');
    const newPathBuffer = Buffer.from(newPath + '\0');

    const errorPtr = webs_rename_path(oldPathBuffer, newPathBuffer);
    expect(errorPtr).toBe(null);

    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(newPath)).toBe(true);
  });
});

const GLOB_TEST_DIR = resolve(import.meta.dir, './glob-test');

describe('Webs C FS Glob', () => {
  const { webs_glob, webs_free_string } = lib.symbols;

  beforeAll(() => {
    if (existsSync(GLOB_TEST_DIR)) {
      rmSync(GLOB_TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(GLOB_TEST_DIR, { recursive: true });
    writeFileSync(resolve(GLOB_TEST_DIR, 'a.js'), '');
    writeFileSync(resolve(GLOB_TEST_DIR, 'b.js'), '');
    writeFileSync(resolve(GLOB_TEST_DIR, 'c.txt'), '');
    mkdirSync(resolve(GLOB_TEST_DIR, 'subdir'));
    writeFileSync(resolve(GLOB_TEST_DIR, 'subdir', 'd.js'), '');
  });

  afterAll(() => {
    if (existsSync(GLOB_TEST_DIR)) {
      rmSync(GLOB_TEST_DIR, { recursive: true, force: true });
    }
  });

  function globAndFree(pattern) {
    const patternBuffer = Buffer.from(pattern + '\0');
    const resultPtr = webs_glob(patternBuffer);
    try {
      if (!resultPtr || resultPtr.ptr === 0) {
        return null;
      }
      const jsonString = new CString(resultPtr).toString();
      return JSON.parse(jsonString);
    } finally {
      if (resultPtr) {
        webs_free_string(resultPtr);
      }
    }
  }

  test('should find all js files in a directory', () => {
    const pattern = `${GLOB_TEST_DIR}/*.js`;
    const results = globAndFree(pattern).sort();
    expect(results).toEqual([
      resolve(GLOB_TEST_DIR, 'a.js'),
      resolve(GLOB_TEST_DIR, 'b.js'),
    ]);
  });

  test('should handle no matches', () => {
    const pattern = `${GLOB_TEST_DIR}/*.css`;
    const results = globAndFree(pattern);
    expect(results).toEqual([]);
  });
});
