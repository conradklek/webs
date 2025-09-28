import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_array,
  webs_array_push,
  webs_number,
  webs_string,
  webs_boolean,
  webs_null,
  webs_json_encode,
  webs_free_value,
  webs_free_string,
} = lib.symbols;

function cValueToJs(valuePtr) {
  if (!valuePtr || valuePtr.ptr === 0) {
    return undefined;
  }
  const jsonPtr = webs_json_encode(valuePtr);
  if (!jsonPtr || jsonPtr.ptr === 0) {
    webs_free_value(valuePtr);
    return undefined;
  }
  try {
    const jsonString = new CString(jsonPtr).toString();
    return JSON.parse(jsonString);
  } finally {
    webs_free_string(jsonPtr);
  }
}

describe('Webs C Core Array', () => {
  test('should create an empty array', () => {
    const arrayPtr = webs_array();
    expect(cValueToJs(arrayPtr)).toEqual([]);
    webs_free_value(arrayPtr);
  });

  test('should create an array and push various primitive types, returning success codes', () => {
    let arrayPtr = webs_array();

    expect(webs_array_push(arrayPtr, webs_number(42))).toBe(0);
    expect(webs_array_push(arrayPtr, webs_string(Buffer.from('hello\0')))).toBe(
      0,
    );
    expect(webs_array_push(arrayPtr, webs_boolean(true))).toBe(0);
    expect(webs_array_push(arrayPtr, webs_null())).toBe(0);

    expect(cValueToJs(arrayPtr)).toEqual([42, 'hello', true, null]);
    webs_free_value(arrayPtr);
  });

  test('should handle nested arrays', () => {
    const outerArrayPtr = webs_array();
    const innerArrayPtr = webs_array();

    expect(webs_array_push(innerArrayPtr, webs_number(1))).toBe(0);
    expect(webs_array_push(innerArrayPtr, webs_number(2))).toBe(0);

    expect(webs_array_push(outerArrayPtr, innerArrayPtr)).toBe(0);
    expect(webs_array_push(outerArrayPtr, webs_number(3))).toBe(0);

    expect(cValueToJs(outerArrayPtr)).toEqual([[1, 2], 3]);
    webs_free_value(outerArrayPtr);
  });
});
