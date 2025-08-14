import { tokenize_expression, parse_expression } from "./js-parser";
import { describe, test, expect } from "bun:test";

describe("JavaScript Expression Parser", () => {
  test("should tokenize a simple expression", () => {
    const tokens = tokenize_expression("a + 1");
    expect(tokens).toEqual([
      { type: "IDENTIFIER", value: "a" },
      { type: "OPERATOR", value: "+" },
      { type: "NUMBER", value: 1 },
    ]);
  });

  test("should parse a complex expression with correct precedence", () => {
    const ast = parse_expression(tokenize_expression("a * (b + c) / 2"));
    expect(ast).toEqual({
      type: "BinaryExpression",
      operator: "/",
      left: {
        type: "BinaryExpression",
        operator: "*",
        left: { type: "Identifier", name: "a" },
        right: {
          type: "BinaryExpression",
          operator: "+",
          left: { type: "Identifier", name: "b" },
          right: { type: "Identifier", name: "c" },
        },
      },
      right: { type: "Literal", value: 2 },
    });
  });

  test("should parse member access and call expressions", () => {
    const ast = parse_expression(tokenize_expression("foo.bar(baz)"));
    expect(ast).toEqual({
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "foo" },
        property: { type: "Identifier", name: "bar" },
        optional: false,
      },
      arguments: [{ type: "Identifier", name: "baz" }],
      optional: false,
    });
  });

  test("should parse a ternary expression", () => {
    const ast = parse_expression(tokenize_expression("a ? b : c"));
    expect(ast.type).toBe("ConditionalExpression");
    expect(ast.test.name).toBe("a");
    expect(ast.consequent.name).toBe("b");
    expect(ast.alternate.name).toBe("c");
  });

  test("should parse an assignment expression", () => {
    const ast = parse_expression(tokenize_expression("count = count + 1"));
    expect(ast.type).toBe("AssignmentExpression");
    expect(ast.left.name).toBe("count");
    expect(ast.right.type).toBe("BinaryExpression");
  });

  test("should throw on unrecognized characters", () => {
    expect(() => tokenize_expression("a ^ b")).toThrow();
  });

  test("should throw on syntax errors", () => {
    expect(() => parse_expression(tokenize_expression("a +"))).toThrow();
    expect(() => parse_expression(tokenize_expression("(a + b"))).toThrow();
  });
});
