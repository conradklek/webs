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
  ref,
  ref_get_value,
  webs_free_value,
  webs_free_string,
} = lib.symbols;

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

  function roundtripAndReEncode(cValuePtr) {
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
    const refPtr = ref(cValuePtr);

    const { original, reEncoded } = roundtripAndReEncode(refPtr);

    const expectedJson = { $$type: 'ref', value: 'hello world' };
    expect(JSON.parse(original)).toEqual(expectedJson);
    expect(reEncoded).toEqual(original);

    webs_free_value(refPtr);
  });
});
