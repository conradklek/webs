import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, JSCallback, CString } from 'bun:ffi';
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
  webs_provide,
  webs_inject,
  webs_json_parse,
  webs_json_encode,
  webs_free_value,
  webs_free_string,
  webs_object,
  webs_object_set,
  webs_pointer,
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
    webs_free_value(valuePtr);
  }
}

describe('Webs C Composition API: Provide/Inject', () => {
  let enginePtr;

  let parentSetupFn, childSetupFn, grandchildSetupFn;
  let injectedValueInChild = null;
  let injectedValueInGrandchild = null;

  beforeEach(() => {
    enginePtr = webs_engine_api();
    injectedValueInChild = null;
    injectedValueInGrandchild = null;

    parentSetupFn = new JSCallback(
      (_props, _context) => {
        webs_provide(enginePtr, Buffer.from('theme\0'), jsToValuePtr('dark'));
        webs_provide(
          enginePtr,
          Buffer.from('user\0'),
          jsToValuePtr({ name: 'Alice' }),
        );
        return webs_object();
      },
      { args: ['ptr', 'ptr'], returns: 'ptr' },
    );

    childSetupFn = new JSCallback(
      (_props, _context) => {
        const injectedTheme = webs_inject(enginePtr, Buffer.from('theme\0'));
        injectedValueInChild = valuePtrToJs(injectedTheme);
        webs_provide(
          enginePtr,
          Buffer.from('user\0'),
          jsToValuePtr({ name: 'Bob' }),
        );
        return webs_object();
      },
      { args: ['ptr', 'ptr'], returns: 'ptr' },
    );

    grandchildSetupFn = new JSCallback(
      (_props, _context) => {
        const injectedUser = webs_inject(enginePtr, Buffer.from('user\0'));
        injectedValueInGrandchild = valuePtrToJs(injectedUser);
        return webs_object();
      },
      { args: ['ptr', 'ptr'], returns: 'ptr' },
    );
  });

  afterEach(() => {
    if (enginePtr) {
      webs_engine_destroy_api(enginePtr);
    }
    parentSetupFn.close();
    childSetupFn.close();
    grandchildSetupFn.close();
  });

  test('should inject values provided by parent and override in child', () => {
    const GrandchildDef = {
      name: 'Grandchild',
      template: '<div>Injected: {{ user.name }}</div>',
    };
    const GrandchildDefPtr = jsToValuePtr(GrandchildDef);
    webs_object_set(
      GrandchildDefPtr,
      Buffer.from('setup\0'),
      webs_pointer(grandchildSetupFn.ptr),
    );
    webs_engine_register_component(
      enginePtr,
      Buffer.from('Grandchild\0'),
      GrandchildDefPtr,
    );

    const ChildDef = {
      name: 'Child',
      template: '<div><Grandchild /></div>',
    };
    const ChildDefPtr = jsToValuePtr(ChildDef);
    webs_object_set(
      ChildDefPtr,
      Buffer.from('setup\0'),
      webs_pointer(childSetupFn.ptr),
    );
    webs_engine_register_component(
      enginePtr,
      Buffer.from('Child\0'),
      ChildDefPtr,
    );

    const ParentDef = { name: 'Parent', template: '<div><Child /></div>' };
    const ParentDefPtr = jsToValuePtr(ParentDef);
    webs_object_set(
      ParentDefPtr,
      Buffer.from('setup\0'),
      webs_pointer(parentSetupFn.ptr),
    );
    webs_engine_register_component(
      enginePtr,
      Buffer.from('Parent\0'),
      ParentDefPtr,
    );

    const parentVNode = webs_h(Buffer.from('Parent\0'), webs_object(), null);
    const parentInstance = webs_create_instance(enginePtr, parentVNode, null);

    const childVNode = webs_h(Buffer.from('Child\0'), webs_object(), null);
    const childInstance = webs_create_instance(
      enginePtr,
      childVNode,
      parentInstance,
    );

    const grandchildVNode = webs_h(
      Buffer.from('Grandchild\0'),
      webs_object(),
      null,
    );
    const grandchildInstance = webs_create_instance(
      enginePtr,
      grandchildVNode,
      childInstance,
    );

    expect(injectedValueInChild).toBe('dark');
    expect(injectedValueInGrandchild).toEqual({ name: 'Bob' });

    webs_destroy_instance(grandchildInstance);
    webs_destroy_instance(childInstance);
    webs_destroy_instance(parentInstance);
  });
});
