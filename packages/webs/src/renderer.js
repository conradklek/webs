import {
  Fragment,
  Comment,
  Teleport,
  Text,
  is_function,
  is_object,
  is_string,
} from "./utils";
import { effect, reactive, computed } from "./reactivity";
import { get_persisted_state, persist_state } from "./persist.js";

export function get_sequence(arr) {
  if (arr.length === 0) return [];
  const p = new Array(arr.length);
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arr_i = arr[i];
    if (arr_i !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arr_i) {
        p[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = (u + v) >> 1;
        if (arr[result[c]] < arr_i) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arr_i < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
}

export function create_renderer(options) {
  const {
    create_element: host_create_element,
    patch_prop: host_patch_prop,
    insert: host_insert,
    remove: host_remove,
    set_element_text: host_set_element_text,
    create_text: host_create_text,
    create_comment: host_create_comment,
    query_selector: host_query_selector,
  } = options;

  const hydrate = (vnode, container) => {
    hydrate_node(vnode, container.firstChild);
    if (typeof window !== "undefined" && window.__INITIAL_STATE__) {
      window.__INITIAL_STATE__ = null;
    }
  };

  const hydrate_node = (vnode, dom_node) => {
    if (!dom_node) {
      console.warn("DOM Mismatch during hydration.");
      return null;
    }

    const { type, props, children } = vnode;
    vnode.el = dom_node;

    switch (type) {
      case Fragment:
      case Teleport:
        return hydrate_children(children, dom_node.parentElement, dom_node);
      case Text: {
        const vnode_text = String(children);

        if (props && props["w-dynamic"]) {
          if (dom_node.nodeType !== 8 || dom_node.data !== "[") {
            console.warn(
              "Hydration mismatch: expected dynamic text opening comment.",
            );
            return dom_node.nextSibling;
          }

          const text_node = dom_node.nextSibling;
          if (!text_node || text_node.nodeType !== 3) {
            console.warn(
              "Hydration mismatch: expected text node after opening comment.",
            );
            return dom_node.nextSibling;
          }

          if (text_node.textContent !== vnode_text) {
            text_node.textContent = vnode_text;
          }
          vnode.el = text_node;

          const closing_comment = text_node.nextSibling;
          if (
            !closing_comment ||
            closing_comment.nodeType !== 8 ||
            closing_comment.data !== "]"
          ) {
            console.warn(
              "Hydration mismatch: expected dynamic text closing comment.",
            );
            return dom_node.nextSibling;
          }
          return closing_comment.nextSibling;
        }

        if (dom_node.nodeType === 3) {
          if (dom_node.textContent !== vnode_text) {
            console.warn(
              `Hydration text mismatch: "${vnode_text}" vs DOM: "${dom_node.textContent}"`,
            );
          }
          return dom_node.nextSibling;
        }

        console.warn(
          `Hydration mismatch: expected text node, but got nodeType ${dom_node.nodeType}`,
        );
        return dom_node.nextSibling;
      }
      case Comment:
        return dom_node.nextSibling;

      default:
        if (is_object(type)) {
          mount_component(vnode, null, null, null, true);
          return dom_node.nextSibling;
        } else if (is_string(type)) {
          if (props) {
            for (const key in props) {
              host_patch_prop(dom_node, key, null, props[key]);
            }
          }
          if (children) {
            hydrate_children(children, dom_node, dom_node.firstChild);
          }
          return dom_node.nextSibling;
        }
    }
    return dom_node.nextSibling;
  };

  const hydrate_children = (children, _, start_node) => {
    let next_dom_node = start_node;
    const child_vnodes = Array.isArray(children) ? children : [children];
    for (const child_vnode of child_vnodes) {
      if (!next_dom_node) break;
      next_dom_node = hydrate_node(child_vnode, next_dom_node);
    }
    return next_dom_node;
  };

  const unmount = (vnode) => {
    if (vnode.type === Fragment || vnode.type === Teleport) {
      return unmount_children(vnode.children);
    }
    if (vnode.component) {
      vnode.component.hooks.onUnmounted?.forEach((h) => h());
      unmount(vnode.component.sub_tree);
    }
    host_remove(vnode.el);
  };

  const unmount_children = (children) => {
    if (Array.isArray(children)) {
      children.forEach(unmount);
    }
  };

  const patch_keyed_children = (c1, c2, container) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;
    while (i <= e1 && i <= e2 && c1[i].key === c2[i].key) {
      patch(c1[i], c2[i], container);
      i++;
    }
    while (i <= e1 && i <= e2 && c1[e1].key === c2[e2].key) {
      patch(c1[e1], c2[e2], container);
      e1--;
      e2--;
    }
    if (i > e1) {
      if (i <= e2) {
        const next_pos = e2 + 1;
        const anchor = next_pos < l2 ? c2[next_pos].el : null;
        while (i <= e2) {
          patch(null, c2[i++], container, anchor);
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i++]);
      }
    } else {
      const s1 = i,
        s2 = i;
      const key_to_new_index_map = new Map();
      for (i = s2; i <= e2; i++) {
        key_to_new_index_map.set(c2[i].key, i);
      }
      const to_be_patched = e2 - s2 + 1;
      const new_index_to_old_index_map = new Array(to_be_patched).fill(0);
      let moved = false;
      let max_new_index_so_far = 0;
      for (i = s1; i <= e1; i++) {
        const prev_child = c1[i];
        const new_index = key_to_new_index_map.get(prev_child.key);
        if (new_index === undefined) {
          unmount(prev_child);
        } else {
          if (new_index >= max_new_index_so_far) {
            max_new_index_so_far = new_index;
          } else {
            moved = true;
          }
          new_index_to_old_index_map[new_index - s2] = i + 1;
          patch(prev_child, c2[new_index], container);
        }
      }
      const increasing_new_index_sequence = moved
        ? get_sequence(new_index_to_old_index_map)
        : [];
      let j = increasing_new_index_sequence.length - 1;
      for (i = to_be_patched - 1; i >= 0; i--) {
        const next_index = s2 + i;
        const next_child = c2[next_index];
        const anchor = next_index + 1 < l2 ? c2[next_index + 1].el : null;
        if (new_index_to_old_index_map[i] === 0) {
          patch(null, next_child, container, anchor);
        } else if (moved) {
          if (j < 0 || i !== increasing_new_index_sequence[j]) {
            host_insert(next_child.el, container, anchor);
          } else {
            j--;
          }
        }
      }
    }
  };

  const patch_unkeyed_children = (c1, c2, container) => {
    const old_length = c1.length;
    const new_length = c2.length;
    const common_length = Math.min(old_length, new_length);
    for (let i = 0; i < common_length; i++) {
      patch(c1[i], c2[i], container);
    }
    if (new_length > old_length) {
      for (let i = common_length; i < new_length; i++) {
        patch(null, c2[i], container);
      }
    } else {
      unmount_children(c1.slice(common_length));
    }
  };

  const patch_children = (n1, n2, container) => {
    const c1 = n1?.children;
    const c2 = n2?.children;

    if (is_string(c2)) {
      if (Array.isArray(c1)) {
        unmount_children(c1);
      }
      host_set_element_text(container, c2);
      return;
    }

    const old_children =
      c1 && !is_string(c1) ? (Array.isArray(c1) ? c1 : [c1]) : [];
    const new_children = c2 ? (Array.isArray(c2) ? c2 : [c2]) : [];

    if (new_children.length === 0) {
      if (old_children.length > 0) {
        unmount_children(old_children);
      }
      if (is_string(c1)) {
        host_set_element_text(container, "");
      }
      return;
    }

    if (old_children.length === 0) {
      new_children.forEach((c) => patch(null, c, container));
      return;
    }

    if (new_children.some((child) => child.key != null)) {
      patch_keyed_children(old_children, new_children, container);
    } else {
      patch_unkeyed_children(old_children, new_children, container);
    }
  };

  const mount_component = (
    vnode,
    container,
    anchor,
    parent_component,
    is_hydrating = false,
  ) => {
    const instance = (vnode.component = create_component(
      vnode,
      parent_component,
      false,
      is_hydrating,
    ));
    const component = instance.type;
    if (!component.render) {
      console.warn(`Component is missing a render function.`, component);
      component.render = () => create_vnode(Comment, null, "missing render");
    }
    instance.render = component.render;
    instance.update = effect(
      () => {
        if (!instance.is_mounted) {
          instance.hooks.onBeforeMount?.forEach((h) => h());
          const sub_tree = (instance.sub_tree = instance.render.call(
            instance.ctx,
            instance.ctx,
          ));

          if (is_hydrating) {
            hydrate_node(sub_tree, vnode.el);
          } else {
            patch(null, sub_tree, container, anchor, instance);
          }

          vnode.el = sub_tree.el;

          if (
            sub_tree.type !== Fragment &&
            Object.keys(instance.attrs).length > 0
          ) {
            for (const key in instance.attrs) {
              host_patch_prop(vnode.el, key, null, instance.attrs[key]);
            }
          }

          instance.is_mounted = true;
          instance.hooks.onMounted?.forEach((h) => h());
        } else {
          instance.hooks.onBeforeUpdate?.forEach((h) => h());
          const prev_tree = instance.sub_tree;
          const next_tree = (instance.sub_tree = instance.render.call(
            instance.ctx,
            instance.ctx,
          ));
          patch(prev_tree, next_tree, container, anchor, instance);
          vnode.el = next_tree.el;

          if (next_tree.type !== Fragment) {
            const old_attrs = instance.prev_attrs || {};
            const new_attrs = instance.attrs;
            for (const key in new_attrs) {
              if (new_attrs[key] !== old_attrs[key]) {
                host_patch_prop(vnode.el, key, old_attrs[key], new_attrs[key]);
              }
            }
            for (const key in old_attrs) {
              if (!(key in new_attrs)) {
                host_patch_prop(vnode.el, key, old_attrs[key], null);
              }
            }
          }

          instance.hooks.onUpdated?.forEach((h) => h());
        }
      },
      {
        scheduler: () => {
          if (instance.app_context.queue_job) {
            instance.app_context.queue_job(instance.update);
          } else {
            instance.update();
          }
        },
      },
    );
  };

  const update_component = (n1, n2) => {
    const instance = (n2.component = n1.component);

    instance.vnode = n2;
    n2.el = n1.el;
    instance.prev_attrs = instance.attrs;

    const { props: props_options } = instance.type;
    const vnode_props = n2.props || {};
    const next_props = {};
    const next_attrs = {};

    for (const key in vnode_props) {
      if (props_options && props_options.hasOwnProperty(key)) {
        next_props[key] = vnode_props[key];
      } else {
        next_attrs[key] = vnode_props[key];
      }
    }
    instance.attrs = next_attrs;

    instance.slots = n2.children || {};

    if (props_options) {
      for (const key in props_options) {
        const options = props_options[key];
        let new_value;

        if (next_props.hasOwnProperty(key)) {
          new_value = next_props[key];
        } else if (options?.hasOwnProperty("default")) {
          const def = options.default;
          new_value = is_function(def) ? def() : def;
        } else {
          new_value = undefined;
        }

        instance.internal_ctx[key] = new_value;
      }
    }
  };

  const patch_element = (n1, n2, container, anchor) => {
    const el = (n2.el = n1 ? n1.el : host_create_element(n2.type));
    const old_props = n1?.props || {};
    const new_props = n2.props || {};
    for (const key in new_props) {
      if (new_props[key] !== old_props[key]) {
        host_patch_prop(el, key, old_props[key], new_props[key]);
      }
    }
    for (const key in old_props) {
      if (!(key in new_props)) {
        host_patch_prop(el, key, old_props[key], null);
      }
    }
    patch_children(n1, n2, el);
    if (!n1) {
      host_insert(el, container, anchor);
    }
  };

  const patch = (n1, n2, container, anchor = null, parent_component = null) => {
    if (n1 === n2) return;
    if (n1 && (n1.type !== n2.type || n1.key !== n2.key)) {
      unmount(n1);
      n1 = null;
    }
    const { type } = n2;
    switch (type) {
      case Fragment:
        if (!n1) n2.children.forEach((c) => patch(null, c, container, anchor));
        else patch_children(n1, n2, container);
        break;
      case Text:
        n2.el = n1 ? n1.el : host_create_text(n2.children);
        if (n1) {
          if (n2.children !== n1.children)
            host_set_element_text(n2.el, n2.children);
        } else {
          host_insert(n2.el, container, anchor);
        }
        break;
      case Comment:
        n2.el = n1 ? n1.el : host_create_comment(n2.children);
        if (!n1) host_insert(n2.el, container, anchor);
        break;
      case Teleport:
        const target = host_query_selector(n2.props.to);
        if (target) {
          patch_children(n1, n2, target);
        } else {
          console.warn(`Teleport target "${n2.props.to}" not found.`);
        }
        break;
      default:
        if (is_string(type)) {
          patch_element(n1, n2, container, anchor);
        } else if (is_object(type)) {
          if (!n1) {
            mount_component(n2, container, anchor, parent_component);
          } else {
            update_component(n1, n2);
          }
        }
    }
  };
  return { patch, hydrate };
}

