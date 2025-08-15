import { describe, test, expect } from "bun:test";
import { pug } from "./pug-parser.js";

const p = (strings, ...values) => pug(strings, ...values);

describe("Pug Parser", () => {
  test("should parse a single element with id and classes", () => {
    const html = p`h1#title.heading.big Hello World`;
    expect(html).toBe('<h1 id="title" class="heading big">Hello World</h1>');
  });

  test("should parse nested elements based on indentation", () => {
    const template = `
div
  p
    span Nested Content
`;
    const html = p([template]);
    expect(html).toBe("<div><p><span>Nested Content</span></p></div>");
  });

  test("should parse attributes in parentheses", () => {
    const html = p`a(href="/home", title="Go Home") A Link`;
    expect(html).toBe('<a href="/home" title="Go Home">A Link</a>');
  });

  test("should handle a mix of id, class, and attributes", () => {
    const html = p`button#submit.btn.btn-primary(type="submit") Click Me`;
    expect(html).toBe(
      '<button id="submit" class="btn btn-primary" type="submit">Click Me</button>',
    );
  });

  test("should handle multi-line piped text", () => {
    const template = `
p
  | This is the first line.
  | This is the second line.
`;
    const html = p([template]);
    expect(html).toBe(
      "<p>This is the first line. This is the second line.</p>",
    );
  });

  test("should parse a more complex component-like structure", () => {
    const template = `
div#app.container
  header.header
    h1 My App
  main.content
    p Welcome to the application.
    div.form-group
      label(for="name") Name
      input#name(type="text", placeholder="Enter your name")
`;
    const html = p([template]);
    const expected =
      '<div id="app" class="container">' +
      '<header class="header"><h1>My App</h1></header>' +
      '<main class="content"><p>Welcome to the application.</p>' +
      '<div class="form-group"><label for="name">Name</label>' +
      '<input id="name" type="text" placeholder="Enter your name"></input>' +
      "</div></main></div>";
    expect(html).toBe(expected);
  });
});
