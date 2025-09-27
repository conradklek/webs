import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, JSCallback } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_engine_api,
  webs_engine_destroy_api,
  webs_parse_json,
  ref,
  ref_get_value,
  ref_set_value,
  effect,
  effect_run,
  effect_free,
  webs_free_value,
  webs_scheduler_flush_jobs,
} = lib.symbols;

function jsToValuePtr(jsValue) {
  const jsonString = JSON.stringify(jsValue);
  const jsonBuffer = Buffer.from(jsonString + '\0');
  const statusPtr = Buffer.alloc(4);
  const valuePtr = webs_parse_json(jsonBuffer, statusPtr);
  const status = statusPtr.readInt32LE(0);

  if (status !== 0 || !valuePtr || valuePtr.ptr === 0) {
    throw new Error(
      `Failed to parse JS value to WebsValue. Status: ${status}, Value: ${jsValue}`,
    );
  }
  return valuePtr;
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

describe('Webs C Reactivity Scheduler', () => {
  test('should batch multiple updates into a single effect run', () => {
    let effectRunCount = 0;

    const initialValuePtr = jsToValuePtr(0);
    let counterRefPtr = null;
    let effectPtr = null;
    let effectCallback = null;

    try {
      counterRefPtr = ref(initialValuePtr);

      const effectFn = () => {
        ref_get_value(enginePtr, counterRefPtr);
        effectRunCount++;
      };

      effectCallback = new JSCallback(effectFn, {});
      effectPtr = effect(effectCallback.ptr, null);

      effect_run(enginePtr, effectPtr);
      expect(effectRunCount).toBe(1);

      ref_set_value(enginePtr, counterRefPtr, jsToValuePtr(1));
      ref_set_value(enginePtr, counterRefPtr, jsToValuePtr(2));
      ref_set_value(enginePtr, counterRefPtr, jsToValuePtr(3));

      expect(effectRunCount).toBe(1);

      webs_scheduler_flush_jobs(enginePtr);

      expect(effectRunCount).toBe(2);

      ref_set_value(enginePtr, counterRefPtr, jsToValuePtr(4));

      expect(effectRunCount).toBe(2);

      webs_scheduler_flush_jobs(enginePtr);

      expect(effectRunCount).toBe(3);
    } finally {
      if (counterRefPtr) webs_free_value(counterRefPtr);
      if (effectPtr) effect_free(effectPtr);
      if (effectCallback) effectCallback.close();
    }
  });
});
