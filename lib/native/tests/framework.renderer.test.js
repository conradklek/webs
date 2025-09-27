import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const { webs_ssr, webs_render_vdom, webs_free_string } = lib.symbols;

function renderSSR(template, context) {
  const templateBuffer = Buffer.from(template + '\0');
  const contextBuffer = Buffer.from(JSON.stringify(context) + '\0');
  const resultPtr = webs_ssr(templateBuffer, contextBuffer);
  if (!resultPtr || resultPtr.ptr === 0) {
    return 'Error: C function returned null pointer.';
  }
  try {
    return new CString(resultPtr).toString();
  } finally {
    webs_free_string(resultPtr);
  }
}

function renderVDOM(template, context) {
  const templateBuffer = Buffer.from(template + '\0');
  const contextBuffer = Buffer.from(JSON.stringify(context) + '\0');
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
  test('should render a simple static template to SSR string', () => {
    const html = '<div><p>Hello World</p></div>';
    const result = renderSSR(html, {});
    expect(result).toBe('<div><p>Hello World</p></div>');
  });

  test('should render a template with simple interpolation for SSR', () => {
    const template = '<h1>Hello, {{ name }}!</h1>';
    const context = { name: 'Webs' };
    const result = renderSSR(template, context);
    expect(result).toBe('<h1>Hello, Webs!</h1>');
  });

  test('should render dynamic attributes for SSR', () => {
    const template = '<a :href="url">Click me</a>';
    const context = { url: 'https://example.com' };
    const result = renderSSR(template, context);
    expect(result).toBe('<a href="https://example.com">Click me</a>');
  });

  test('should render a simple template to a VDOM JSON object', () => {
    const template = '<div>{{ message }}</div>';
    const context = { message: 'Test' };
    const vdom = renderVDOM(template, context);

    expect(vdom.type).toBe('div');
    expect(vdom.node_type).toBe(0);
    expect(vdom.children[0].type).toBe('Text');
    expect(vdom.children[0].children).toBe('Test');
  });

  test('should handle HTML escaping in SSR', () => {
    const template = '<div>{{ content }}</div>';
    const context = { content: '<script>alert("xss")</script>' };
    const result = renderSSR(template, context);
    expect(result).toBe(
      '<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>',
    );
  });

  test('should parse event listeners into the VDOM', () => {
    const template = '<button @click="increment"></button>';
    const context = {
      increment: '() => {}',
    };
    const vdom = renderVDOM(template, context);

    expect(vdom.type).toBe('button');
    expect(vdom.events).toBeDefined();
    expect(vdom.events.click).toBe('() => {}');
    expect(vdom.props['@click']).toBeUndefined();
  });
});
