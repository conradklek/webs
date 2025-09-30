import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_engine_api,
  webs_engine_destroy_api,
  webs_wson_encode,
  webs_wson_decode,
  webs_string,
  webs_number,
  webs_object,
  webs_object_set,
  webs_ref,
  webs_reactive,
  webs_free_value,
  webs_free_string,
  webs_set_log_level,
} = lib.symbols;

webs_set_log_level(4);

describe('Webs C WSON Serializer/Deserializer', () => {
  let enginePtr;

  beforeEach(() => {
    enginePtr = webs_engine_api();
  });

  afterEach(() => {
    if (enginePtr) {
      webs_engine_destroy_api(enginePtr);
    }
  });

  function roundtripAndCompare(cValuePtr) {
    const wsonStringPtr = webs_wson_encode(cValuePtr);
    const wsonString = new CString(wsonStringPtr).toString();
    webs_free_string(wsonStringPtr);

    const wsonBuffer = Buffer.from(wsonString + '\0');
    const revivedValuePtr = webs_wson_decode(enginePtr, wsonBuffer, null);

    const reEncodedWsonStringPtr = webs_wson_encode(revivedValuePtr);
    const reEncodedWsonString = new CString(reEncodedWsonStringPtr).toString();
    webs_free_string(reEncodedWsonStringPtr);

    webs_free_value(revivedValuePtr);

    return {
      original: wsonString,
      reEncoded: reEncodedWsonString,
    };
  }

  test('should correctly roundtrip a simple ref', () => {
    const cValuePtr = webs_string(Buffer.from('hello world' + '\0'));
    const refPtr = webs_ref(cValuePtr);

    const { original, reEncoded } = roundtripAndCompare(refPtr);

    const expectedJson = { $$type: 'ref', value: 'hello world' };
    expect(JSON.parse(original)).toEqual(expectedJson);
    expect(reEncoded).toEqual(original);

    webs_free_value(refPtr);
  });

  test('should correctly roundtrip a reactive object', () => {
    const rawObjPtr = webs_object();
    webs_object_set(rawObjPtr, Buffer.from('count\0'), webs_number(10));
    const reactivePtr = webs_reactive(rawObjPtr);

    const { original, reEncoded } = roundtripAndCompare(reactivePtr);

    const plainJson = { count: 10 };
    expect(JSON.parse(original)).toEqual(plainJson);
    expect(reEncoded).toEqual(original);

    webs_free_value(reactivePtr);
  });

  test('should correctly roundtrip a nested structure with a ref', () => {
    const innerRefPtr = webs_ref(webs_number(123));
    const outerObjPtr = webs_object();
    webs_object_set(outerObjPtr, Buffer.from('myRef\0'), innerRefPtr);

    const { original, reEncoded } = roundtripAndCompare(outerObjPtr);

    const expectedJson = {
      myRef: {
        $$type: 'ref',
        value: 123,
      },
    };
    expect(JSON.parse(original)).toEqual(expectedJson);
    expect(reEncoded).toEqual(original);

    webs_free_value(outerObjPtr);
  });
});
