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
  const regexValuePtr = webs_regex_parse(patternBuffer);
  if (!regexValuePtr || regexValuePtr.ptr === 0) {
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
});
