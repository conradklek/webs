import { compile, Compiler, NODE_TYPES, ATTR_TYPES } from "./index";
import { describe, test, expect, mock } from "bun:test";
import { Text, Fragment } from "../renderer";
import { parse_html } from "./html-parser";

describe("Template Compiler", () => {
  const compileAndGetAst = (template, components = {}) => {
    const compiler = new Compiler({ template, components });
    return compiler._transform_node(compiler.definition.template);
  };

  test("should transform element with static and dynamic attributes", () => {
    const ast = new Compiler({
      template: '<div id="a" :class="b" @click="c"></div>',
    })._transform_node(parse_html('<div id="a" :class="b" @click="c"></div>'));
    const props = ast.children[0].properties;
    expect(props).toContainEqual({
      type: ATTR_TYPES.STATIC,
      name: "id",
      value: "a",
    });
    expect(props).toContainEqual(
      expect.objectContaining({ type: ATTR_TYPES.DIRECTIVE, name: "class" }),
    );
    expect(props).toContainEqual(
      expect.objectContaining({
        type: ATTR_TYPES.EVENT_HANDLER,
        name: "onClick",
      }),
    );
  });

  test("should transform text and interpolations", () => {
    const ast = new Compiler({
      template: "<p>Hello {{ name }}!</p>",
    })._transform_node(parse_html("<p>Hello {{ name }}!</p>"));
    const children = ast.children[0].children;
    expect(children.length).toBe(1);
    const fragment = children[0];
    expect(fragment.type).toBe(NODE_TYPES.FRAGMENT);
    expect(fragment.children.length).toBe(3);
    expect(fragment.children[0].type).toBe(NODE_TYPES.TEXT);
    expect(fragment.children[0].value).toBe("Hello ");
    expect(fragment.children[1].type).toBe(NODE_TYPES.INTERPOLATION);
    expect(fragment.children[1].expression.name).toBe("name");
    expect(fragment.children[2].type).toBe(NODE_TYPES.TEXT);
    expect(fragment.children[2].value).toBe("!");
  });

  test("should transform w-if, w-else-if, w-else", () => {
    const template = `
      <div w-if="a">A</div>
      <p w-else-if="b">B</p>
      <span w-else>C</span>
    `;
    const ast = new Compiler({ template })._transform_node(
      parse_html(template),
    );
    const ifNode = ast.children.find((c) => c.type === NODE_TYPES.IF);
    expect(ifNode).toBeDefined();
    expect(ifNode.branches.length).toBe(3);
    expect(ifNode.branches[0].condition.name).toBe("a");
    expect(ifNode.branches[0].node.tag_name).toBe("div");
    expect(ifNode.branches[1].condition.name).toBe("b");
    expect(ifNode.branches[1].node.tag_name).toBe("p");
    expect(ifNode.branches[2].condition).toBeNull();
    expect(ifNode.branches[2].node.tag_name).toBe("span");
  });

  test("should transform w-for", () => {
    const template = '<li w-for="item in items">{{ item }}</li>';
    const ast = new Compiler({ template })._transform_node(
      parse_html(template),
    );
    const forNode = ast.children[0];
    expect(forNode.type).toBe(NODE_TYPES.FOR);
    expect(forNode.source.name).toBe("items");
    expect(forNode.value).toBe("item");
    expect(forNode.key).toBeUndefined();
    expect(forNode.children[0].tag_name).toBe("li");
  });

  test("should transform w-for with (value, key)", () => {
    const template = '<li w-for="(item, i) in items">{{ i }}: {{ item }}</li>';
    const ast = new Compiler({ template })._transform_node(
      parse_html(template),
    );
    const forNode = ast.children[0];
    expect(forNode.type).toBe(NODE_TYPES.FOR);
    expect(forNode.source.name).toBe("items");
    expect(forNode.value).toBe("item");
    expect(forNode.key).toBe("i");
  });

  test("should transform w-model", () => {
    const template = '<input w-model="searchText">';
    const ast = new Compiler({ template })._transform_node(
      parse_html(template),
    );
    const props = ast.children[0].properties;
    const valueProp = props.find((p) => p.name === "value");
    const onInputProp = props.find((p) => p.name === "oninput");
    expect(valueProp).toBeDefined();
    expect(valueProp.type).toBe(ATTR_TYPES.DIRECTIVE);
    expect(valueProp.expression.name).toBe("searchText");
    expect(onInputProp).toBeDefined();
    expect(onInputProp.type).toBe(ATTR_TYPES.EVENT_HANDLER);
    expect(onInputProp.expression.type).toBe("AssignmentExpression");
  });

  test("should identify and transform components", () => {
    const template = "<div><MyComponent /></div>";
    const ast = new Compiler({
      template,
      components: { MyComponent: {} },
    })._transform_node(parse_html(template));
    const componentNode = ast.children[0].children[0];
    expect(componentNode.type).toBe(NODE_TYPES.COMPONENT);
    expect(componentNode.tag_name).toBe("MyComponent");
  });
});

describe("Render Function Generation", () => {
  test("should generate a function that returns a VNode tree", () => {
    const renderFn = compile({ template: "<div><p>Hi</p></div>" });
    const vnode = renderFn({
      /* _ctx */
    });

    expect(vnode.type).toBe("div");
    expect(vnode.children[0].type).toBe("p");
    expect(vnode.children[0].children[0].type).toBe(Text);
    expect(vnode.children[0].children[0].children).toBe("Hi");
  });

  test("should correctly render w-if logic", () => {
    const renderFn = compile({
      template: '<div w-if="show">Yes</div><div w-else>No</div>',
    });

    const vnode1 = renderFn({ show: true });
    expect(vnode1.type).toBe("div");
    expect(vnode1.children[0].children).toBe("Yes");

    const vnode2 = renderFn({ show: false });
    expect(vnode2.type).toBe("div");
    expect(vnode2.children[0].children).toBe("No");
  });

  test("should correctly render w-for logic", () => {
    const renderFn = compile({
      template: '<li w-for="item in items">{{ item }}</li>',
    });
    const vnode = renderFn({ items: ["a", "b"] });

    expect(vnode.type).toBe(Fragment);
    expect(vnode.children.length).toBe(2);
    expect(vnode.children[0].type).toBe("li");
    expect(vnode.children[0].children[0].children).toBe("a");
    expect(vnode.children[1].children[0].children).toBe("b");
  });

  test("should handle event handlers with modifiers", () => {
    const renderFn = compile({
      template: '<button @click.prevent="doSomething"></button>',
    });

    const mockHandler = mock(() => {});
    const mockEvent = {
      preventDefault: mock(() => {}),
      stopPropagation: mock(() => {}),
    };

    const vnode = renderFn({ doSomething: mockHandler });
    vnode.props.onClick(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(mockEvent);
  });
});
