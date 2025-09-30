import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_ssr, webs_render_vdom, webs_free_string } = lib.symbols;

function renderVDOM(template, context) {
  const templateBuffer = Buffer.from(template + '\0');
  const contextBuffer = context
    ? Buffer.from(JSON.stringify(context) + '\0')
    : Buffer.from('{}\0');
  const resultPtr = webs_render_vdom(templateBuffer, contextBuffer);
  if (!resultPtr || resultPtr.ptr === 0) {
    return { error: 'C function returned null pointer.' };
  }
  try {
    const jsonString = new CString(resultPtr).toString();
    return JSON.parse(jsonString);
  } finally {
    webs_free_string(resultPtr);
  }
}

describe('Webs C Template Renderer', () => {
  test('should render a template with simple interpolation for SSR', () => {
    const template = '<h1>Hello, {{ name }}!</h1>';
    const context = { name: 'Webs' };
    const resultPtr = webs_ssr(
      Buffer.from(template + '\0'),
      Buffer.from(JSON.stringify(context) + '\0'),
    );
    const result = new CString(resultPtr).toString();
    webs_free_string(resultPtr);
    expect(result).toBe('<h1>Hello, Webs!</h1>');
  });

  test('should parse an #if block that evaluates true', () => {
    const template = '{#if condition}<div>Visible</div>{/if}';
    const context = { condition: true };
    const vdom = renderVDOM(template, context);

    expect(vdom.type).toBe('Fragment');
    expect(vdom.children.length).toBe(1);
    expect(vdom.children[0].type).toBe('div');
  });

  test('should produce a Fragment containing a Comment VNode (w-if) when an #if block evaluates false', () => {
    const template = '{#if condition}<div>Visible</div>{/if}';
    const context = { condition: false };
    const vdom = renderVDOM(template, context);

    expect(vdom.type).toBe('Fragment');
    expect(vdom.children.length).toBe(1);

    const child = vdom.children[0];
    expect(child.node_type).toBe(2);
    expect(child.type).toBe('Comment');
    expect(child.children).toBe('w-if');
  });

  test('should parse an #each block that iterates', () => {
    const template = '{#each items as item}<li>{{ item }}</li>{/each}';
    const context = { items: ['a', 'b', 'c'] };
    const vdom = renderVDOM(template, context);

    expect(vdom.type).toBe('Fragment');
    expect(vdom.children.length).toBe(3);
    expect(vdom.children[0].type).toBe('li');
    expect(vdom.children[0].children[0].children).toBe('a');
  });

  test('should parse event listeners into the VDOM', () => {
    const template = '<button @click="increment"></button>';
    const context = {
      increment: '() => {}',
    };
    const vdom = renderVDOM(template, context);

    expect(vdom.type).toBe('button');
    expect(vdom.events).toBeDefined();
    expect(vdom.events.click).toBe('increment');
  });
});
