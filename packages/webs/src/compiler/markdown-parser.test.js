import { parse_markdown } from "./markdown-parser";
import { describe, test, expect } from "bun:test";

describe("Markdown Parser", () => {
  test("should parse headings and paragraphs", () => {
    const md = "# Title\n\nHello world.";
    const html = parse_markdown(md);
    expect(html).toBe("<h1>Title</h1>\n<p>Hello world.</p>");
  });

  test("should parse inline styles: bold, italic, del", () => {
    const md = "**bold** *italic* ~~strike~~";
    const html = parse_markdown(md);
    expect(html).toBe(
      "<p><strong>bold</strong> <em>italic</em> <del>strike</del></p>",
    );
  });

  test("should parse lists (ul, ol, task)", () => {
    const md = "- one\n- two\n  - [x] task";
    const html = parse_markdown(md);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain(
      '<li>two\n<ul><li><input type="checkbox" checked disabled> task</li></ul></li>',
    );
  });

  test("should parse links and images", () => {
    const md = "[link](http://a.com) ![alt](http://b.com/img.png)";
    const html = parse_markdown(md);
    expect(html).toBe(
      '<p><a href="http://a.com">link</a> <img src="http://b.com/img.png" alt="alt"></p>',
    );
  });

  test("should parse fenced code blocks", () => {
    const md = "```js\nconst a = 1;\n```";
    const html = parse_markdown(md);
    expect(html).toBe(
      '<pre><code class="language-js">const a = 1;</code></pre>',
    );
  });

  test("should parse tables", () => {
    const md = "| Head 1 | Head 2 |\n|:---|---:|\n| Cell 1 | Cell 2 |";
    const html = parse_markdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain('<th style="text-align:left">Head 1</th>');
    expect(html).toContain('<th style="text-align:right">Head 2</th>');
    expect(html).toMatch(/<td[^>]*>Cell 1<\/td>/);
  });

  test("should parse footnotes", () => {
    const md =
      "Here is a footnote reference[^1].\n\n[^1]: Here is the footnote.";
    const html = parse_markdown(md);
    expect(html).toContain('<sup><a href="#fn-1" id="fnref-1">1</a></sup>');
    expect(html).toContain(
      '<li id="fn-1">Here is the footnote. <a href="#fnref-1" class="footnote-backref">&#8617;</a></li>',
    );
  });
});
