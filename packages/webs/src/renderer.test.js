import { describe, test, expect, mock } from "bun:test";
import {
  create_renderer,
  create_vnode,
  h,
  get_sequence,
  create_component,
  Fragment,
  Text,
  Comment,
  Teleport,
  DOM_element,
  DOM_text_node,
  DOM_comment_node,
} from "./renderer";

const createMockHost = () => {
  const host = {
    create_element: mock((tag) => new DOM_element(tag)),
    create_text: mock((text) => new DOM_text_node(text)),
    create_comment: mock((text) => new DOM_comment_node(text)),
    patch_prop: mock((el, key, _, nextVal) => {
      if (nextVal === null) {
        el.remove_attribute(key);
      } else if (key === "class") {
        el.set_attribute("class", nextVal);
      } else {
        el.set_attribute(key, nextVal);
      }
    }),
    insert: mock((el, parent, anchor) => {
      if (el) {
        el.parent_node = parent;
      }
      parent.insert_before(el, anchor);
    }),
    remove: mock((el) => {
      el?.parent_node?.remove_child(el);
    }),
    set_element_text: mock((el, text) => {
      el.text_content = text;
    }),
    query_selector: mock((selector) => {
      if (!host.root) host.root = new DOM_element("body");
      return host.root.query_selector(selector) || host.root;
    }),
    root: new DOM_element("body"),
  };
  return host;
};

describe("Renderer Internals", () => {
  describe("get_sequence()", () => {
    test("should return the longest increasing subsequence of INDICES", () => {
      expect(get_sequence([2, 3, 1, 5, 6, 8, 7, 9, 4])).toEqual([
        0, 1, 3, 4, 6, 7,
      ]);
      expect(get_sequence([1, 2, 3, 4, 5])).toEqual([0, 1, 2, 3, 4]);
      expect(get_sequence([5, 4, 3, 2, 1])).toEqual([4]);
      expect(get_sequence([3, 1, 2])).toEqual([1, 2]);
    });
    test("should handle empty and single-element arrays", () => {
      expect(get_sequence([])).toEqual([]);
      expect(get_sequence([1])).toEqual([0]);
    });
  });

  describe("create_component()", () => {
    test("should initialize instance with props, state, and methods", () => {
      const componentDef = {
        props: {
          msg: { default: "hello" },
        },
        state: () => ({ count: 1 }),
        methods: {
          increment() {
            this.count++;
          },
        },
      };
      const vnode = create_vnode(componentDef, { msg: "world" });
      const instance = create_component(vnode, null);

      expect(instance.props.msg).toBe("world");
      expect(instance.ctx.count).toBe(1);
      expect(typeof instance.ctx.increment).toBe("function");

      instance.ctx.increment();
      expect(instance.ctx.count).toBe(2);
    });

    test("should call setup and merge its results", () => {
      const setup = mock((props) => ({ setupVal: props.msg.length }));
      const componentDef = {
        props: { msg: {} },
        setup,
      };
      const vnode = create_vnode(componentDef, { msg: "test" });
      const instance = create_component(vnode, null);

      expect(setup).toHaveBeenCalledWith({ msg: "test" }, expect.any(Object));
      expect(instance.ctx.setupVal).toBe(4);
    });
  });

  describe("DOM Helpers", () => {
    test("DOM_element should manage attributes and children", () => {
      const el = new DOM_element("div");
      el.set_attribute("id", "test");
      el.class_list.add("foo", "bar");
      const child = new DOM_text_node("hello");
      el.insert_before(child, null);

      expect(el.get_attribute("id")).toBe("test");
      expect(el.class_list.contains("foo")).toBe(true);
      expect(el.outer_html).toBe('<div id="test" class="foo bar">hello</div>');
    });

    test("DOM_element.query_selector should find matching children", () => {
      const parent = new DOM_element("div");
      const child = new DOM_element("p");
      child.set_attribute("id", "find-me");
      parent.insert_before(child, null);

      expect(parent.query_selector("#find-me")).toBe(child);
      expect(parent.query_selector(".not-found")).toBe(null);
    });
  });
});

