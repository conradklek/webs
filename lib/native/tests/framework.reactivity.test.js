import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString, JSCallback } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_engine_api,
  webs_engine_destroy_api,
  webs_json_parse,
  webs_json_encode,
  ref,
  ref_get_value,
  ref_set_value,
  reactive,
  reactive_get,
  reactive_set,
  effect,
  effect_run,
  effect_free,
  webs_free_string,
  webs_free_value,
  webs_scheduler_flush_jobs,
  webs_set_log_level,
} = lib.symbols;

webs_set_log_level(4);

function jsToValuePtr(jsValue) {
  const jsonString = JSON.stringify(jsValue);
  const jsonBuffer = Buffer.from(jsonString + '\0');
  const statusPtr = Buffer.alloc(4);
  const valuePtr = webs_json_parse(jsonBuffer, statusPtr);
  const status = statusPtr.readInt32LE(0);

  if (status !== 0 || !valuePtr || valuePtr.ptr === 0) {
    throw new Error(
      `Failed to parse JS value to WebsValue. Status: ${status}, Value: ${jsValue}`,
    );
  }
  return valuePtr;
}

function valuePtrToJs(valuePtr) {
  if (!valuePtr || valuePtr.ptr === 0) {
    return null;
  }
  const jsonPtr = webs_json_encode(valuePtr);
  if (!jsonPtr || jsonPtr.ptr === 0) {
    throw new Error('Failed to encode WebsValue to JSON.');
  }
  try {
    const jsonString = new CString(jsonPtr).toString();
    return JSON.parse(jsonString);
  } finally {
    webs_free_string(jsonPtr);
  }
}

let enginePtr = null;

beforeEach(() => {
  enginePtr = webs_engine_api();
  if (!enginePtr || enginePtr.ptr === 0) {
    throw new Error('Test setup failed: Could not create WebsEngine.');
  }
});

afterEach(() => {
  if (enginePtr) {
    webs_engine_destroy_api(enginePtr);
    enginePtr = null;
  }
});

describe('Webs C Reactivity: ref', () => {
  test('should create a ref and get its value', () => {
    const initialValuePtr = jsToValuePtr(10);
    let refPtr = null;
    try {
      refPtr = ref(initialValuePtr);
      const valuePtr = ref_get_value(enginePtr, refPtr);
      const result = valuePtrToJs(valuePtr);
      expect(result).toBe(10);
    } finally {
      if (refPtr) webs_free_value(refPtr);
    }
  });

  test('should set a new value for a ref', () => {
    const initialValuePtr = jsToValuePtr(10);
    const newValuePtr = jsToValuePtr(20);
    let refPtr = null;
    try {
      refPtr = ref(initialValuePtr);
      ref_set_value(enginePtr, refPtr, newValuePtr);
      const resultValuePtr = ref_get_value(enginePtr, refPtr);
      const result = valuePtrToJs(resultValuePtr);
      expect(result).toBe(20);
    } finally {
      if (refPtr) webs_free_value(refPtr);
    }
  });

  test('should trigger an effect when a ref changes', () => {
    let counter = 0;
    const initialValuePtr = jsToValuePtr(100);
    let refPtr = null;
    let effectPtr = null;
    let effectCallback = null;

    try {
      refPtr = ref(initialValuePtr);
      const effectFn = () => {
        ref_get_value(enginePtr, refPtr);
        counter++;
      };
      effectCallback = new JSCallback(effectFn, {});
      effectPtr = effect(effectCallback.ptr, null);

      effect_run(enginePtr, effectPtr);
      expect(counter).toBe(1);

      ref_set_value(enginePtr, refPtr, jsToValuePtr(100));
      webs_scheduler_flush_jobs(enginePtr);
      expect(counter).toBe(1);

      ref_set_value(enginePtr, refPtr, jsToValuePtr(200));
      expect(counter).toBe(1);

      webs_scheduler_flush_jobs(enginePtr);
      expect(counter).toBe(2);
    } finally {
      if (refPtr) webs_free_value(refPtr);
      if (effectPtr) effect_free(effectPtr);
      if (effectCallback) effectCallback.close();
    }
  });
});

describe('Webs C Reactivity: reactive', () => {
  test('should create a reactive object and get a property', () => {
    const rawObjPtr = jsToValuePtr({ a: 1, b: 'hello' });
    let reactivePtr = null;
    try {
      reactivePtr = reactive(rawObjPtr);
      const keyBuffer = Buffer.from('a\0');
      const propValuePtr = reactive_get(enginePtr, reactivePtr, keyBuffer);
      const result = valuePtrToJs(propValuePtr);
      expect(result).toBe(1);
    } finally {
      if (reactivePtr) webs_free_value(reactivePtr);
    }
  });

  test('should trigger an effect when a reactive property changes', () => {
    let counter = 0;
    const rawObjPtr = jsToValuePtr({ count: 0, msg: 'hi' });
    let reactivePtr = null;
    let effectPtr = null;
    let effectCallback = null;

    try {
      reactivePtr = reactive(rawObjPtr);
      const keyBuffer = Buffer.from('count\0');

      const effectFn = () => {
        reactive_get(enginePtr, reactivePtr, keyBuffer);
        counter++;
      };
      effectCallback = new JSCallback(effectFn, {});
      effectPtr = effect(effectCallback.ptr, null);

      effect_run(enginePtr, effectPtr);
      expect(counter).toBe(1);

      reactive_set(enginePtr, reactivePtr, keyBuffer, jsToValuePtr(1));
      expect(counter).toBe(1);
      webs_scheduler_flush_jobs(enginePtr);
      expect(counter).toBe(2);

      const otherKeyBuffer = Buffer.from('msg\0');
      reactive_set(enginePtr, reactivePtr, otherKeyBuffer, jsToValuePtr('bye'));
      webs_scheduler_flush_jobs(enginePtr);
      expect(counter).toBe(2);

      reactive_set(enginePtr, reactivePtr, keyBuffer, jsToValuePtr(1));
      webs_scheduler_flush_jobs(enginePtr);
      expect(counter).toBe(2);
    } finally {
      if (reactivePtr) webs_free_value(reactivePtr);
      if (effectPtr) effect_free(effectPtr);
      if (effectCallback) effectCallback.close();
    }
  });
});
