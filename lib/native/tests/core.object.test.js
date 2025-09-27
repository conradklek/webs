import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_object,
  webs_object_set,
  webs_number,
  webs_string,
  webs_array,
  webs_array_push,
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

describe('Webs C Core Object', () => {
  test('should create an empty object', () => {
    const objPtr = webs_object();
    expect(cValueToJs(objPtr)).toEqual({});
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
  });

  test('should handle nested objects and arrays', () => {
    const rootObjPtr = webs_object();
    const nestedObjPtr = webs_object();
    const nestedArrPtr = webs_array();

    webs_array_push(nestedArrPtr, webs_number(10));
    webs_object_set(nestedObjPtr, Buffer.from('arr\0'), nestedArrPtr);
    webs_object_set(rootObjPtr, Buffer.from('nested\0'), nestedObjPtr);

    const expected = {
      nested: {
        arr: [10],
      },
    };
    expect(cValueToJs(rootObjPtr)).toEqual(expected);
  });

  test('should overwrite existing keys', () => {
    const objPtr = webs_object();
    webs_object_set(objPtr, Buffer.from('key\0'), webs_number(100));
    webs_object_set(
      objPtr,
      Buffer.from('key\0'),
      webs_string(Buffer.from('new_value\0')),
    );

    expect(cValueToJs(objPtr)).toEqual({ key: 'new_value' });
  });
});
