import { create_renderer, create_vnode, create_component } from "./renderer.js";
import { void_elements } from "./utils.js";
import { compile } from "./compiler.js";

function compile_templates(component_def) {
  if (component_def.template && !component_def.render) {
    component_def.render = compile(component_def);
  }
  if (component_def.components) {
    for (const key in component_def.components) {
      compile_templates(component_def.components[key]);
    }
  }
}

function create_app_api(renderer_options) {
  const renderer = create_renderer(renderer_options);
  return function create_app(root_component, root_props = {}) {
    compile_templates(root_component);
    let vnode;
    const app = {
      _component: root_component,
      _container: null,
      _context: {
        components: root_component.components || {},
        provides: {},
        patch: renderer.patch,
        params: root_props.params || {},
      },
      mount(root_container) {
        root_container.innerHTML = "";
        vnode = create_vnode(root_component);
        vnode.app_context = app._context;
        app._context.patch(null, vnode, root_container);
        app._container = root_container;
      },
      update(new_root_component) {
        compile_templates(new_root_component);
        const new_vnode = create_vnode(new_root_component);
        new_vnode.app_context = app._context;
        app._context.patch(vnode, new_vnode, app._container);
        vnode = new_vnode;
      },
    };
    return app;
  };
}

export class server_node {
  constructor(type, tag = "") {
    this.nodeType = type;
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.textContent = "";
  }
  get outerHTML() {
    if (this.nodeType === 3) return this.textContent;
    if (this.nodeType === 8) return `<!--${this.textContent}-->`;
    const attrs = Object.entries(this.attributes)
      .map(([key, value]) => {
        if (value === true) return key;
        if (value === null || value === undefined || value === false) return "";
        const stringValue = String(value);
        const escapedValue = stringValue.replace(/"/g, "&quot;");
        return `${key}="${escapedValue}"`;
      })
      .filter(Boolean)
      .join(" ");
    const children = this.children.map((c) => c.outerHTML).join("");
    if (void_elements.has(this.tagName.toLowerCase())) {
      return `<${this.tagName.toLowerCase()}${attrs ? " " + attrs : ""}>`;
    }
    return `<${this.tagName.toLowerCase()}${attrs ? " " + attrs : ""}>${children}</${this.tagName.toLowerCase()}>`;
  }
}

export function create_server_runtime() {
  const serverRendererOptions = {
    create_element: (tag) => new server_node(1, tag),
    create_text: (text) => {
      const n = new server_node(3);
      n.textContent = text;
      return n;
    },
    create_comment: (text) => {
      const n = new server_node(8);
      n.textContent = text;
      return n;
    },
    set_element_text: (el, text) => {
      el.textContent = text;
      el.children = [];
    },
    insert: (child, parent, anchor) => {
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      if (index > -1) parent.children.splice(index, 0, child);
      else parent.children.push(child);
    },
    remove: () => { },
    patch_prop: (el, key, _, next_val) => {
      if (key.startsWith("on")) return;
      if (next_val == null) {
        delete el.attributes[key];
      } else {
        el.attributes[key] = next_val;
      }
    },
    query_selector: () => null,
  };
  return create_app_api(serverRendererOptions);
}

const CLI_adapter_component = {
  name: "CliAdapter",
  state: () => ({
    isVisible: true,
  }),
  methods: {
    toggleVisibility() {
      this.isVisible = !this.isVisible;
    },
  },
  template: `<main id="main-content"><div :class="isVisible ? 'visible' : 'hidden'">{{ isVisible ? 'Content is visible' : 'Content is hidden' }}</div><ul><li>Hello, world!</li></ul></main>`,
};

function render_with_state(
  component = CLI_adapter_component,
  state_override = {},
) {
  const component_def = {
    ...component,
    state: () => ({
      ...component.state(),
      ...state_override,
    }),
  };
  if (!component_def.render) {
    component_def.render = compile(component_def);
  }
  const component_vnode = create_vnode(component_def);
  const instance = create_component(component_vnode, null, true);
  const sub_tree = instance.render.call(instance.ctx, instance.ctx);
  instance.sub_tree = sub_tree;
  component_vnode.component = instance;
  const create_app = create_server_runtime();
  const app = create_app(component_def);
  const container = new server_node(1, "div");
  app.mount(container);
  const html =
    container.children.length > 0 ? container.children[0].outerHTML : "";
  return { html, vdom: component_vnode };
}

export const adapter = (component = CLI_adapter_component, state = {}) => {
  return {
    component,
    render: render_with_state(component, state),
  };
};
