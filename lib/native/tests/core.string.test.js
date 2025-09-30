import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_string, webs_json_encode, webs_free_value, webs_free_string } =
  lib.symbols;

function cStringToJs(valuePtr) {
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

describe('Webs C Core String', () => {
  test('should create and represent a string value', () => {
    const testString = 'Hello from C!';
    const testBuffer = Buffer.from(testString + '\0');
    const stringPtr = webs_string(testBuffer);
    expect(cStringToJs(stringPtr)).toBe(testString);
  });

  test('should handle empty strings', () => {
    const testString = '';
    const testBuffer = Buffer.from(testString + '\0');
    const stringPtr = webs_string(testBuffer);
    expect(cStringToJs(stringPtr)).toBe(testString);
  });

  test('should handle strings with special characters', () => {
    const testString = '`~!@#$%^&*()_+-=[]{}\\|;\':",./<>?';
    const testBuffer = Buffer.from(testString + '\0');
    const stringPtr = webs_string(testBuffer);
    expect(cStringToJs(stringPtr)).toBe(testString);
  });

  test('should handle unicode characters', () => {
    const testString = '你好, world! 🚀';
    const testBuffer = Buffer.from(testString + '\0');
    const stringPtr = webs_string(testBuffer);
    expect(cStringToJs(stringPtr)).toBe(testString);
  });

  test('should handle null input gracefully', () => {
    const stringPtr = webs_string(null);
    expect(cStringToJs(stringPtr)).toBe('');
  });
});

describe('Webs C Core String Trimming', () => {
  const { webs_string_trim_start, webs_string_trim_end, webs_string_trim } =
    lib.symbols;

  function trimAndFree(trimFn, input) {
    if (input === null) return null;
    const inputBuffer = Buffer.from(input + '\0');
    const resultPtr = trimFn(inputBuffer);
    if (!resultPtr || resultPtr.ptr === 0) {
      if (input.trim() === '') return '';
      return input;
    }
    try {
      return new CString(resultPtr).toString();
    } finally {
      webs_free_string(resultPtr);
    }
  }

  test('webs_string_trim_start should trim leading whitespace', () => {
    expect(trimAndFree(webs_string_trim_start, '   hello')).toBe('hello');
    expect(trimAndFree(webs_string_trim_start, '\t\n world ')).toBe('world ');
    expect(trimAndFree(webs_string_trim_start, 'no-leading-space')).toBe(
      'no-leading-space',
    );
    expect(trimAndFree(webs_string_trim_start, '  ')).toBe('');
    expect(trimAndFree(webs_string_trim_start, '')).toBe('');
  });

  test('webs_string_trim_end should trim trailing whitespace', () => {
    expect(trimAndFree(webs_string_trim_end, 'hello   ')).toBe('hello');
    expect(trimAndFree(webs_string_trim_end, ' world \t\n')).toBe(' world');
    expect(trimAndFree(webs_string_trim_end, 'no-trailing-space')).toBe(
      'no-trailing-space',
    );
    expect(trimAndFree(webs_string_trim_end, '  ')).toBe('');
    expect(trimAndFree(webs_string_trim_end, '')).toBe('');
  });

  test('webs_string_trim should trim both leading and trailing whitespace', () => {
    expect(trimAndFree(webs_string_trim, '   hello   ')).toBe('hello');
    expect(trimAndFree(webs_string_trim, '\t world \n ')).toBe('world');
    expect(trimAndFree(webs_string_trim, 'no-spaces')).toBe('no-spaces');
    expect(trimAndFree(webs_string_trim, '  ')).toBe('');
    expect(trimAndFree(webs_string_trim, '')).toBe('');
  });

  test('trim functions should handle null input', () => {
    const statusPtr = Buffer.alloc(4);
    expect(() => webs_string_trim_start(null, statusPtr)).not.toThrow();
    expect(() => webs_string_trim_end(null, statusPtr)).not.toThrow();
    expect(() => webs_string_trim(null, statusPtr)).not.toThrow();
  });

  test('trim functions should handle strings with internal whitespace', () => {
    const testStr = '  hello   world  ';
    expect(trimAndFree(webs_string_trim_start, testStr)).toBe(
      'hello   world  ',
    );
    expect(trimAndFree(webs_string_trim_end, testStr)).toBe('  hello   world');
    expect(trimAndFree(webs_string_trim, testStr)).toBe('hello   world');
  });
});
