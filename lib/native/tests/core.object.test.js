import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_object,
  webs_object_set,
  webs_object_get_clone,
  webs_object_get_ref,
  webs_object_keys,
  webs_number,
  webs_string,
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
  } catch (e) {
    console.error('Error in cValueToJs:', e);
    return undefined;
  }
}

describe('Webs C Core Object', () => {
  test('should create an empty object', () => {
    const objPtr = webs_object();
    expect(cValueToJs(objPtr)).toEqual({});

    webs_free_value(objPtr);
  });

  test('should set properties with various types', () => {
    const objPtr = webs_object();
    webs_object_set(objPtr, Buffer.from('a\0'), webs_number(1));
    webs_object_set(
      objPtr,
      Buffer.from('b\0'),
      webs_string(Buffer.from('two\0')),
    );
    expect(cValueToJs(objPtr)).toEqual({ a: 1, b: 'two' });
    webs_free_value(objPtr);
  });

  test('webs_object_get_clone should return a deep copy that can be modified safely', () => {
    const rootObjPtr = webs_object();
    const nestedObjPtr = webs_object();
    webs_object_set(nestedObjPtr, Buffer.from('count\0'), webs_number(10));
    webs_object_set(rootObjPtr, Buffer.from('data\0'), nestedObjPtr);

    const clonePtr = webs_object_get_clone(rootObjPtr, Buffer.from('data\0'));

    webs_object_set(clonePtr, Buffer.from('count\0'), webs_number(99));

    expect(cValueToJs(clonePtr)).toEqual({ count: 99 });

    const originalRefPtr = webs_object_get_ref(
      rootObjPtr,
      Buffer.from('data\0'),
    );

    const originalJs = cValueToJs(originalRefPtr);
    expect(originalJs).toEqual({ count: 10 });

    webs_free_value(clonePtr);

    webs_free_value(rootObjPtr);
  });

  test('webs_object_get should return null for a non-existent key', () => {
    const objPtr = webs_object();
    const valuePtr = webs_object_get_clone(
      objPtr,
      Buffer.from('nonExistentKey\0'),
    );
    expect(valuePtr).toBe(null);
    webs_free_value(objPtr);
  });

  test('webs_object_keys should return an array of keys', () => {
    const objPtr = webs_object();
    webs_object_set(objPtr, Buffer.from('a\0'), webs_number(1));
    webs_object_set(objPtr, Buffer.from('b\0'), webs_number(2));

    const keysPtr = webs_object_keys(objPtr);
    const keys = cValueToJs(keysPtr);
    expect(keys).toBeInstanceOf(Array);
    expect(keys.length).toBe(2);
    expect(keys).toContain('a');
    expect(keys).toContain('b');

    webs_free_value(keysPtr);
    webs_free_value(objPtr);
  });
});
