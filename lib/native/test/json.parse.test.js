import { test, expect, describe } from 'bun:test';
import { symbols } from '../webs.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_query_json, webs_free_string } = lib.symbols;

function queryAndFree(json, path) {
  const jsonBuffer = Buffer.from(json + '\0');
  const pathBuffer = Buffer.from(path + '\0');

  const resultPtr = webs_query_json(jsonBuffer, pathBuffer);

  try {
    if (!resultPtr || resultPtr.ptr === 0) {
      return 'Error: C function returned null pointer.';
    }
    return new CString(resultPtr).toString();
  } finally {
    if (resultPtr) {
      webs_free_string(resultPtr);
    }
  }
}

describe('Webs C DOM Parser: Basic Queries', () => {
  const complexJson = `
    {
      "user": {
        "name": "John Doe",
        "isAdmin": true,
        "email": null,
        "logins": 127
      },
      "posts": [
        {"id": 1, "title": "First Post", "tags": ["c", "json"]},
        {"id": 2, "title": "Second Post", "tags": ["bun", "ffi"]}
      ],
      "matrix": [[1, 2], [3, 4]]
    }
  `;

  test('should extract a string value from an object', () => {
    expect(queryAndFree(complexJson, 'user.name')).toBe('John Doe');
  });

  test('should extract a number value', () => {
    expect(parseFloat(queryAndFree(complexJson, 'user.logins'))).toBe(127);
  });

  test('should extract a boolean value', () => {
    expect(queryAndFree(complexJson, 'user.isAdmin')).toBe('true');
  });

  test('should extract a null value', () => {
    expect(queryAndFree(complexJson, 'user.email')).toBe('null');
  });

  test('should extract a value from an array by index', () => {
    expect(queryAndFree(complexJson, 'posts[1].title')).toBe('Second Post');
  });

  test('should extract a value from a nested array', () => {
    expect(queryAndFree(complexJson, 'posts[0].tags[1]')).toBe('json');
  });

  test('should handle multi-dimensional arrays', () => {
    expect(queryAndFree(complexJson, 'matrix[1][0]')).toBe('3');
  });
});

describe('Webs C DOM Parser: Edge Cases and Errors', () => {
  test('should handle empty objects and arrays', () => {
    const json = `{"emptyObj": {}, "emptyArr": []}`;
    expect(queryAndFree(json, 'emptyObj')).toBe('[Object]');
    expect(queryAndFree(json, 'emptyArr')).toBe('[Array]');
  });

  test('should handle strings with escaped quotes', () => {
    const json = `{"quote": "He said \\"Hello, World!\\""}`;
    expect(queryAndFree(json, 'quote')).toBe('He said "Hello, World!"');
  });

  test('should return a parsing error for invalid JSON', () => {
    const json = `{"user": {"name": "John Doe"}`;
    expect(queryAndFree(json, 'user.name')).toContain('Error at line 1');
  });

  test('should return a parsing error for trailing commas', () => {
    const json = `{"a": 1,}`;
    expect(queryAndFree(json, 'a')).toContain('Trailing comma in object');
  });

  test('should return an error for extra content after top-level value', () => {
    const json = `{"a": 1} "hello"`;
    expect(queryAndFree(json, 'a')).toContain(
      'Extra content after top-level value',
    );
  });

  test('should return an error for a non-existent key path', () => {
    const json = `{"user": {"name": "John Doe"}}`;
    expect(queryAndFree(json, 'user.age')).toBe(
      'Error: Key not found in path.',
    );
  });

  test('should return an error for an out-of-bounds array index', () => {
    const json = `{"tags": ["dev"]}`;
    expect(queryAndFree(json, 'tags[5]')).toBe(
      'Error: Array index out of bounds.',
    );
  });

  test('should return an error for invalid array index format', () => {
    const json = `{"tags": ["dev"]}`;
    expect(queryAndFree(json, 'tags[abc]')).toBe(
      'Error: Invalid or unclosed array index.',
    );
  });

  test('should return an error for trying to index a non-array', () => {
    const json = `{"user": {"name": "John"}}`;
    expect(queryAndFree(json, 'user[0]')).toBe(
      'Error: Attempted to index an object with array syntax.',
    );
  });
});

describe('Webs C DOM Parser: Hash Table Resizing', () => {
  test('should handle a large number of keys, forcing a resize', () => {
    const keyCount = 100;
    let largeObj = {};
    for (let i = 0; i < keyCount; i++) {
      largeObj[`key${i}`] = i;
    }
    const json = JSON.stringify({ data: largeObj });

    expect(parseInt(queryAndFree(json, 'data.key0'), 10)).toBe(0);
    expect(parseInt(queryAndFree(json, 'data.key50'), 10)).toBe(50);
    expect(parseInt(queryAndFree(json, `data.key${keyCount - 1}`), 10)).toBe(
      keyCount - 1,
    );
  });
});
