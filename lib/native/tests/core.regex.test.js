import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_regex_parse,
  webs_json_encode,
  webs_free_value,
  webs_free_string,
} = lib.symbols;

function parseRegexWithC(pattern) {
  const patternBuffer = Buffer.from(pattern + '\0');

  const statusPtr = Buffer.alloc(4);

  const regexValuePtr = webs_regex_parse(patternBuffer, statusPtr);

  const status = statusPtr.readInt32LE(0);

  if (status !== 0 || !regexValuePtr || regexValuePtr.ptr === 0) {
    if (regexValuePtr) webs_free_value(regexValuePtr);
    return null;
  }

  try {
    const jsonPtr = webs_json_encode(regexValuePtr);
    if (!jsonPtr || jsonPtr.ptr === 0) {
      return null;
    }
    try {
      const jsonString = new CString(jsonPtr).toString();
      return JSON.parse(jsonString);
    } finally {
      webs_free_string(jsonPtr);
    }
  } finally {
    webs_free_value(regexValuePtr);
  }
}

describe('Webs C Core Regex', () => {
  test('should parse a simple regex with flags', () => {
    const result = parseRegexWithC('/hello/gi');
    expect(result).toEqual({ pattern: 'hello', flags: 'gi' });
  });

  test('should parse a regex without flags', () => {
    const result = parseRegexWithC('/world/');
    expect(result).toEqual({ pattern: 'world', flags: '' });
  });

  test('should handle complex patterns', () => {
    const result = parseRegexWithC('/[a-z0-9_.-]+@[a-z0-9_.-]+\\.[a-z]{2,}/i');
    expect(result).toEqual({
      pattern: '[a-z0-9_.-]+@[a-z0-9_.-]+\\.[a-z]{2,}',
      flags: 'i',
    });
  });

  test('should return null for invalid regex format (no starting slash)', () => {
    const result = parseRegexWithC('hello/g');
    expect(result).toBeNull();
  });

  test('should return null for invalid regex format (no ending slash)', () => {
    const result = parseRegexWithC('/hello');
    expect(result).toBeNull();
  });

  test('should handle an empty pattern', () => {
    const result = parseRegexWithC('//');
    expect(result).toEqual({ pattern: '', flags: '' });
  });

  test('should handle escaped slashes in the pattern', () => {
    const result = parseRegexWithC('/http:\\/\\/example.com/i');
    expect(result).toEqual({
      pattern: 'http:\\/\\/example.com',
      flags: 'i',
    });
  });

  test('should handle only one slash', () => {
    const result = parseRegexWithC('/');
    expect(result).toBeNull();
  });

  test('should handle null or empty string input', () => {
    expect(parseRegexWithC('')).toBeNull();
    const statusPtr = Buffer.alloc(4);
    expect(webs_regex_parse(null, statusPtr)).toBe(null);
  });

  test('should parse regex with all valid flags', () => {
    const result = parseRegexWithC('/test/gimsuy');
    expect(result).toEqual({ pattern: 'test', flags: 'gimsuy' });
  });
});
