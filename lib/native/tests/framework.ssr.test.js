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
  webs_render_to_string,
  webs_json_parse,
  webs_free_string,
} = lib.symbols;

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

  function jsToValuePtr(jsValue) {
    const jsonString = JSON.stringify(jsValue);
    const jsonBuffer = Buffer.from(jsonString + '\0');
    const statusPtr = Buffer.alloc(4);
    const valuePtr = webs_json_parse(jsonBuffer, statusPtr);
    if (statusPtr.readInt32LE(0) !== 0 || !valuePtr || valuePtr.ptr === 0) {
      throw new Error('Failed to parse JS value to Webs Value');
    }
    return valuePtr;
  }

  function renderComponentSSR(componentName, props = {}) {
    const propsPtr = jsToValuePtr(props);
    const nameBuffer = Buffer.from(componentName + '\0');

    const resultPtr = webs_render_to_string(enginePtr, nameBuffer, propsPtr);

    if (!resultPtr || resultPtr.ptr === 0)
      return 'Error: render_to_string returned null';
    const result = new CString(resultPtr).toString();
    webs_free_string(resultPtr);
    return result;
  }

  test('should render a simple static component', () => {
    const CompDef = {
      name: 'Static',
      template: `<div>Hello SSR</div>`,
      props: {},
    };
    webs_engine_register_component(
      enginePtr,
      Buffer.from('Static\0'),
      jsToValuePtr(CompDef),
    );
    const html = renderComponentSSR('Static');
    expect(html).toBe('<div>Hello SSR</div>');
  });

  test('should render component, merging props and initial state into context', () => {
    const CompDef = {
      name: 'UserPage',
      props: {
        user: {},
        id: {},
      },
      template: `
        <div>
          <h2>User: {{ user.name }}</h2>
          <p>ID: {{ id }}</p>
          <p>Status: {{ status }}</p>
        </div>
      `,
    };
    webs_engine_register_component(
      enginePtr,
      Buffer.from('UserPage\0'),
      jsToValuePtr(CompDef),
    );

    const props = {
      user: { name: 'Alice' },
      id: 42,
      status: 'Active',
    };

    const html = renderComponentSSR('UserPage', props).trim();

    expect(html).toInclude('<h2>User: Alice</h2>');
    expect(html).toInclude('<p>ID: 42</p>');
    expect(html).toInclude('<p>Status: Active</p>');
    expect(html).toBe(
      '<div><h2>User: Alice</h2><p>ID: 42</p><p>Status: Active</p></div>',
    );
  });

  test('should render <!--w-if--> comment for falsy if-block (hydration compat)', () => {
    const CompDef = {
      name: 'Conditional',
      props: { show: {} },
      template: `
        <div>
          {#if show}
            <p>Content is visible</p>
          {/if}
        </div>
      `,
    };
    webs_engine_register_component(
      enginePtr,
      Buffer.from('Conditional\0'),
      jsToValuePtr(CompDef),
    );

    let html = renderComponentSSR('Conditional', { show: true }).trim();
    expect(html).toBe('<div><p>Content is visible</p></div>');

    html = renderComponentSSR('Conditional', { show: false }).trim();
    expect(html).toBe('<div><!--w-if--></div>');
  });

  test('should render void (self-closing) tags', () => {
    const CompDef = {
      name: 'VoidTags',
      template: `<div><img src="test.png"><hr></div>`,
      props: {},
    };
    webs_engine_register_component(
      enginePtr,
      Buffer.from('VoidTags\0'),
      jsToValuePtr(CompDef),
    );
    const html = renderComponentSSR('VoidTags');
    expect(html).toBe('<div><img src="test.png"><hr></div>');
  });
});