describe("Renderer Patching Logic", () => {
  test("h() should be an alias for create_vnode()", () => {
    const vnode1 = create_vnode("div", { id: "a" }, "hi");
    const vnode2 = h("div", { id: "a" }, "hi");
    expect(vnode1).toEqual(vnode2);
  });

  test("should create and mount a simple element", () => {
    const host = createMockHost();
    const renderer = create_renderer(host);
    const container = new DOM_element("div");
    const vnode = create_vnode("p", { id: "foo" }, "hello");

    renderer.patch(null, vnode, container);

    expect(host.create_element).toHaveBeenCalledWith("p");
    expect(host.patch_prop).toHaveBeenCalledWith(
      expect.any(DOM_element),
      "id",
      undefined,
      "foo",
    );
    expect(host.set_element_text).toHaveBeenCalledWith(
      expect.any(DOM_element),
      "hello",
    );
    expect(host.insert).toHaveBeenCalledTimes(1);

    expect(container.child_nodes[0].tag_name).toBe("P");
    expect(container.child_nodes[0].get_attribute("id")).toBe("foo");
    expect(container.child_nodes[0].text_content).toBe("hello");
  });

  test("should patch element props and remove old ones", () => {
    const host = createMockHost();
    const renderer = create_renderer(host);
    const container = new DOM_element("div");
    const vnode1 = create_vnode("p", { id: "foo", "data-val": "a" });
    const vnode2 = create_vnode("p", { id: "bar", class: "b" });

    renderer.patch(null, vnode1, container);
    renderer.patch(vnode1, vnode2, container);

    expect(host.patch_prop).toHaveBeenCalledWith(
      expect.any(Object),
      "id",
      "foo",
      "bar",
    );
    expect(host.patch_prop).toHaveBeenCalledWith(
      expect.any(Object),
      "class",
      undefined,
      "b",
    );
    expect(host.patch_prop).toHaveBeenCalledWith(
      expect.any(Object),
      "data-val",
      "a",
      null,
    );
  });

  test("should handle Text, Comment, and Fragment nodes", () => {
    const host = createMockHost();
    const renderer = create_renderer(host);
    const container = new DOM_element("div");
    const vnode = create_vnode(Fragment, null, [
      create_vnode(Comment, null, " a comment "),
      create_vnode(Text, null, "some text"),
    ]);

    renderer.patch(null, vnode, container);

    expect(host.create_comment).toHaveBeenCalledWith(" a comment ");
    expect(host.create_text).toHaveBeenCalledWith("some text");
    expect(container.child_nodes.length).toBe(2);
    expect(container.child_nodes[0].outer_html).toBe("<!-- a comment -->");
    expect(container.child_nodes[1].text_content).toBe("some text");
  });

  test("should handle Teleport", () => {
    const host = createMockHost();
    const renderer = create_renderer(host);
    const container = new DOM_element("div");
    const teleportTarget = new DOM_element("div");
    teleportTarget.set_attribute("id", "teleport-target");
    host.root.insert_before(teleportTarget, null);

    const vnode = create_vnode(Teleport, { to: "#teleport-target" }, [
      create_vnode("p", null, "teleported"),
    ]);

    renderer.patch(null, vnode, container);

    expect(host.query_selector).toHaveBeenCalledWith("#teleport-target");
    expect(teleportTarget.text_content).toBe("teleported");
    expect(container.child_nodes.length).toBe(0);
  });

  describe("Unkeyed Children", () => {
    test("should mount new children and unmount extra old children", () => {
      const host = createMockHost();
      const renderer = create_renderer(host);
      const container = new DOM_element("div");
      const pVNode = create_vnode("p");
      const spanVNode = create_vnode("span");
      const vnode1 = create_vnode("div", null, [pVNode, spanVNode]);
      const vnode2 = create_vnode("div", null, [pVNode, create_vnode("b")]);

      renderer.patch(null, vnode1, container);
      const parentEl = container.child_nodes[0];
      expect(parentEl.child_nodes.length).toBe(2);
      expect(parentEl.child_nodes[1].tag_name).toBe("SPAN");

      renderer.patch(vnode1, vnode2, container);
      expect(host.remove).toHaveBeenCalledWith(spanVNode.el);
      expect(host.create_element).toHaveBeenCalledWith("b");
      expect(parentEl.child_nodes.length).toBe(2);
      expect(parentEl.child_nodes[1].tag_name).toBe("B");
    });
  });

  describe("Keyed Children", () => {
    test("should correctly reorder, mount, and unmount keyed children", () => {
      const host = createMockHost();
      const renderer = create_renderer(host);
      const container = new DOM_element("div");

      const vnode1 = create_vnode("div", null, [
        h("p", { key: "a" }, "A"),
        h("p", { key: "b" }, "B"),
        h("p", { key: "c" }, "C"),
      ]);
      const vnode2 = create_vnode("div", null, [
        h("p", { key: "c" }, "C"),
        h("p", { key: "a" }, "A"),
        h("p", { key: "d" }, "D"),
      ]);

      renderer.patch(null, vnode1, container);
      const parentEl = container.child_nodes[0];
      expect(parentEl.text_content).toBe("ABC");

      renderer.patch(vnode1, vnode2, container);
      expect(parentEl.text_content).toBe("CAD");

      expect(host.remove).toHaveBeenCalledWith(vnode1.children[1].el);
      expect(host.create_element).toHaveBeenCalledWith("p");

      const insertCalls = host.insert.mock.calls;
      const movedOrNewElements = insertCalls.slice(4);
      expect(movedOrNewElements.length).toBe(2);

      const insertedContents = movedOrNewElements.map(
        (call) => call[0].text_content,
      );
      expect(insertedContents).toContain("D");
      expect(insertedContents).toContain("C");
    });
  });
});
