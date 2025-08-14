import { tokenize_css, parse_css } from "./css-parser";
import { describe, test, expect } from "bun:test";

describe("CSS Parser", () => {
  test("should tokenize a simple CSS rule", () => {
    const tokens = tokenize_css("body { color: red; }");
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      "IDENT",
      "WHITESPACE",
      "LBRACE",
      "WHITESPACE",
      "IDENT",
      "COLON",
      "WHITESPACE",
      "IDENT",
      "SEMICOLON",
      "WHITESPACE",
      "RBRACE",
    ]);
  });

  test("should parse a CSS rule with multiple selectors", () => {
    const ast = parse_css(tokenize_css("h1, h2 { font-weight: bold; }"));
    expect(ast.rules.length).toBe(1);
    expect(ast.rules[0].selectors).toEqual(["h1", "h2"]);
    expect(ast.rules[0].declarations.length).toBe(1);
    expect(ast.rules[0].declarations[0].property).toBe("font-weight");
    expect(ast.rules[0].declarations[0].value).toBe("bold");
  });

  test("should parse attribute selectors and !important", () => {
    const ast = parse_css(
      tokenize_css(
        'input[type="text"] { border: 1px solid black !important; }',
      ),
    );
    expect(ast.rules.length).toBe(1);
    expect(ast.rules[0].selectors).toEqual(['input[type="text"]']);
    const decl = ast.rules[0].declarations[0];
    expect(decl.property).toBe("border");
    expect(decl.value).toBe("1px solid black");
    expect(decl.important).toBe(true);
  });
});
