import { test, expect, describe } from 'bun:test';
import { symbols } from '../webs.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_parse_json, webs_json_encode, webs_free_value, webs_free_string } =
  lib.symbols;

function roundtrip(jsonString) {
  const jsonBuffer = Buffer.from(jsonString + '\0');

  const valuePtr = webs_parse_json(jsonBuffer);
  if (!valuePtr || valuePtr.ptr === 0) {
    return 'Error: C function returned null pointer on parse.';
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
    expect(result).toBe('Error: C function returned null pointer on parse.');
  });
});
