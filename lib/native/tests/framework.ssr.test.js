import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_engine_api,
  webs_engine_destroy_api,
  webs_engine_register_component,
  webs_free_string,
  webs_json_parse,
  webs_free_value,
  webs_render_to_string,
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

describe('Webs C Server-Side Renderer (SSR)', () => {
  let enginePtr;

  beforeEach(() => {
    enginePtr = webs_engine_api();
  });

  afterEach(() => {
    if (enginePtr) {
      webs_engine_destroy_api(enginePtr);
    }
  });

  function renderComponentSSR(componentName, props = {}) {
    const componentNameBuffer = Buffer.from(componentName + '\0');
    const propsPtr = jsToValuePtr(props);

    const htmlPtr = webs_render_to_string(
      enginePtr,
      componentNameBuffer,
      propsPtr,
    );

    webs_free_value(propsPtr);

    if (!htmlPtr || htmlPtr.ptr === 0) {
      throw new Error('webs_render_to_string returned a null pointer.');
    }

    try {
      const htmlString = new CString(htmlPtr).toString();
      return htmlString;
    } finally {
      webs_free_string(htmlPtr);
    }
  }

  test('should render a simple static component', () => {
    const CompDef = {
      name: 'Static',
      template: `<div><p>Hello SSR</p></div>`,
    };
    const defPtr = jsToValuePtr(CompDef);
    webs_engine_register_component(enginePtr, Buffer.from('Static\0'), defPtr);
    webs_free_value(defPtr);

    const html = renderComponentSSR('Static');
    expect(html).toBe('<div><p>Hello SSR</p></div>');
  });

  test('should render a component with props', () => {
    const CompDef = {
      name: 'WithProps',
      props: { name: { default: 'World' } },
      template: `<h1>Hello, {{ name }}!</h1>`,
    };
    const defPtr = jsToValuePtr(CompDef);
    webs_engine_register_component(
      enginePtr,
      Buffer.from('WithProps\0'),
      defPtr,
    );
    webs_free_value(defPtr);

    const html = renderComponentSSR('WithProps', { name: 'Bun' });
    expect(html).toBe('<h1>Hello, Bun!</h1>');
  });

  test('should render attributes correctly', () => {
    const CompDef = {
      name: 'WithAttrs',
      props: { id: {}, className: {} },
      template: `<div :id="id" :class="className" data-test="ssr"><span>Test</span></div>`,
    };
    const defPtr = jsToValuePtr(CompDef);
    webs_engine_register_component(
      enginePtr,
      Buffer.from('WithAttrs\0'),
      defPtr,
    );
    webs_free_value(defPtr);

    const html = renderComponentSSR('WithAttrs', {
      id: 'app',
      className: 'container',
    });

    expect(html.startsWith('<div ')).toBe(true);
    expect(html.endsWith('><span>Test</span></div>')).toBe(true);

    const attrsString = html.substring(5, html.indexOf('>')).trim();
    const attrs = new Set(attrsString.split(' '));

    expect(attrs.has('id="app"')).toBe(true);
    expect(attrs.has('class="container"')).toBe(true);
    expect(attrs.has('data-test="ssr"')).toBe(true);
    expect(attrs.size).toBe(3);
  });

  test('should render void (self-closing) tags', () => {
    const CompDef = {
      name: 'VoidTags',
      template: `<div><img src="test.png"><hr/></div>`,
    };
    const defPtr = jsToValuePtr(CompDef);
    webs_engine_register_component(
      enginePtr,
      Buffer.from('VoidTags\0'),
      defPtr,
    );
    webs_free_value(defPtr);

    const html = renderComponentSSR('VoidTags');
    expect(html).toBe('<div><img src="test.png"/><hr/></div>');
  });

  test('should handle HTML escaping for text content', () => {
    const CompDef = {
      name: 'EscapeText',
      props: { text: {} },
      template: `<p>{{ text }}</p>`,
    };
    const defPtr = jsToValuePtr(CompDef);
    webs_engine_register_component(
      enginePtr,
      Buffer.from('EscapeText\0'),
      defPtr,
    );
    webs_free_value(defPtr);

    const text = '<script>alert("xss")</script>';
    const html = renderComponentSSR('EscapeText', { text });
    expect(html).toBe(
      '<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>',
    );
  });

  test('should handle HTML escaping for attribute values', () => {
    const CompDef = {
      name: 'EscapeAttr',
      props: { url: {} },
      template: `<a :href="url">Link</a>`,
    };
    const defPtr = jsToValuePtr(CompDef);
    webs_engine_register_component(
      enginePtr,
      Buffer.from('EscapeAttr\0'),
      defPtr,
    );
    webs_free_value(defPtr);

    const url = '"><script>alert(1)</script>';
    const html = renderComponentSSR('EscapeAttr', { url });
    expect(html).toBe(
      '<a href="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">Link</a>',
    );
  });

  test('should handle boolean attributes', () => {
    const CompDef = {
      name: 'BoolAttr',
      props: { isDisabled: {}, isChecked: {}, isRequired: {} },
      template: `<input :disabled="isDisabled" :checked="isChecked" :required="isRequired" />`,
    };
    const defPtr = jsToValuePtr(CompDef);
    webs_engine_register_component(
      enginePtr,
      Buffer.from('BoolAttr\0'),
      defPtr,
    );
    webs_free_value(defPtr);

    const html = renderComponentSSR('BoolAttr', {
      isDisabled: true,
      isChecked: 'checked',
      isRequired: false,
    });
    expect(html).toBe('<input disabled checked="checked"/>');
  });
});
