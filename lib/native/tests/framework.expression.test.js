import { test, expect, describe } from 'bun:test';
import { symbols } from '../bindings.js';
import { dlopen, CString } from 'bun:ffi';
import { resolve } from 'path';

const libPath = resolve(import.meta.dir, '../.webs.dylib');
const lib = dlopen(libPath, symbols);

const {
  webs_parse_expression,
  webs_json_encode,
  webs_free_value,
  webs_free_string,
} = lib.symbols;

function parseExpressionWithC(expression) {
  const expressionBuffer = Buffer.from(expression + '\0');

  const astPtr = webs_parse_expression(expressionBuffer);
  if (!astPtr || astPtr.ptr === 0) {
    throw new Error(
      `C function webs_parse_expression returned null pointer for expression: "${expression}".`,
    );
  }

  try {
    const jsonPtr = webs_json_encode(astPtr);
    if (!jsonPtr || jsonPtr.ptr === 0) {
      throw new Error('C function webs_json_encode returned null pointer.');
    }

    try {
      const jsonString = new CString(jsonPtr).toString();
      return JSON.parse(jsonString);
    } finally {
      webs_free_string(jsonPtr);
    }
  } finally {
    webs_free_value(astPtr);
  }
}

describe('Webs C Expression Parser', () => {
  test('should parse a number literal', () => {
    const ast = parseExpressionWithC('123.45');
    expect(ast).toEqual({ type: 'Literal', value: 123.45 });
  });

  test('should parse a string literal', () => {
    const ast = parseExpressionWithC("'hello world'");
    expect(ast).toEqual({ type: 'Literal', value: 'hello world' });
  });

  test('should parse a boolean literal', () => {
    const ast = parseExpressionWithC('true');
    expect(ast).toEqual({ type: 'Literal', value: true });
  });

  test('should parse a null literal', () => {
    const ast = parseExpressionWithC('null');
    expect(ast).toEqual({ type: 'Literal', value: null });
  });

  test('should parse an identifier', () => {
    const ast = parseExpressionWithC('myVar');
    expect(ast).toEqual({ type: 'Identifier', name: 'myVar' });
  });

  test('should parse a unary expression', () => {
    const ast = parseExpressionWithC('!isVisible');
    expect(ast).toEqual({
      type: 'UnaryExpression',
      operator: '!',
      argument: { type: 'Identifier', name: 'isVisible' },
    });
  });

  test('should parse a simple binary expression', () => {
    const ast = parseExpressionWithC('a + b');
    expect(ast).toEqual({
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Identifier', name: 'a' },
      right: { type: 'Identifier', name: 'b' },
    });
  });

  test('should respect operator precedence', () => {
    const ast = parseExpressionWithC('a + b * c');
    expect(ast.type).toBe('BinaryExpression');
    expect(ast.operator).toBe('+');
    expect(ast.right).toEqual({
      type: 'BinaryExpression',
      operator: '*',
      left: { type: 'Identifier', name: 'b' },
      right: { type: 'Identifier', name: 'c' },
    });
  });

  test('should handle parentheses to override precedence', () => {
    const ast = parseExpressionWithC('(a + b) * c');
    expect(ast.type).toBe('BinaryExpression');
    expect(ast.operator).toBe('*');
    expect(ast.left).toEqual({
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Identifier', name: 'a' },
      right: { type: 'Identifier', name: 'b' },
    });
  });

  test('should parse member access', () => {
    const ast = parseExpressionWithC('obj.prop');
    expect(ast).toEqual({
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'obj' },
      property: { type: 'Identifier', name: 'prop' },
      optional: false,
    });
  });

  test('should parse optional member access', () => {
    const ast = parseExpressionWithC('obj?.prop');
    expect(ast).toEqual({
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'obj' },
      property: { type: 'Identifier', name: 'prop' },
      optional: true,
    });
  });

  test('should parse computed member access', () => {
    const ast = parseExpressionWithC('arr[0]');
    expect(ast).toEqual({
      type: 'ComputedMemberExpression',
      object: { type: 'Identifier', name: 'arr' },
      property: { type: 'Literal', value: 0 },
      optional: false,
      computed: true,
    });
  });

  test('should parse a function call', () => {
    const ast = parseExpressionWithC('myFunc(a, 1)');
    expect(ast).toEqual({
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'myFunc' },
      arguments: [
        { type: 'Identifier', name: 'a' },
        { type: 'Literal', value: 1 },
      ],
      optional: false,
    });
  });

  test('should parse a call on a member expression', () => {
    const ast = parseExpressionWithC('console.log("hello")');
    expect(ast.type).toBe('CallExpression');
    expect(ast.callee.type).toBe('MemberExpression');
    expect(ast.callee.object.name).toBe('console');
    expect(ast.callee.property.name).toBe('log');
  });

  test('should parse a conditional (ternary) expression', () => {
    const ast = parseExpressionWithC('a > b ? a : b');
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

  test('should parse an assignment expression', () => {
    const ast = parseExpressionWithC('x = 10');
    expect(ast).toEqual({
      type: 'AssignmentExpression',
      left: { type: 'Identifier', name: 'x' },
      right: { type: 'Literal', value: 10 },
    });
  });

  test('should handle complex logical expressions', () => {
    const ast = parseExpressionWithC('a && b || c');
    expect(ast).toEqual({
      type: 'BinaryExpression',
      operator: '||',
      left: {
        type: 'BinaryExpression',
        operator: '&&',
        left: { type: 'Identifier', name: 'a' },
        right: { type: 'Identifier', name: 'b' },
      },
      right: { type: 'Identifier', name: 'c' },
    });
  });

  test('should parse an array literal', () => {
    const ast = parseExpressionWithC('[1, "two", true]');
    expect(ast).toEqual({
      type: 'ArrayLiteral',
      elements: [
        { type: 'Literal', value: 1 },
        { type: 'Literal', value: 'two' },
        { type: 'Literal', value: true },
      ],
    });
  });

  test('should parse an empty array literal', () => {
    const ast = parseExpressionWithC('[]');
    expect(ast).toEqual({
      type: 'ArrayLiteral',
      elements: [],
    });
  });

  test('should parse an object literal', () => {
    const ast = parseExpressionWithC('{ a: 1, "b": x }');
    expect(ast).toEqual({
      type: 'ObjectLiteral',
      properties: [
        {
          type: 'Property',
          key: { type: 'Identifier', name: 'a' },
          value: { type: 'Literal', value: 1 },
        },
        {
          type: 'Property',
          key: { type: 'Literal', value: 'b' },
          value: { type: 'Identifier', name: 'x' },
        },
      ],
    });
  });

  test('should parse an empty object literal', () => {
    const ast = parseExpressionWithC('{}');
    expect(ast).toEqual({
      type: 'ObjectLiteral',
      properties: [],
    });
  });

  test('should parse nested literals', () => {
    const ast = parseExpressionWithC('{ data: [ { id: 1 } ] }');
    expect(ast.type).toBe('ObjectLiteral');
    expect(ast.properties[0].key.name).toBe('data');
    const arrayLiteral = ast.properties[0].value;
    expect(arrayLiteral.type).toBe('ArrayLiteral');
    const objectInArray = arrayLiteral.elements[0];
    expect(objectInArray.type).toBe('ObjectLiteral');
    expect(objectInArray.properties[0].key.name).toBe('id');
    expect(objectInArray.properties[0].value.value).toBe(1);
  });
});
