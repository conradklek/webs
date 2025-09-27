import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString, JSCallback, ptr } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_engine_api,
  webs_engine_destroy_api,
  webs_engine_register_component,
  webs_h,
  webs_create_instance,
  webs_destroy_instance,
  webs_mount_component,
  webs_unmount_component,
  webs_parse_json,
  webs_free_value,
  webs_pointer,
  webs_object,
  webs_object_set,
  webs_string,
  webs_array,
} = lib.symbols;

let enginePtr = null;

describe('Webs C Component Lifecycle', () => {
  let mountCb, unmountCb;
  let mountCalled, unmountCalled;

  beforeEach(() => {
    enginePtr = webs_engine_api();
    mountCalled = false;
    unmountCalled = false;

    mountCb = new JSCallback(
      () => {
        mountCalled = true;
      },
      { args: ['ptr'] },
    );

    unmountCb = new JSCallback(
      () => {
        unmountCalled = true;
      },
      { args: ['ptr'] },
    );
  });

  afterEach(() => {
    if (enginePtr) {
      webs_engine_destroy_api(enginePtr);
      enginePtr = null;
    }
    mountCb.close();
    unmountCb.close();
  });

  test('should call onMount and onBeforeUnmount hooks', () => {
    const defPtr = webs_object();
    webs_object_set(
      defPtr,
      Buffer.from('name\0'),
      webs_string(Buffer.from('LifecycleTest\0')),
    );
    webs_object_set(
      defPtr,
      Buffer.from('template\0'),
      webs_string(Buffer.from('<div></div>\0')),
    );
    webs_object_set(
      defPtr,
      Buffer.from('onMount\0'),
      webs_pointer(mountCb.ptr),
    );
    webs_object_set(
      defPtr,
      Buffer.from('onBeforeUnmount\0'),
      webs_pointer(unmountCb.ptr),
    );

    webs_engine_register_component(
      enginePtr,
      Buffer.from('LifecycleTest\0'),
      defPtr,
    );

    webs_free_value(defPtr);

    const vnodePtr = webs_h(
      Buffer.from('LifecycleTest\0'),
      webs_object(),
      webs_array(),
    );
    const instancePtr = webs_create_instance(enginePtr, vnodePtr, null);

    expect(mountCalled).toBe(false);
    expect(unmountCalled).toBe(false);

    webs_mount_component(instancePtr);
    expect(mountCalled).toBe(true);
    expect(unmountCalled).toBe(false);

    webs_unmount_component(instancePtr);
    expect(mountCalled).toBe(true);
    expect(unmountCalled).toBe(true);

    webs_destroy_instance(instancePtr);
  });
});
