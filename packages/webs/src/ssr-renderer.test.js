import { describe, test, expect, mock } from "bun:test";
import { h, Fragment, Text, Comment, Teleport } from "./renderer.js";
import { render_to_string } from "./ssr-renderer.js";

// Mock the compiler module
mock.module("./compiler/index.js", () => ({
  compile: (component) => {
    const { template, state } = component;
    const initialState = state ? state() : {};
    return function (_ctx) {
      const dynamicContent = template.match(/\{\{\s*(.*?)\s*\}\}/);
      if (dynamicContent) {
        const propName = dynamicContent[1];
        const content = _ctx[propName] || initialState[propName] || "";
        const staticPart = template.split(dynamicContent[0])[0];
        return h("div", null, [
          h(Text, null, staticPart),
          h(Text, null, String(content)),
        ]);
      }
      return h("div", { "data-template": template });
    };
  },
}));

describe("SSR Renderer: render_to_string", () => {
  test("should render a simple element", async () => {
    const vnode = h("p", { id: "foo" }, "hello world");
    const { html } = await render_to_string(vnode); // Destructure html from result
    expect(html).toBe('<p id="foo">hello world</p>');
  });

  test("should render nested elements", async () => {
    const vnode = h("div", null, [
      h("p", null, "hello"),
      h("span", null, "world"),
    ]);
    const { html } = await render_to_string(vnode);
    expect(html).toBe("<div><p>hello</p><span>world</span></div>");
  });

  test("should handle void elements like <img> and <br>", async () => {
    const vnode = h("div", null, [h("img", { src: "test.jpg" }), h("br")]);
    const { html } = await render_to_string(vnode);
    expect(html).toBe('<div><img src="test.jpg"><br></div>');
  });

  test("should handle Text, Comment, and Fragment nodes", async () => {
    const vnode = h(Fragment, null, [
      h(Comment, null, " a comment "),
      h(Text, null, "just text"),
    ]);
    const { html } = await render_to_string(vnode);
    expect(html).toBe("<!-- a comment -->just text");
  });

  test("should escape HTML in text content", async () => {
    const vnode = h("p", null, "<script>alert('xss')</script>");
    const { html } = await render_to_string(vnode);
    expect(html).toBe(
      "<p>&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;</p>",
    );
  });

  test("should escape HTML in attributes", async () => {
    const vnode = h("div", { "data-foo": '"bar" <baz>' });
    const { html } = await render_to_string(vnode);
    expect(html).toBe('<div data-foo="&quot;bar&quot; &lt;baz&gt;"></div>');
  });

  test("should ignore event handler props (e.g., onClick)", async () => {
    const vnode = h("button", { onClick: () => {} }, "Click me");
    const { html } = await render_to_string(vnode);
    expect(html).toBe("<button>Click me</button>");
  });

  test("should render a simple functional component", async () => {
    const MyComponent = {
      name: "MyComponent",
      render: () => h("div", { class: "component" }, "I am a component"),
    };
    const vnode = h(MyComponent);
    const { html } = await render_to_string(vnode);
    expect(html).toBe('<div class="component">I am a component</div>');
  });

  test("should render a component with props", async () => {
    const Greeting = {
      name: "Greeting",
      props: {
        name: { default: "World" },
      },
      render() {
        return h("p", null, `Hello, ${this.name}`);
      },
    };
    const vnode = h(Greeting, { name: "SSR" });
    const { html } = await render_to_string(vnode);
    expect(html).toBe("<p>Hello, SSR</p>");
  });

  test("should render a component with state and return the state", async () => {
    const Counter = {
      name: "Counter",
      state: () => ({ count: 5, msg: "hi" }),
      render() {
        return h("span", null, `Count: ${this.count}`);
      },
    };
    const vnode = h(Counter);
    const { html, state } = await render_to_string(vnode);
    expect(html).toBe("<span>Count: 5</span>");
    expect(state).toEqual({ count: 5, msg: "hi" }); // Also test the returned state
  });

  test("should render a component that uses a template string (with mocked compiler)", async () => {
    const TemplateComponent = {
      name: "TemplateComponent",
      state: () => ({ msg: "from template" }),
      template: `Message: {{ msg }}`,
    };
    const vnode = h(TemplateComponent);
    const { html } = await render_to_string(vnode);
    expect(html).toBe("<div>Message: from template</div>");
  });

  test("should handle nested components", async () => {
    const Child = {
      name: "Child",
      props: { content: {} },
      render() {
        return h("span", null, this.content);
      },
    };
    const Parent = {
      name: "Parent",
      render: () => h("div", null, [h(Child, { content: "nested" })]),
    };
    const vnode = h(Parent);
    const { html } = await render_to_string(vnode);
    expect(html).toBe("<div><span>nested</span></div>");
  });

  test("should render Teleport children in place on the server", async () => {
    const vnode = h(Teleport, { to: "#elsewhere" }, [
      h("p", null, "teleported content"),
    ]);
    const { html } = await render_to_string(vnode);
    expect(html).toBe("<p>teleported content</p>");
  });
});
