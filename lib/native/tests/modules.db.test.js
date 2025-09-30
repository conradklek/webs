import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';
import { unlinkSync, existsSync } from 'fs';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_db_open,
  webs_db_close,
  webs_db_exec,
  webs_db_query,
  webs_json_encode,
  webs_free_value,
  webs_free_string,
} = lib.symbols;

const TEST_DB_PATH = resolve(import.meta.dir, './test.db');

function cValueToJs(valuePtr) {
  if (!valuePtr || valuePtr.ptr === 0) {
    return undefined;
  }
  try {
    const jsonPtr = webs_json_encode(valuePtr);
    if (!jsonPtr || jsonPtr.ptr === 0) {
      return undefined;
    }
    try {
      const jsonString = new CString(jsonPtr).toString();
      return JSON.parse(jsonString);
    } finally {
      webs_free_string(jsonPtr);
    }
  } finally {
    webs_free_value(valuePtr);
  }
}

describe('Webs C SQLite Module', () => {
  let db_handle = null;

  beforeAll(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    const dbPathBuffer = Buffer.from(TEST_DB_PATH + '\0');
    db_handle = webs_db_open(dbPathBuffer);
    expect(db_handle).not.toBe(null);
  });

  afterAll(() => {
    if (db_handle) {
      const result = cValueToJs(webs_db_close(db_handle));
      expect(result).toBe(true);
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test('should execute a CREATE TABLE statement', () => {
    const sql = Buffer.from(
      'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);\0',
    );
    const result = cValueToJs(webs_db_exec(db_handle, sql));
    expect(result).toBe(true);
  });

  test('should execute an INSERT statement', () => {
    const sql = Buffer.from("INSERT INTO users (name) VALUES ('Alice');\0");
    const result = cValueToJs(webs_db_exec(db_handle, sql));
    expect(result).toBe(true);
  });

  test('should query data with SELECT', () => {
    const insertSql = Buffer.from("INSERT INTO users (name) VALUES ('Bob');\0");
    cValueToJs(webs_db_exec(db_handle, insertSql));

    const selectSql = Buffer.from('SELECT id, name FROM users;\0');
    const result = cValueToJs(webs_db_query(db_handle, selectSql));

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ id: 1, name: 'Alice' });
    expect(result[1]).toEqual({ id: 2, name: 'Bob' });
  });

  test('should return an error for invalid SQL in exec', () => {
    const sql = Buffer.from(
      'CREATE TABL users (id INTEGER PRIMARY KEY, name TEXT);\0',
    );
    const result = cValueToJs(webs_db_exec(db_handle, sql));
    expect(typeof result).toBe('string');
    expect(result).toInclude('syntax error');
  });

  test('should return an error for invalid SQL in query', () => {
    const sql = Buffer.from('SELEC * FROM users;\0');
    const result = cValueToJs(webs_db_query(db_handle, sql));
    expect(typeof result).toBe('string');
    expect(result).toInclude('syntax error');
  });

  test('should handle opening an in-memory database', () => {
    const memDbPath = Buffer.from(':memory:\0');
    const mem_db_handle = webs_db_open(memDbPath);
    expect(mem_db_handle).not.toBe(null);

    const createSql = Buffer.from('CREATE TABLE test (val TEXT);\0');
    expect(cValueToJs(webs_db_exec(mem_db_handle, createSql))).toBe(true);

    const result = cValueToJs(webs_db_close(mem_db_handle));
    expect(result).toBe(true);
  });

  test('should handle an empty query result', () => {
    const selectSql = Buffer.from(
      "SELECT * FROM users WHERE name = 'Charlie';\0",
    );
    const result = cValueToJs(webs_db_query(db_handle, selectSql));
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(0);
  });

  test('should handle various data types', () => {
    const createSql = Buffer.from(
      'CREATE TABLE datatypes (i INTEGER, f REAL, t TEXT, n TEXT);\0',
    );
    cValueToJs(webs_db_exec(db_handle, createSql));

    const insertSql = Buffer.from(
      "INSERT INTO datatypes (i, f, t, n) VALUES (123, 45.67, 'test string', NULL);\0",
    );
    cValueToJs(webs_db_exec(db_handle, insertSql));

    const selectSql = Buffer.from('SELECT * FROM datatypes;\0');
    const result = cValueToJs(webs_db_query(db_handle, selectSql));

    expect(result).toEqual([{ i: 123, f: 45.67, t: 'test string', n: null }]);
  });

  test('should fail gracefully when operating on a closed handle', () => {
    const memDbPath = Buffer.from(':memory:\0');
    const mem_db_handle = webs_db_open(memDbPath);
    expect(mem_db_handle).not.toBe(null);

    const closeResult = cValueToJs(webs_db_close(mem_db_handle));
    expect(closeResult).toBe(true);

    const sql = Buffer.from('CREATE TABLE test (val TEXT);\0');
    const execResult = cValueToJs(webs_db_exec(mem_db_handle, sql));
    expect(typeof execResult).toBe('string');
    expect(execResult).toInclude('Invalid database handle');
  });

  test('should support basic transactions', () => {
    cValueToJs(
      webs_db_exec(
        db_handle,
        Buffer.from('CREATE TABLE accounts (name TEXT, balance REAL);\0'),
      ),
    );
    cValueToJs(
      webs_db_exec(
        db_handle,
        Buffer.from(
          "INSERT INTO accounts VALUES ('Alice', 100), ('Bob', 50);\0",
        ),
      ),
    );

    cValueToJs(webs_db_exec(db_handle, Buffer.from('BEGIN TRANSACTION;\0')));
    cValueToJs(
      webs_db_exec(
        db_handle,
        Buffer.from("UPDATE accounts SET balance = 75 WHERE name = 'Alice';\0"),
      ),
    );
    cValueToJs(
      webs_db_exec(
        db_handle,
        Buffer.from("UPDATE accounts SET balance = 75 WHERE name = 'Bob';\0"),
      ),
    );
    cValueToJs(webs_db_exec(db_handle, Buffer.from('ROLLBACK;\0')));

    const resultAfterRollback = cValueToJs(
      webs_db_query(db_handle, Buffer.from('SELECT * FROM accounts;\0')),
    );
    expect(resultAfterRollback).toEqual([
      { name: 'Alice', balance: 100 },
      { name: 'Bob', balance: 50 },
    ]);
  });
});
