import { test, expect, describe } from 'bun:test';
import { parseHtml } from './template-parser.js';

describe('HTML Parser', () => {
  test('should parse a simple element', () => {
    const ast = parseHtml('<div>Hello</div>');
    expect(ast.children.length).toBe(1);
    expect(ast.children[0].tagName).toBe('div');
    expect(ast.children[0].children[0].content).toBe('Hello');
  });

  test('should parse attributes', () => {
    const ast = parseHtml('<div class="foo" id="bar"></div>');
    const element = ast.children[0];
    expect(element.attributes).toEqual([
      { name: 'class', value: 'foo' },
      { name: 'id', value: 'bar' },
    ]);
  });

  test('should parse nested elements', () => {
    const ast = parseHtml('<div><p>Nested</p></div>');
    const div = ast.children[0];
    const p = div.children[0];
    expect(p.tagName).toBe('p');
    expect(p.children[0].content).toBe('Nested');
  });

  test('should handle self-closing tags', () => {
    const ast = parseHtml('<div><br/><img src="test.png"/></div>');
    const div = ast.children[0];
    expect(div.children.length).toBe(2);
    expect(div.children[0].tagName).toBe('br');
    expect(div.children[1].tagName).toBe('img');
  });

  test('should parse an #if block', () => {
    const ast = parseHtml('{#if condition}<div>True</div>{/if}');
    expect(ast.children[0].type).toBe('ifBlock');
    expect(ast.children[0].test).toBe('condition');
    expect(ast.children[0].children[0].tagName).toBe('div');
  });

  test('should parse a nested #if block', () => {
    const ast = parseHtml('{#if c1}{#if c2}<p></p>{/if}{/if}');
    const outerIf = ast.children[0];
    expect(outerIf.type).toBe('ifBlock');
    expect(outerIf.test).toBe('c1');
    const innerIf = outerIf.children[0];
    expect(innerIf.type).toBe('ifBlock');
    expect(innerIf.test).toBe('c2');
  });

  test('should parse an #each block', () => {
    const ast = parseHtml('{#each items as item}<li>{{ item }}</li>{/each}');
    const eachBlock = ast.children[0];
    expect(eachBlock.type).toBe('eachBlock');
    expect(eachBlock.expression).toBe('items');
    expect(eachBlock.item).toBe('item');
    expect(eachBlock.children[0].tagName).toBe('li');
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
    const ast = parseHtml(template);
    expect(ast.children.length).toBe(3);
    expect(ast.children[0].type).toBe('ifBlock');
    expect(ast.children[0].test).toBe('a > 10');
    expect(ast.children[1].type).toBe('elseIfBlock');
    expect(ast.children[1].test).toBe('a > 5');
    expect(ast.children[2].type).toBe('elseBlock');
  });

  test('should parse an #each block with a key', () => {
    const ast = parseHtml(
      '{#each items as item (item.id)}<div>{{item.name}}</div>{/each}',
    );
    const eachBlock = ast.children[0];
    expect(eachBlock.type).toBe('eachBlock');
    expect(eachBlock.expression).toBe('items');
    expect(eachBlock.item).toBe('item');
    expect(eachBlock.key).toBe('item.id');
  });

  test('should parse boolean attributes', () => {
    const ast = parseHtml('<input type="checkbox" disabled>');
    const input = ast.children[0];
    expect(input.attributes).toEqual([
      { name: 'type', value: 'checkbox' },
      { name: 'disabled', value: true },
    ]);
  });

  test('should parse comments', () => {
    const ast = parseHtml('<div><!-- this is a comment --></div>');
    const div = ast.children[0];
    expect(div.children[0].type).toBe('comment');
    expect(div.children[0].content).toBe(' this is a comment ');
  });

  test('should handle unclosed tags gracefully', () => {
    const ast = parseHtml('<div><p>hello<span>world</div>');
    const div = ast.children[0];
    expect(div.tagName).toBe('div');
    const p = div.children[0];
    expect(p.tagName).toBe('p');
    expect(p.children[0].content).toBe('hello');
    const span = p.children[1];
    expect(span.tagName).toBe('span');
    expect(span.children[0].content).toBe('world');
  });
});
