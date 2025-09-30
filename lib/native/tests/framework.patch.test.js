import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_h,
  webs_diff,
  webs_json_encode,
  webs_free_vnode,
  webs_free_value,
  webs_free_string,
  webs_json_parse,
} = lib.symbols;

function parseJsonWithC(jsonString) {
  const jsonBuffer = Buffer.from(jsonString + '\0');
  const statusPtr = Buffer.alloc(4);
  const valuePtr = webs_json_parse(jsonBuffer, statusPtr);
  const status = statusPtr.readInt32LE(0);

  if (status !== 0 || !valuePtr || valuePtr.ptr === 0) {
    throw new Error(
      `Failed to parse JSON string. Status: ${status}, JSON: ${jsonString}`,
    );
  }
  return valuePtr;
}

function h(type, props, children) {
  const childrenPayload = !children
    ? []
    : Array.isArray(children)
      ? children
      : [children];
  return { type, props: props || {}, children: childrenPayload };
}

function createVNodePtr(vnode_js) {
  if (!vnode_js) return null;
  const { type, props, children } = vnode_js;
  const typeBuffer = Buffer.from(type + '\0');

  const propsVal = parseJsonWithC(JSON.stringify(props || {}));
  const childrenVal = parseJsonWithC(JSON.stringify(children || []));

  const vnodePtr = webs_h(typeBuffer, propsVal, childrenVal);

  if (!vnodePtr || vnodePtr === 0) {
    if (propsVal) webs_free_value(propsVal);
    if (childrenVal) webs_free_value(childrenVal);
    throw new Error(`webs_h returned a null pointer for type: ${type}`);
  }

  return vnodePtr;
}

function getPatches(n1_js, n2_js) {
  const n1_ptr = createVNodePtr(n1_js);
  const n2_ptr = createVNodePtr(n2_js);

  const patchesValuePtr = webs_diff(n1_ptr, n2_ptr);
  const jsonPtr = webs_json_encode(patchesValuePtr);
  const jsonString = new CString(jsonPtr).toString();

  webs_free_value(patchesValuePtr);
  webs_free_string(jsonPtr);
  if (n1_ptr) webs_free_vnode(n1_ptr);
  if (n2_ptr) webs_free_vnode(n2_ptr);

  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('Failed to parse patches JSON:', jsonString);
    throw e;
  }
}

