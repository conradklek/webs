import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_number,
  webs_boolean,
  webs_null,
  webs_undefined,
  webs_json_encode,
  webs_free_value,
  webs_free_string,
} = lib.symbols;

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

describe('Webs C Core Primitives', () => {
  test('should create and represent a number value', () => {
    const numPtr = webs_number(123.45);
    expect(cValueToJs(numPtr)).toBe(123.45);
  });

  test('should create and represent a boolean true value', () => {
    const boolPtr = webs_boolean(true);
    expect(cValueToJs(boolPtr)).toBe(true);
  });

  test('should create and represent a boolean false value', () => {
    const boolPtr = webs_boolean(false);
    expect(cValueToJs(boolPtr)).toBe(false);
  });

  test('should create and represent a null value', () => {
    const nullPtr = webs_null();
    expect(cValueToJs(nullPtr)).toBeNull();
  });

  test('should create and represent an undefined value as null in JSON', () => {
    const undefinedPtr = webs_undefined();
    expect(cValueToJs(undefinedPtr)).toBeNull();
  });

  test('should handle zero as a number', () => {
    const numPtr = webs_number(0);
    expect(cValueToJs(numPtr)).toBe(0);
  });

  test('should handle negative numbers', () => {
    const numPtr = webs_number(-987.65);
    expect(cValueToJs(numPtr)).toBe(-987.65);
  });
});
