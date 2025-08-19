import { is_function, is_object, is_string } from "./utils";
import { effect, reactive, computed } from "./reactivity";

export const Text = Symbol("Text");
export const Comment = Symbol("Comment");
export const Fragment = Symbol("Fragment");
export const Teleport = Symbol("Teleport");

let current_instance = null;

export function provide(key, value) {
  if (!current_instance) {
    console.warn(
      `[Renderer] provide() called outside of setup. Cannot provide key:`,
      key,
    );
    return;
  }
  console.log(
    `[Renderer] Component '${current_instance.type.name}' PROVIDING key:`,
    key,
    "with value:",
    value,
  );
  current_instance.provides[key] = value;
}

export function inject(key, default_value) {
  if (!current_instance) {
    console.warn(
      `[Renderer] inject() called outside of setup. Cannot inject key:`,
      key,
    );
    return default_value;
  }
  const resolved = current_instance.provides[key];
  console.log(
    `[Renderer] Component '${current_instance.type.name}' INJECTING key:`,
    key,
    "Resolved value:",
    resolved,
  );
  return resolved !== undefined ? resolved : default_value;
}

function merge_props(vnode_props, fallthrough_attrs) {
  const merged = { ...vnode_props };
  for (const key in fallthrough_attrs) {
    if (key === "class") {
      merged.class =
        (vnode_props.class || "") + " " + (fallthrough_attrs.class || "");
      merged.class = merged.class.trim();
    } else if (key === "style") {
      merged.style = { ...vnode_props.style, ...fallthrough_attrs.style };
    } else {
      merged[key] = fallthrough_attrs[key];
    }
  }
  return merged;
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

  const patch = (n1, n2, container, anchor = null, parent_component = null) => {
    if (n1 === n2) return;

    if (n1 && (n1.type !== n2.type || n1.key !== n2.key)) {
      unmount(n1);
      n1 = null;
    }

    const { type } = n2;
    switch (type) {
      case Text:
        n2.el = n1 ? n1.el : host_create_text(n2.children);
        if (n1) {
          if (n2.children !== n1.children) {
            host_set_element_text(n2.el, n2.children);
          }
        } else {
          host_insert(n2.el, container, anchor);
        }
        break;
      case Comment:
        n2.el = n1 ? n1.el : host_create_comment(n2.children);
        if (!n1) {
          host_insert(n2.el, container, anchor);
        }
        break;
      case Fragment:
        if (!n1) {
          n2.children.forEach((c) =>
            patch(null, c, container, anchor, parent_component),
          );
        } else {
          patch_children(n1, n2, container, parent_component);
        }
        break;
      case Teleport:
        const target = host_query_selector(n2.props.to);
        if (target) {
          patch_children(n1, n2, target, parent_component);
        } else {
          console.warn(`Teleport target "${n2.props.to}" not found.`);
        }
        break;
      default:
        if (is_string(type)) {
          patch_element(n1, n2, container, anchor, parent_component);
        } else if (is_object(type)) {
          if (!n1) {
            mount_component(n2, container, anchor, parent_component);
          } else {
            update_component(n1, n2);
          }
        }
    }
  };

  const patch_element = (n1, n2, container, anchor, parent_component) => {
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

    patch_children(n1, n2, el, parent_component);

    if (!n1) {
      host_insert(el, container, anchor);
    }
  };

  const patch_children = (n1, n2, container, parent_component) => {
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
      new_children.forEach((c) =>
        patch(null, c, container, null, parent_component),
      );
      return;
    }

    if (new_children.some((child) => child.key != null)) {
      patch_keyed_children(
        old_children,
        new_children,
        container,
        parent_component,
      );
    } else {
      patch_unkeyed_children(
        old_children,
        new_children,
        container,
        parent_component,
      );
    }
  };

  const patch_unkeyed_children = (c1, c2, container, parent_component) => {
    const old_length = c1.length;
    const new_length = c2.length;
    const common_length = Math.min(old_length, new_length);

    for (let i = 0; i < common_length; i++) {
      patch(c1[i], c2[i], container, null, parent_component);
    }
    if (new_length > old_length) {
      for (let i = common_length; i < new_length; i++) {
        patch(null, c2[i], container, null, parent_component);
      }
    } else {
      unmount_children(c1.slice(common_length));
    }
  };

  const patch_keyed_children = (c1, c2, container, parent_component) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;

    while (i <= e1 && i <= e2 && c1[i].key === c2[i].key) {
      patch(c1[i], c2[i], container, null, parent_component);
      i++;
    }
    while (i <= e1 && i <= e2 && c1[e1].key === c2[e2].key) {
      patch(c1[e1], c2[e2], container, null, parent_component);
      e1--;
      e2--;
    }

    if (i > e1) {
      if (i <= e2) {
        const next_pos = e2 + 1;
        const anchor = next_pos < l2 ? c2[next_pos].el : null;
        while (i <= e2) {
          patch(null, c2[i++], container, anchor, parent_component);
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
          patch(prev_child, c2[new_index], container, null, parent_component);
        }
      }

      const increasing_new_index_sequence = moved
        ? get_longest_increasing_subsequence(new_index_to_old_index_map)
        : [];
      let j = increasing_new_index_sequence.length - 1;
      for (i = to_be_patched - 1; i >= 0; i--) {
        const next_index = s2 + i;
        const next_child = c2[next_index];
        const anchor = next_index + 1 < l2 ? c2[next_index + 1].el : null;
        if (new_index_to_old_index_map[i] === 0) {
          patch(null, next_child, container, anchor, parent_component);
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

          if (
            Object.keys(instance.attrs).length > 0 &&
            sub_tree.type !== Fragment
          ) {
            sub_tree.props = merge_props(sub_tree.props, instance.attrs);
          }

          if (is_hydrating) {
            hydrate_node(sub_tree, vnode.el, instance);
          } else {
            patch(null, sub_tree, container, anchor, instance);
          }
          vnode.el = sub_tree.el;

          instance.is_mounted = true;
          instance.hooks.onMounted?.forEach((h) => h());
        } else {
          instance.hooks.onBeforeUpdate?.forEach((h) => h());
          const prev_tree = instance.sub_tree;
          const next_tree = (instance.sub_tree = instance.render.call(
            instance.ctx,
            instance.ctx,
          ));

          const new_attrs = instance.attrs;

          if (
            Object.keys(new_attrs).length > 0 &&
            next_tree.type !== Fragment
          ) {
            next_tree.props = merge_props(next_tree.props, new_attrs);
          }

          const parent_container = prev_tree.el.parentElement;
          const anchor = prev_tree.el.nextSibling;

          patch(prev_tree, next_tree, parent_container, anchor, instance);
          vnode.el = next_tree.el;

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

  const unmount = (vnode) => {
    if (vnode.component) {
      vnode.component.hooks.onUnmounted?.forEach((h) => h());
      unmount(vnode.component.sub_tree);
      return;
    }
    if (vnode.type === Fragment || vnode.type === Teleport) {
      unmount_children(vnode.children);
      return;
    }
    host_remove(vnode.el);
  };

  const unmount_children = (children) => {
    if (Array.isArray(children)) {
      children.forEach(unmount);
    }
  };

  const hydrate = (vnode, container) => {
    hydrate_node(vnode, container.firstChild, null);
  };

  const hydrate_node = (vnode, dom_node, parent_component = null) => {
    while (
      dom_node &&
      ((dom_node.nodeType === 3 && !dom_node.textContent.trim()) ||
        (dom_node.nodeType === 8 && dom_node.data === "w"))
    ) {
      dom_node = dom_node.nextSibling;
    }
    if (!dom_node && vnode.type !== Comment) {
      console.warn("DOM Mismatch during hydration: Node not found.", vnode);
      return null;
    }

    const { type, props, children } = vnode;
    vnode.el = dom_node;

    switch (type) {
      case Text:
        if (props && props["w-dynamic"]) {
          if (dom_node.nodeType !== 8 || dom_node.data !== "[")
            return dom_node.nextSibling;
          const textNode = dom_node.nextSibling;
          const closingComment = textNode.nextSibling;
          if (
            !closingComment ||
            closingComment.nodeType !== 8 ||
            closingComment.data !== "]"
          )
            return dom_node.nextSibling;
          vnode.el = textNode;
          return closingComment.nextSibling;
        }
        if (dom_node.nodeType !== 3) return dom_node.nextSibling;
        return dom_node.nextSibling;
      case Comment:
        if (dom_node && dom_node.nodeType === 8) {
          return dom_node.nextSibling;
        }
        return dom_node;
      case Fragment:
        return hydrate_children(
          children,
          dom_node.parentElement,
          dom_node,
          parent_component,
        );
      default:
        if (is_object(type)) {
          mount_component(vnode, null, null, parent_component, true);
          return dom_node.nextSibling;
        } else if (is_string(type)) {
          if (props) {
            for (const key in props) {
              host_patch_prop(dom_node, key, null, props[key]);
            }
          }
          hydrate_children(
            children,
            dom_node,
            dom_node.firstChild,
            parent_component,
          );
          return dom_node.nextSibling;
        }
    }
    return dom_node ? dom_node.nextSibling : null;
  };

  const hydrate_children = (
    children,
    _parent_dom,
    start_node,
    parent_component = null,
  ) => {
    let next_dom_node = start_node;
    const child_vnodes = Array.isArray(children) ? children : [children];
    for (const child_vnode of child_vnodes) {
      if (!child_vnode) continue;
      next_dom_node = hydrate_node(
        child_vnode,
        next_dom_node,
        parent_component,
      );
    }
    return next_dom_node;
  };

  return { patch, hydrate };
}

const set_current_instance = (instance) => {
  current_instance = instance;
};

export function create_component(
  vnode,
  parent,
  is_ssr = false,
  is_hydrating = false,
) {
  console.log(
    `[Renderer] Creating component: ${vnode.type.name || "Anonymous"}. SSR: ${is_ssr}, Hydrating: ${is_hydrating}`,
  );
  console.log(`[Renderer] VNode props received:`, vnode.props);

  const parent_app_context = parent ? parent.app_context : null;
  const app_context = vnode.app_context || parent_app_context || {};
  app_context.globals = app_context.globals || {};
  app_context.provides = app_context.provides || {};

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
    app_context: app_context,
    parent,
    provides: parent
      ? Object.create(parent.provides)
      : Object.create(app_context.provides),
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
        const def = options?.hasOwnProperty("default")
          ? options.default
          : undefined;
        resolved_props[key] = is_function(def) ? def() : def;
      }
    }
  }

  let setup_result = {};
  if (setup) {
    console.log(`[Renderer] Running setup for ${instance.type.name}...`);
    set_current_instance(instance);
    const res = setup(resolved_props, {
      attrs: instance.attrs,
      provide,
      inject,
    });
    set_current_instance(null);
    if (is_object(res)) {
      setup_result = res;
    }
    console.log(
      `[Renderer] Setup for ${instance.type.name} returned:`,
      setup_result,
    );
  }

  if (is_ssr && vnode.props.user && setup_result.session) {
    setup_result.session.user = vnode.props.user;
  }

  const initial_state_from_data = state ? state.call(instance.ctx) : {};
  let final_state;

  console.log(`[Renderer] State sources for ${instance.type.name}:`, {
    props: resolved_props,
    data_fn: initial_state_from_data,
    setup: setup_result,
    server_state_prop: vnode.props.initial_state,
  });

  const server_state = vnode.props.initial_state;

  if (server_state && Object.keys(server_state).length > 0) {
    console.log(`[Renderer] Using SERVER STATE for ${instance.type.name}.`);
    final_state = {
      ...resolved_props,
      ...initial_state_from_data,
      ...server_state,
      ...setup_result,
    };
  } else {
    console.log(`[Renderer] Using CLIENT STATE for ${instance.type.name}.`);
    final_state = {
      ...resolved_props,
      ...initial_state_from_data,
      ...setup_result,
    };
  }

  console.log(
    `[Renderer] Final combined state for ${instance.type.name}:`,
    final_state,
  );

  instance.internal_ctx = is_ssr ? final_state : reactive(final_state);

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
        (instance.app_context.globals && key in instance.app_context.globals),
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
        if (instance.app_context.globals && key in instance.app_context.globals)
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

function get_longest_increasing_subsequence(arr) {
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
