import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, JSCallback } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_dom_create_element,
  webs_dom_append_child,
  webs_dom_free_node,
  webs_dom_set_attribute,
  webs_dom_add_event_listener,
  webs_event_dispatch_click,
  webs_string,
  webs_pointer,
} = lib.symbols;

describe('Webs C DOM Module', () => {
  test('should create an element node', () => {
    const elPtr = webs_dom_create_element(Buffer.from('div\0'));
    expect(elPtr).not.toBe(null);
    expect(elPtr.ptr).not.toBe(0);
    webs_dom_free_node(elPtr);
  });

  test('should append a child node', () => {
    const parentPtr = webs_dom_create_element(Buffer.from('div\0'));
    const childPtr = webs_dom_create_element(Buffer.from('p\0'));

    webs_dom_append_child(parentPtr, childPtr);

    webs_dom_free_node(parentPtr);
  });

  test('should set an attribute on a node', () => {
    const elPtr = webs_dom_create_element(Buffer.from('a\0'));
    const key = Buffer.from('href\0');
    const value = webs_string(Buffer.from('https://example.com\0'));

    webs_dom_set_attribute(elPtr, key, value);

    webs_dom_free_node(elPtr);
  });

  test('should add an event listener and dispatch an event', () => {
    let clicked = false;
    const listenerCallback = new JSCallback(
      () => {
        clicked = true;
      },
      { args: [] },
    );

    const elPtr = webs_dom_create_element(Buffer.from('button\0'));
    const eventType = Buffer.from('click\0');
    const listenerValue = webs_pointer(listenerCallback.ptr);

    webs_dom_add_event_listener(elPtr, eventType, listenerValue);
    webs_event_dispatch_click(elPtr);

    expect(clicked).toBe(true);

    webs_dom_free_node(elPtr);
    listenerCallback.close();
  });

  test('should not crash when dispatching an event on a freed node (use-after-free)', () => {
    const elPtr = webs_dom_create_element(Buffer.from('button\0'));
    const eventType = Buffer.from('click\0');

    webs_dom_add_event_listener(elPtr, eventType, null);

    webs_dom_free_node(elPtr);

    expect(() => {
      webs_event_dispatch_click(elPtr);
    }).not.toThrow();
  });
});
