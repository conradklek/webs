import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_query_json,
  webs_json_parse,
  webs_json_encode,
  webs_free_value,
  webs_free_string,
} = lib.symbols;

function roundtrip(jsonString) {
  const jsonBuffer = Buffer.from(jsonString + '\0');
  const statusPtr = Buffer.alloc(4);

  const valuePtr = webs_json_parse(jsonBuffer, statusPtr);
  const status = statusPtr.readInt32LE(0);

  if (status !== 0 || !valuePtr || valuePtr.ptr === 0) {
    return `Error: C function returned null pointer on parse. Status: ${status}`;
  }

  try {
    const resultPtr = webs_json_encode(valuePtr);
    if (!resultPtr || resultPtr.ptr === 0) {
      return 'Error: C function returned null pointer on encode.';
    }

    try {
      return new CString(resultPtr).toString();
    } finally {
      webs_free_string(resultPtr);
    }
  } finally {
    webs_free_value(valuePtr);
  }
}

describe('Webs C JSON Serializer', () => {
  test('should correctly serialize a complex object', () => {
    const complexJson = {
      user: {
        name: 'Jane Doe',
        isAdmin: false,
        email: null,
        logins: 99,
        'special\\key': 'value with "quotes"',
      },
      posts: [
        { id: 1, title: 'First Post', tags: ['c', 'json'] },
        { id: 2, title: 'Second Post', tags: ['bun', 'ffi'] },
      ],
      matrix: [
        [1, 2],
        [3, 4],
      ],
    };
    const jsonString = JSON.stringify(complexJson);
    const resultString = roundtrip(jsonString);

    expect(JSON.parse(resultString)).toEqual(complexJson);
  });

  test('should handle empty objects and arrays', () => {
    const json = { emptyObj: {}, emptyArr: [] };
    const jsonString = JSON.stringify(json);
    const resultString = roundtrip(jsonString);
    expect(JSON.parse(resultString)).toEqual(json);
  });

  test('should handle top-level arrays', () => {
    const json = [1, 'two', true, null, { a: 3.14 }];
    const jsonString = JSON.stringify(json);
    const resultString = roundtrip(jsonString);
    expect(JSON.parse(resultString)).toEqual(json);
  });

  test('should correctly handle string escaping', () => {
    const json = {
      quote: '"',
      backslash: '\\',
      newline: '\n',
      tab: '\t',
    };
    const jsonString = JSON.stringify(json);
    const resultString = roundtrip(jsonString);
    expect(JSON.parse(resultString)).toEqual(json);
  });

  test('should handle various number formats', () => {
    const json = { integer: 42, float: 3.14159, negative: -100, zero: 0 };
    const jsonString = JSON.stringify(json);
    const resultString = roundtrip(jsonString);
    expect(JSON.parse(resultString)).toEqual(json);
  });

  test('should handle parse error gracefully', () => {
    const invalidJson = '{"key": "value",';
    const result = roundtrip(invalidJson);
    expect(result).toContain(
      'Error: C function returned null pointer on parse',
    );
  });
});

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
    const result = queryAndFree(complexJson, 'user.name');
    expect(JSON.parse(result)).toBe('John Doe');
  });

  test('should extract a number value', () => {
    const result = queryAndFree(complexJson, 'user.logins');
    expect(JSON.parse(result)).toBe(127);
  });

  test('should extract a boolean value', () => {
    const result = queryAndFree(complexJson, 'user.isAdmin');
    expect(JSON.parse(result)).toBe(true);
  });

  test('should extract a null value', () => {
    const result = queryAndFree(complexJson, 'user.email');
    expect(JSON.parse(result)).toBe(null);
  });

  test('should extract a value from an array by index', () => {
    const result = queryAndFree(complexJson, 'posts[1].title');
    expect(JSON.parse(result)).toBe('Second Post');
  });

  test('should extract a value from a nested array', () => {
    const result = queryAndFree(complexJson, 'posts[0].tags[1]');
    expect(JSON.parse(result)).toBe('json');
  });

  test('should handle multi-dimensional arrays', () => {
    const result = queryAndFree(complexJson, 'matrix[1][0]');
    expect(JSON.parse(result)).toBe(3);
  });
});

describe('Webs C DOM Parser: Edge Cases and Errors', () => {
  const json = `
    {
      "emptyObj": {}, 
      "emptyArr": [],
      "quote": "He said \\"Hello, World!\\""
    }
  `;

  test('should handle empty objects and arrays', () => {
    expect(JSON.parse(queryAndFree(json, 'emptyObj'))).toEqual({});
    expect(JSON.parse(queryAndFree(json, 'emptyArr'))).toEqual([]);
  });

  test('should handle strings with escaped quotes', () => {
    const result = queryAndFree(json, 'quote');
    expect(JSON.parse(result)).toBe('He said "Hello, World!"');
  });

  test('should return a parsing error for invalid JSON', () => {
    const invalidJson = `{"user": {"name": "John Doe"}`;
    const result = JSON.parse(queryAndFree(invalidJson, 'user.name'));
    expect(result.error).toBe('JSONParseError');
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

    expect(JSON.parse(queryAndFree(json, 'data.key0'))).toBe(0);
    expect(JSON.parse(queryAndFree(json, 'data.key50'))).toBe(50);
    expect(JSON.parse(queryAndFree(json, `data.key${keyCount - 1}`))).toBe(
      keyCount - 1,
    );
  });
});