describe('Webs C Patcher (Diffing)', () => {
  test('should create a root node if old vnode is null', () => {
    const n2 = h('div', { id: 'app' }, ['Hello']);
    const patches = getPatches(null, n2);

    expect(patches.length).toBe(1);
    expect(patches[0].type).toBe(0);
    expect(patches[0].path).toEqual([0]);
    expect(patches[0].data.type).toBe('div');
  });

  test('should remove the root node if new vnode is null', () => {
    const n1 = h('div', { id: 'app' });
    const patches = getPatches(n1, null);

    expect(patches.length).toBe(1);
    expect(patches[0].type).toBe(1);
    expect(patches[0].path).toEqual([0]);
  });

  test('should replace a node if types are different', () => {
    const n1 = h('div');
    const n2 = h('p');
    const patches = getPatches(n1, n2);

    expect(patches.length).toBe(1);
    expect(patches[0].type).toBe(2);
    expect(patches[0].data.type).toBe('p');
  });

  test('should detect updated props', () => {
    const n1 = h('div', { id: 'old', class: 'a' });
    const n2 = h('div', { id: 'new', style: 'color: red' });
    const patches = getPatches(n1, n2);

    expect(patches.length).toBe(1);
    expect(patches[0].type).toBe(3);
    expect(patches[0].data).toEqual({
      id: 'new',
      class: null,
      style: 'color: red',
    });
  });

  test('should detect updated event listeners', () => {
    const n1 = h('div', { '@click': 'handlerA' });
    const n2 = h('div', { '@click': 'handlerB', '@mouseover': 'handlerC' });
    const patches = getPatches(n1, n2);

    expect(patches.length).toBe(1);
    expect(patches[0].type).toBe(6);
    expect(patches[0].data).toEqual({
      click: 'handlerB',
      mouseover: 'handlerC',
    });
  });

  test('should detect removed event listeners', () => {
    const n1 = h('div', { '@click': 'handlerA' });
    const n2 = h('div', {});
    const patches = getPatches(n1, n2);

    expect(patches.length).toBe(1);
    expect(patches[0].type).toBe(6);
    expect(patches[0].data).toEqual({ click: null });
  });

  test('should detect text updates', () => {
    const n1 = h('p', {}, ['old text']);
    const n2 = h('p', {}, ['new text']);
    const patches = getPatches(n1, n2);

    expect(patches.length).toBe(1);
    expect(patches[0].type).toBe(4);
    expect(patches[0].path).toEqual([0, 0]);
    expect(patches[0].data).toBe('new text');
  });

  describe('Unkeyed Children', () => {
    test('should append new children', () => {
      const n1 = h('div', {}, [h('p')]);
      const n2 = h('div', {}, [h('p'), h('span')]);
      const patches = getPatches(n1, n2);

      expect(patches.length).toBe(1);
      const patch = patches[0];
      expect(patch.type).toBe(0);
      expect(patch.path).toEqual([0, 1]);
      expect(patch.data.type).toBe('span');
    });

    test('should remove children from the end', () => {
      const n1 = h('div', {}, [h('p'), h('span')]);
      const n2 = h('div', {}, [h('p')]);
      const patches = getPatches(n1, n2);

      expect(patches.length).toBe(1);
      const patch = patches[0];
      expect(patch.type).toBe(1);
      expect(patch.path).toEqual([0, 1]);
    });
  });

  describe('Keyed Children', () => {
    test('should add an element in the middle', () => {
      const n1 = h('div', {}, [h('p', { key: 'a' }), h('p', { key: 'c' })]);
      const n2 = h('div', {}, [
        h('p', { key: 'a' }),
        h('p', { key: 'b' }),
        h('p', { key: 'c' }),
      ]);
      const patches = getPatches(n1, n2);

      const createPatch = patches.find((p) => p.type === 0);
      expect(createPatch).toBeDefined();
      expect(createPatch.path).toEqual([0, 1]);
      expect(createPatch.data.props.key).toBe('b');
    });

    test('should remove an element from the middle', () => {
      const n1 = h('div', {}, [
        h('p', { key: 'a' }),
        h('p', { key: 'b' }),
        h('p', { key: 'c' }),
      ]);
      const n2 = h('div', {}, [h('p', { key: 'a' }), h('p', { key: 'c' })]);
      const patches = getPatches(n1, n2);

      const reorderPatch = patches.find((p) => p.type === 5);
      expect(reorderPatch).toBeDefined();
    });

    test('should move an element forward', () => {
      const n1 = h('div', {}, [
        h('p', { key: 'a' }),
        h('p', { key: 'b' }),
        h('p', { key: 'c' }),
      ]);
      const n2 = h('div', {}, [
        h('p', { key: 'b' }),
        h('p', { key: 'a' }),
        h('p', { key: 'c' }),
      ]);
      const patches = getPatches(n1, n2);

      const reorderPatch = patches.find((p) => p.type === 5);
      expect(reorderPatch).toBeDefined();
      expect(reorderPatch.path).toEqual([0]);
      expect(reorderPatch.data).toEqual({ type: 'reorder' });
    });

    test('should reverse a list of children', () => {
      const n1 = h('div', {}, [
        h('li', { key: 1 }),
        h('li', { key: 2 }),
        h('li', { key: 3 }),
        h('li', { key: 4 }),
      ]);
      const n2 = h('div', {}, [
        h('li', { key: 4 }),
        h('li', { key: 3 }),
        h('li', { key: 2 }),
        h('li', { key: 1 }),
      ]);

      const patches = getPatches(n1, n2);
      const reorderPatch = patches.find((p) => p.type === 5);
      expect(reorderPatch).toBeDefined();
    });

    test('should replace a text node with an element node', () => {
      const n1 = h('div', {}, ['Just text']);
      const n2 = h('div', {}, [h('p', {}, ['Now an element'])]);
      const patches = getPatches(n1, n2);

      expect(patches.length).toBe(1);
      const patch = patches[0];
      expect(patch.type).toBe(2);
      expect(patch.path).toEqual([0, 0]);
      expect(patch.data.type).toBe('p');
    });

    test('should handle replacing a keyed child with another keyed child of different type', () => {
      const n1 = h('div', {}, [h('p', { key: 'a' })]);
      const n2 = h('div', {}, [h('span', { key: 'a' })]);
      const patches = getPatches(n1, n2);

      const replacePatch = patches.find((p) => p.type === 2);

      expect(replacePatch).toBeDefined();
      expect(replacePatch.path).toEqual([0, 0]);
      expect(replacePatch.data.type).toBe('span');
    });
  });
});
