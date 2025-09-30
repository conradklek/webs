import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_array,
  webs_array_push,
  webs_array_count,
  webs_array_get_clone,
  webs_number,
  webs_string,
  webs_boolean,
  webs_null,
  webs_object,
  webs_object_set,
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
    expect(webs_array_count(arrayPtr)).toBe(0);

    const jsonContent = cValueToJs(arrayPtr);
    expect(jsonContent).toEqual([]);

    webs_free_value(arrayPtr);
  });

  test('should create an array and push various primitive types, returning success codes', () => {
    let arrayPtr = webs_array();

    webs_array_push(arrayPtr, webs_number(42));
    webs_array_push(arrayPtr, webs_string(Buffer.from('hello\0')));
    webs_array_push(arrayPtr, webs_boolean(true));
    webs_array_push(arrayPtr, webs_null());

    expect(webs_array_count(arrayPtr)).toBe(4);
    expect(cValueToJs(arrayPtr)).toEqual([42, 'hello', true, null]);
    webs_free_value(arrayPtr);
  });

  test('should handle nested arrays', () => {
    const outerArrayPtr = webs_array();
    const innerArrayPtr = webs_array();

    webs_array_push(innerArrayPtr, webs_number(1));
    webs_array_push(innerArrayPtr, webs_number(2));

    webs_array_push(outerArrayPtr, innerArrayPtr);
    webs_array_push(outerArrayPtr, webs_number(3));

    expect(webs_array_count(outerArrayPtr)).toBe(2);
    expect(cValueToJs(outerArrayPtr)).toEqual([[1, 2], 3]);
    webs_free_value(outerArrayPtr);
  });

  test('webs_array_get should retrieve elements correctly', () => {
    const arrayPtr = webs_array();
    webs_array_push(arrayPtr, webs_string(Buffer.from('first\0')));
    webs_array_push(arrayPtr, webs_number(100));

    const firstElPtr = webs_array_get_clone(arrayPtr, 0);
    const secondElPtr = webs_array_get_clone(arrayPtr, 1);

    expect(cValueToJs(firstElPtr)).toBe('first');
    expect(cValueToJs(secondElPtr)).toBe(100);

    webs_free_value(firstElPtr);
    webs_free_value(secondElPtr);

    webs_free_value(arrayPtr);
  });

  test('webs_array_get should return null for out-of-bounds index', () => {
    const arrayPtr = webs_array();
    webs_array_push(arrayPtr, webs_number(1));

    const outOfBoundsPtr = webs_array_get_clone(arrayPtr, 5);
    expect(outOfBoundsPtr).toBe(null);

    const negativeIndexPtr = webs_array_get_clone(arrayPtr, -1);
    expect(negativeIndexPtr).toBe(null);

    webs_free_value(arrayPtr);
  });

  test('should handle pushing objects into an array', () => {
    const arrayPtr = webs_array();
    const objPtr = webs_object();
    webs_object_set(
      objPtr,
      Buffer.from('key\0'),
      webs_string(Buffer.from('value\0')),
    );

    webs_array_push(arrayPtr, objPtr);

    expect(webs_array_count(arrayPtr)).toBe(1);
    expect(cValueToJs(arrayPtr)).toEqual([{ key: 'value' }]);
    webs_free_value(arrayPtr);
  });

  test('should return an error code when pushing to a non-array value', () => {
    const notAnArray = webs_object();
    const element = webs_number(123);

    const status = webs_array_push(notAnArray, element);
    expect(status).not.toBe(0);

    webs_free_value(notAnArray);
    webs_free_value(element);
  });
});
