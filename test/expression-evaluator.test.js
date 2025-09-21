import { test, expect, describe } from 'bun:test';
import { tokenizeJs, parseJs } from '../lib/engine/expression-evaluator.js';

describe('JS Tokenizer', () => {
  test('should tokenize basic identifiers and literals', () => {
    const tokens = tokenizeJs('myVar 123 "hello"');
    expect(tokens).toEqual([
      { type: 'IDENTIFIER', value: 'myVar' },
      { type: 'NUMBER', value: 123 },
      { type: 'STRING', value: 'hello' },
    ]);
  });

  test('should tokenize operators', () => {
    const tokens = tokenizeJs('a + b * c / d');
    expect(tokens.map((t) => t.value)).toEqual([
      'a',
      '+',
      'b',
      '*',
      'c',
      '/',
      'd',
    ]);
  });

  test('should handle parentheses', () => {
    const tokens = tokenizeJs('(a + b)');
    expect(tokens.map((t) => t.type)).toEqual([
      'LPAREN',
      'IDENTIFIER',
      'OPERATOR',
      'IDENTIFIER',
      'RPAREN',
    ]);
  });

  test('should tokenize a complex expression', () => {
    const expression = 'user.name === "Webs" && count > 0';
    const tokens = tokenizeJs(expression);
    expect(tokens.map((t) => t.value)).toEqual([
      'user',
      '.',
      'name',
      '===',
      'Webs',
      '&&',
      'count',
      '>',
      0,
    ]);
  });

  test('should tokenize template literals with expressions', () => {
    const expression = '`Hello ${user.name}`';
    const tokens = tokenizeJs(expression);
    expect(tokens.map((t) => t.value)).toEqual([
      '`',
      'Hello ',
      '${',
      'user',
      '.',
      'name',
      '}',
      '`',
    ]);
  });

  test('should tokenize optional chaining and nullish coalescing', () => {
    const expression = 'user?.name ?? "Guest"';
    const tokens = tokenizeJs(expression);
    expect(tokens.map((t) => t.value)).toEqual([
      'user',
      '?.',
      'name',
      '??',
      'Guest',
    ]);
  });
});

describe('JS Parser', () => {
  test('should parse a simple member expression', () => {
    const ast = parseJs(tokenizeJs('user.name'));
    expect(ast).toEqual({
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'user' },
      property: { type: 'Identifier', name: 'name' },
      optional: false,
    });
  });

  test('should parse a binary expression', () => {
    const ast = parseJs(tokenizeJs('count + 1'));
    expect(ast).toEqual({
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Identifier', name: 'count' },
      right: { type: 'Literal', value: 1 },
    });
  });

  test('should respect operator precedence', () => {
    const ast = parseJs(tokenizeJs('a + b * c'));
    expect(ast.type).toBe('BinaryExpression');
    expect(ast.operator).toBe('+');
    expect(ast.right.type).toBe('BinaryExpression');
    expect(ast.right.operator).toBe('*');
  });

  test('should parse a conditional (ternary) expression', () => {
    const ast = parseJs(tokenizeJs('a > b ? a : b'));
    expect(ast).toEqual({
      type: 'ConditionalExpression',
      test: {
        type: 'BinaryExpression',
        operator: '>',
        left: { type: 'Identifier', name: 'a' },
        right: { type: 'Identifier', name: 'b' },
      },
      consequent: { type: 'Identifier', name: 'a' },
      alternate: { type: 'Identifier', name: 'b' },
    });
  });

  test('should parse a function call', () => {
    const ast = parseJs(tokenizeJs('myFunc(arg1, 2)'));
    expect(ast.type).toBe('CallExpression');
    expect(ast.callee.name).toBe('myFunc');
    expect(ast.arguments.length).toBe(2);
    expect(ast.arguments[0].name).toBe('arg1');
    expect(ast.arguments[1].value).toBe(2);
  });

  test('should parse an object literal', () => {
    const ast = parseJs(tokenizeJs('{ name: "Webs", age: 1 }'));
    expect(ast.type).toBe('ObjectExpression');
    expect(ast.properties.length).toBe(2);
    expect(ast.properties[0].key.name).toBe('name');
    expect(ast.properties[0].value.value).toBe('Webs');
    expect(ast.properties[1].key.name).toBe('age');
    expect(ast.properties[1].value.value).toBe(1);
  });

  test('should parse an assignment expression', () => {
    const ast = parseJs(tokenizeJs('count = 5'));
    expect(ast).toEqual({
      type: 'AssignmentExpression',
      left: { type: 'Identifier', name: 'count' },
      right: { type: 'Literal', value: 5 },
    });
  });
});

describe('JS Tokenizer - Extended', () => {
  test('should tokenize arrow functions', () => {
    const tokens = tokenizeJs('() => {}');
    expect(tokens.map((t) => t.value)).toEqual(['(', ')', '=>', '{', '}']);
  });

  test('should tokenize array literals', () => {
    const tokens = tokenizeJs("['a', 1, true]");
    expect(tokens.map((t) => t.value)).toEqual([
      '[',
      'a',
      ',',
      1,
      ',',
      'true',
      ']',
    ]);
  });
});

describe('JS Parser - Extended', () => {
  test('should parse an array literal', () => {
    const ast = parseJs(tokenizeJs('[1, "test"]'));
    expect(ast.type).toBe('ArrayExpression');
    expect(ast.elements.length).toBe(2);
    expect(ast.elements[0].value).toBe(1);
    expect(ast.elements[1].value).toBe('test');
  });

  test('should parse a unary expression', () => {
    const ast = parseJs(tokenizeJs('!isValid'));
    expect(ast).toEqual({
      type: 'UnaryExpression',
      operator: '!',
      argument: { type: 'Identifier', name: 'isValid' },
    });
  });

  test('should parse a simple arrow function', () => {
    const ast = parseJs(tokenizeJs('item => item.id'));
    expect(ast.type).toBe('ArrowFunctionExpression');
    expect(ast.params[0].name).toBe('item');
    expect(ast.body.type).toBe('MemberExpression');
  });

  test('should parse a computed member expression', () => {
    const ast = parseJs(tokenizeJs('items[0]'));
    expect(ast).toEqual({
      type: 'ComputedMemberExpression',
      object: { type: 'Identifier', name: 'items' },
      property: { type: 'Literal', value: 0 },
      optional: false,
      computed: true,
    });
  });
});