let current_instance = null;

const set_current_instance = (instance) => {
  current_instance = instance;
};

export function create_component(
  vnode,
  parent,
  is_ssr = false,
  is_hydrating = false,
) {
  const parent_app_context = parent ? parent.app_context : null;
  const app_context = vnode.app_context || parent_app_context || {};
  const instance = {
    vnode,
    type: vnode.type,
    slots: vnode.children || {},
    attrs: {},
    prev_attrs: null,
    ctx: {},
    internal_ctx: {},
    methods: {},
    actions: {},
    is_mounted: false,
    sub_tree: null,
    update: null,
    render: null,
    app_context: {
      ...app_context,
      globals: app_context.globals || {},
      provides: app_context.provides || {},
    },
    parent,
    provides: parent
      ? Object.create(parent.provides)
      : Object.create(app_context.provides || {}),
    hooks: {},
  };

  const {
    props: props_options,
    state,
    methods,
    computed: computed_options,
    setup,
    actions,
  } = instance.type;

  const vnode_props = vnode.props || {};
  const resolved_props = {};

  for (const key in vnode_props) {
    if (props_options && props_options.hasOwnProperty(key)) {
      resolved_props[key] = vnode_props[key];
    } else {
      instance.attrs[key] = vnode_props[key];
    }
  }

  if (props_options) {
    for (const key in props_options) {
      if (!resolved_props.hasOwnProperty(key)) {
        const options = props_options[key];
        if (options?.hasOwnProperty("default")) {
          const def = options.default;
          resolved_props[key] = is_function(def) ? def() : def;
        }
      }
    }
  }

  let setup_result = {};
  if (setup) {
    set_current_instance(instance);
    const res = setup(resolved_props, {});
    set_current_instance(null);
    if (is_object(res)) {
      setup_result = res;
    }
  }

  if (is_ssr && vnode.props.user && setup_result.session) {
    setup_result.session.user = vnode.props.user;
  }

  const initial_state_from_data = state ? state.call(instance.ctx) : {};
  let final_state;

  if (
    !parent &&
    is_hydrating &&
    typeof window !== "undefined" &&
    window.__INITIAL_STATE__
  ) {
    final_state = {
      ...resolved_props,
      ...window.__INITIAL_STATE__,
      ...setup_result,
    };
  } else {
    final_state = {
      ...resolved_props,
      ...initial_state_from_data,
      ...setup_result,
    };
  }

  if (!is_ssr) {
    for (const key in final_state) {
      if (key.startsWith("$")) {
        const storage_key = `${instance.type.name}:${key}`;
        const persisted_value = get_persisted_state(storage_key);
        if (persisted_value !== null) {
          final_state[key] = persisted_value;
        }
      }
    }
  }

  if (is_ssr) {
    instance.internal_ctx = final_state;
  } else {
    instance.internal_ctx = reactive(final_state);
  }

  instance.ctx = new Proxy(
    {},
    {
      has: (_, key) =>
        key === "$params" ||
        key === "$slots" ||
        key === "$attrs" ||
        key in instance.internal_ctx ||
        key in instance.methods ||
        key === "actions" ||
        key in instance.actions ||
        key in instance.type.components ||
        key in instance.app_context.globals,
      get: (_, key) => {
        if (key === "$params") return instance.app_context.params;
        if (key === "$slots") return instance.slots;
        if (key === "$attrs") return instance.attrs;
        if (key in instance.internal_ctx) {
          const val = instance.internal_ctx[key];
          return val && val.__is_ref && !is_ssr ? val.value : val;
        }
        if (key in instance.actions) return instance.actions[key];
        if (key in instance.methods) return instance.methods[key];
        const component = instance.type.components?.[key];
        if (component) return component;
        if (key in instance.app_context.globals)
          return instance.app_context.globals[key];
      },
      set: (_, key, value) => {
        if (is_ssr) {
          console.warn(`Cannot set "${key}" during SSR.`);
          return false;
        }
        if (key in instance.internal_ctx) {
          const s = instance.internal_ctx[key];
          if (s?.__is_ref) {
            s.value = value;
          } else {
            instance.internal_ctx[key] = value;
          }
          return true;
        }
        console.warn(
          `Cannot set "${key}". It is not a reactive state property.`,
        );
        return false;
      },
    },
  );

  if (!is_ssr) {
    for (const key in instance.internal_ctx) {
      if (key.startsWith("$")) {
        const storage_key = `${instance.type.name}:${key}`;
        effect(() => {
          persist_state(storage_key, instance.ctx[key]);
        });
      }
    }
  }

  if (methods) {
    for (const key in methods) {
      instance.methods[key] = methods[key].bind(instance.ctx);
    }
  }
  if (!is_ssr && actions) {
    for (const key in actions) {
      instance.actions[key] = async (...args) => {
        try {
          const response = await fetch(
            `/__actions__/${instance.type.name}/${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(args),
            },
          );
          if (!response.ok)
            throw new Error(
              `Server action failed with status: ${response.status}`,
            );
          const contentType = response.headers.get("content-type");
          return contentType?.includes("application/json")
            ? response.json()
            : response.text();
        } catch (error) {
          console.error(`Error calling action "${key}":`, error);
          throw error;
        }
      };
    }
  }
  if (!is_ssr && computed_options) {
    for (const key in computed_options) {
      const getter = computed_options[key].bind(instance.ctx);
      instance.internal_ctx[key] = computed(getter);
    }
  }
  if (instance.type.render) {
    instance.render = instance.type.render;
  }
  return instance;
}

export function camel_to_kebab(camel) {
  return camel.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, "$1-$2").toLowerCase();
}

export { Fragment, Comment, Teleport, Text };

export class VNode {
  constructor(type, props, children) {
    if (
      props &&
      (Array.isArray(props) ||
        (typeof props !== "object" && !is_function(props)))
    ) {
      children = props;
      props = null;
    }
    this.type = type;
    this.props = props || {};
    this.children = children;
    this.el = null;
    this.key = props && props.key;
    this.component = null;
  }
}

export function create_vnode(type, props, children) {
  return new VNode(type, props, children);
}

export const h = create_vnode;

export const NODE_TYPES = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
  COMMENT_NODE: 8,
};

export class DOM_node {
  constructor(node_type) {
    this.node_type = node_type;
    this.parent_node = null;
    this.child_nodes = [];
  }
  insert_before(new_child, ref_child) {
    if (new_child.parent_node) {
      new_child.parent_node.remove_child(new_child);
    }

    new_child.parent_node = this;
    const index = ref_child ? this.child_nodes.indexOf(ref_child) : -1;
    if (index !== -1) {
      this.child_nodes.splice(index, 0, new_child);
    } else {
      this.child_nodes.push(new_child);
    }
  }
  remove_child(child) {
    const index = this.child_nodes.indexOf(child);
    if (index !== -1) {
      this.child_nodes.splice(index, 1);
      child.parent_node = null;
    }
  }
}

export class DOM_text_node extends DOM_node {
  constructor(text) {
    super(NODE_TYPES.TEXT_NODE);
    this.node_value = text;
  }
  get text_content() {
    return this.node_value;
  }
  set text_content(value) {
    this.node_value = String(value);
  }
  get outer_html() {
    return this.text_content;
  }
}

export class DOM_comment_node extends DOM_node {
  constructor(text) {
    super(NODE_TYPES.COMMENT_NODE);
    this.node_value = text;
  }
  get text_content() {
    return this.node_value;
  }
  get outer_html() {
    return `<!--${this.text_content}-->`;
  }
}

export function parse_selector(selector) {
  const tag_match = selector.match(/^[a-zA-Z0-9\-]+/);
  const id_match = selector.match(/#([a-zA-Z0-9\-_]+)/);
  const class_matches = selector.match(/\.([a-zA-Z0-9\-_]+)/g) || [];
  return {
    tag: tag_match ? tag_match[0].toLowerCase() : null,
    id: id_match ? id_match[1] : null,
    classes: class_matches.map((c) => c.substring(1)),
  };
}

export class DOM_element extends DOM_node {
  constructor(tag_name) {
    super(NODE_TYPES.ELEMENT_NODE);
    this.tag_name = tag_name.toUpperCase();
    this._attributes = null;
    this._listeners = null;
    this._class_list = null;
    this._style = null;
  }
  get class_list() {
    if (!this._class_list) {
      this._class_list = {
        add: (...class_names) => {
          const current_classes = new Set(
            (this.get_attribute("class") || "").split(" ").filter(Boolean),
          );
          class_names.forEach((cn) => current_classes.add(cn));
          this.set_attribute("class", [...current_classes].join(" "));
        },
        remove: (...class_names) => {
          const current_classes = new Set(
            (this.get_attribute("class") || "").split(" ").filter(Boolean),
          );
          class_names.forEach((cn) => current_classes.delete(cn));
          this.set_attribute("class", [...current_classes].join(" "));
        },
        contains: (class_name) => {
          const current_classes = new Set(
            (this.get_attribute("class") || "").split(" "),
          );
          return current_classes.has(class_name);
        },
      };
    }
    return this._class_list;
  }
  get style() {
    if (!this._style) {
      this._style = new Proxy(
        {},
        {
          set: (_, prop, value) => {
            const styles = this.get_attribute("style") || "";
            const new_style_string = `${styles}${camel_to_kebab(prop)}:${value};`;
            this.set_attribute("style", new_style_string);
            return true;
          },
        },
      );
    }
    return this._style;
  }
  add_event_listener(name, listener) {
    if (!this._listeners) this._listeners = {};
    this._listeners[name.toLowerCase()] = listener;
  }
  set_attribute(name, value) {
    if (!this._attributes) this._attributes = {};
    this._attributes[name.toLowerCase()] = String(value);
  }
  get_attribute(name) {
    return this._attributes ? this._attributes[name.toLowerCase()] : undefined;
  }
  remove_attribute(name) {
    if (this._attributes) delete this._attributes[name.toLowerCase()];
    if (this._listeners) delete this._listeners[name.toLowerCase()];
  }
  matches(selector) {
    if (typeof selector !== "string" || !selector) return false;
    const { tag, id, classes } = parse_selector(selector);
    if (tag && this.tag_name.toLowerCase() !== tag) return false;
    if (id && this.get_attribute("id") !== id) return false;
    if (classes.length > 0) {
      const element_classes = new Set(
        (this.get_attribute("class") || "").split(" ").filter(Boolean),
      );
      for (const cls of classes) {
        if (!element_classes.has(cls)) return false;
      }
    }
    return true;
  }
  query_selector(selector) {
    for (const child of this.child_nodes) {
      if (child.node_type !== NODE_TYPES.ELEMENT_NODE) continue;
      if (child.matches(selector)) return child;
      const found = child.query_selector(selector);
      if (found) return found;
    }
    return null;
  }
  get text_content() {
    return this.child_nodes.map((c) => c.text_content).join("");
  }
  set text_content(value) {
    this.child_nodes.length = 0;
    if (value !== null && value !== undefined) {
      this.insert_before(new DOM_text_node(String(value)), null);
    }
  }
  get outer_html() {
    const self_closing_tags = new Set([
      "input",
      "br",
      "hr",
      "img",
      "meta",
      "link",
    ]);
    let all_props = "";
    if (this._attributes) {
      all_props =
        " " +
        Object.entries(this._attributes)
          .map(([k, v]) => (v === "" || v === "true" ? k : `${k}="${v}"`))
          .join(" ");
    }
    if (self_closing_tags.has(this.tag_name.toLowerCase())) {
      return `<${this.tag_name.toLowerCase()}${all_props}>`;
    }
    const children_html = this.child_nodes
      .map((c) => c.outer_html || c.text_content)
      .join("");
    return `<${this.tag_name.toLowerCase()}${all_props}>${children_html}</${this.tag_name.toLowerCase()}>`;
  }
}

export function element_factory(tag_name) {
  return new DOM_element(tag_name);
}
