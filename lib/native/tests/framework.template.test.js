import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_parse_template,
  webs_json_encode,
  webs_free_value,
  webs_free_string,
} = lib.symbols;

function parseHtmlWithC(html) {
  const htmlBuffer = Buffer.from(html + '\0');
  const statusPtr = Buffer.alloc(4);

  const astPtr = webs_parse_template(htmlBuffer, statusPtr);
  const status = statusPtr.readInt32LE(0);

  if (status !== 0) {
    if (astPtr) webs_free_value(astPtr);
    throw new Error(
      `C function webs_parse_template failed with status: ${status}`,
    );
  }

  if (!astPtr || astPtr.ptr === 0) {
    throw new Error('C function webs_parse_template returned null pointer.');
  }

  try {
    const jsonPtr = webs_json_encode(astPtr);
    if (!jsonPtr || jsonPtr.ptr === 0) {
      throw new Error('C function webs_json_encode returned null pointer.');
    }

    try {
      const jsonString = new CString(jsonPtr).toString();
      const parsed = JSON.parse(jsonString);
      const normalizedJsonString = JSON.stringify(parsed).replace(
        /"key":"null"/g,
        '"key":null',
      );
      return JSON.parse(normalizedJsonString);
    } finally {
      webs_free_string(jsonPtr);
    }
  } finally {
    webs_free_value(astPtr);
  }
}

describe('Webs C HTML Parser', () => {
  test('should parse a simple element', () => {
    const ast = parseHtmlWithC('<div>Hello</div>');
    expect(ast.children.length).toBe(1);
    expect(ast.children[0].tagName).toBe('div');
    expect(ast.children[0].children[0].content).toBe('Hello');
  });

  test('should parse attributes', () => {
    const ast = parseHtmlWithC('<div class="foo" id="bar"></div>');
    const element = ast.children[0];
    expect(element.attributes).toEqual([
      { name: 'class', value: 'foo' },
      { name: 'id', value: 'bar' },
    ]);
  });

  test('should parse event listener attributes', () => {
    const ast = parseHtmlWithC('<button @click="increment"></button>');
    const element = ast.children[0];
    expect(element.attributes).toEqual([
      { name: '@click', value: 'increment' },
    ]);
  });

  test('should parse nested elements', () => {
    const ast = parseHtmlWithC('<div><p>Nested</p></div>');
    const div = ast.children[0];
    const p = div.children[0];
    expect(p.tagName).toBe('p');
    expect(p.children[0].content).toBe('Nested');
  });

  test('should handle self-closing tags', () => {
    const ast = parseHtmlWithC('<div><br/><img src="test.png"/></div>');
    const div = ast.children[0];
    expect(div.children.length).toBe(2);
    expect(div.children[0].tagName).toBe('br');
    expect(div.children[1].tagName).toBe('img');
  });

  test('should parse an #if block', () => {
    const ast = parseHtmlWithC('{#if condition}<div>True</div>{/if}');
    const ifBlock = ast.children[0];
    expect(ifBlock.type).toBe('ifBlock');
    expect(ifBlock.test).toBe('condition');
    expect(ifBlock.children[0].tagName).toBe('div');
  });

  test('should parse an #if/{:else if}/{:else} chain', () => {
    const template = `
      {#if a > 10}
        <p>Greater than 10</p>
      {:else if a > 5}
        <span>Greater than 5</span>
      {:else}
        <b>Less than or equal to 5</b>
      {/if}
    `;
    const ast = parseHtmlWithC(template);
    expect(ast.children.length).toBe(3);
    expect(ast.children[0].type).toBe('ifBlock');
    expect(ast.children[0].test).toBe('a > 10');
    expect(ast.children[1].type).toBe('elseIfBlock');
    expect(ast.children[1].test).toBe('a > 5');
    expect(ast.children[2].type).toBe('elseBlock');
  });

  test('should parse an #each block', () => {
    const ast = parseHtmlWithC(
      '{#each items as item}<li>{{ item }}</li>{/each}',
    );
    const eachBlock = ast.children[0];
    expect(eachBlock.type).toBe('eachBlock');
    expect(eachBlock.expression).toBe('items');
    expect(eachBlock.item).toBe('item');
    expect(eachBlock.children[0].tagName).toBe('li');
    expect(eachBlock.children[0].children[0].content).toBe('{{ item }}');
  });

  test('should parse an #each block with a key', () => {
    const ast = parseHtmlWithC(
      '{#each items as item (item.id)}<div>{{item.name}}</div>{/each}',
    );
    const eachBlock = ast.children[0];
    expect(eachBlock.type).toBe('eachBlock');
    expect(eachBlock.expression).toBe('items');
    expect(eachBlock.item).toBe('item');
    expect(eachBlock.key).toBe('item.id');
  });

  test('should parse boolean attributes', () => {
    const ast = parseHtmlWithC('<input type="checkbox" disabled>');
    const input = ast.children[0];
    expect(input.attributes).toEqual([
      { name: 'type', value: 'checkbox' },
      { name: 'disabled', value: true },
    ]);
  });

  test('should parse comments', () => {
    const ast = parseHtmlWithC('<div><!-- this is a comment --></div>');
    const div = ast.children[0];
    expect(div.children[0].type).toBe('comment');
    expect(div.children[0].content).toBe(' this is a comment ');
  });

  test('should handle unclosed tags gracefully', () => {
    const ast = parseHtmlWithC('<div><p>hello<span>world</div>');
    const div = ast.children[0];
    expect(div.tagName).toBe('div');
    const p = div.children[0];
    expect(p.tagName).toBe('p');
    expect(p.children[0].content).toBe('hello');
    const span = p.children[1];
    expect(span.tagName).toBe('span');
    expect(span.children[0].content).toBe('world');
  });

  test('should parse nested control flow blocks', () => {
    const template = `
      {#each users as user (user.id)}
        {#if user.isActive}
          <li>{{ user.name }}</li>
        {/if}
      {/each}
    `;
    const ast = parseHtmlWithC(template);
    const eachBlock = ast.children[0];
    expect(eachBlock.type).toBe('eachBlock');
    const ifBlock = eachBlock.children[0];
    expect(ifBlock.type).toBe('ifBlock');
    expect(ifBlock.test).toBe('user.isActive');
    expect(ifBlock.children[0].tagName).toBe('li');
  });

  test('should handle attributes without quotes', () => {
    const ast = parseHtmlWithC('<div id=my-id class=foo></div>');
    const element = ast.children[0];
    expect(element.attributes).toEqual([
      { name: 'id', value: 'my-id' },
      { name: 'class', value: 'foo' },
    ]);
  });

  test('should parse interpolation inside text nodes', () => {
    const ast = parseHtmlWithC('<p>Hello, {{ name }}!</p>');
    const p = ast.children[0];
    expect(p.children[0].type).toBe('text');
    expect(p.children[0].content).toBe('Hello, {{ name }}!');
  });

  test('should handle an empty #each block correctly', () => {
    const ast = parseHtmlWithC('{#each items as item}{/each}');
    const eachBlock = ast.children[0];
    expect(eachBlock.type).toBe('eachBlock');
    expect(eachBlock.expression).toBe('items');
    expect(eachBlock.item).toBe('item');
    expect(eachBlock.children.length).toBe(0);
  });

  test('should handle malformed directives gracefully', () => {
    const ast = parseHtmlWithC(
      '<div>{#if condition without closing brace</div>',
    );
    const div = ast.children[0];
    expect(div.tagName).toBe('div');
  });
});
