import { tokenize_html, build_tree, parse_html } from "./html-parser";
import { describe, test, expect } from "bun:test";

describe("HTML Parser", () => {
  test("should tokenize basic HTML", () => {
    const tokens = tokenize_html('<div id="foo">bar</div>');
    expect(tokens).toEqual([
      {
        type: "tagStart",
        tagName: "div",
        attributes: [{ name: "id", value: "foo" }],
      },
      { type: "text", content: "bar" },
      { type: "tagEnd", tagName: "div" },
    ]);
  });

  test("should build a tree from tokens", () => {
    const tokens = tokenize_html("<div><p>hello</p></div>");
    const ast = build_tree(tokens);
    expect(ast.type).toBe("root");
    expect(ast.children.length).toBe(1);
    expect(ast.children[0].tagName).toBe("div");
    expect(ast.children[0].children[0].tagName).toBe("p");
    expect(ast.children[0].children[0].children[0].content).toBe("hello");
  });

  test("should handle self-closing and void elements", () => {
    const ast = parse_html('<br><input type="text">');
    expect(ast.children.length).toBe(2);
    expect(ast.children[0].tagName).toBe("br");
    expect(ast.children[0].children.length).toBe(0);
    expect(ast.children[1].tagName).toBe("input");
  });

  test("should handle comments", () => {
    const ast = parse_html("<!-- this is a comment -->");
    expect(ast.children.length).toBe(1);
    expect(ast.children[0].type).toBe("comment");
    expect(ast.children[0].content).toBe(" this is a comment ");
  });

  test("should handle unclosed tags gracefully", () => {
    const ast = parse_html("<div><p>hello");
    expect(ast.children[0].tagName).toBe("div");
    expect(ast.children[0].children[0].tagName).toBe("p");
    expect(ast.children[0].children[0].children[0].content).toBe("hello");
  });
});
