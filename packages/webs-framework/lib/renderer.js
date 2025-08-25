import { effect, computed, isRef, useState } from './reactivity';
import { voidElements } from './parser';
import { compile } from './compiler';

const isObjectAndNotArray = (val) =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

const isString = (val) => typeof val === 'string';

const isFunction = (val) => typeof val === 'function';

export const Text = Symbol('Text');
export const Comment = Symbol('Comment');
export const Fragment = Symbol('Fragment');
export const Teleport = Symbol('Teleport');

let currentInstance = null;
let instanceCounter = 0;

export function provide(key, value) {
  if (!currentInstance) return;
  if (!currentInstance.provides) {
    currentInstance.provides = {};
  }
  currentInstance.provides[key] = value;
}

export function inject(key, defaultValue) {
  if (!currentInstance) {
    return defaultValue;
  }

  let instance = currentInstance;

  while (instance) {
    if (
      instance.provides &&
      Object.prototype.hasOwnProperty.call(instance.provides, key)
    ) {
      return instance.provides[key];
    }
    instance = instance.parent;
  }

  if (
    currentInstance.appContext &&
    currentInstance.appContext.provides &&
    key in currentInstance.appContext.provides
  ) {
    return currentInstance.appContext.provides[key];
  }

  return defaultValue;
}

function createLifecycleMethod(name) {
  return (hook) => {
    if (!currentInstance) return;
    if (!currentInstance.hooks[name]) {
      currentInstance.hooks[name] = [];
    }
    currentInstance.hooks[name].push(hook);
  };
}

export const onBeforeMount = createLifecycleMethod('onBeforeMount');
export const onMounted = createLifecycleMethod('onMounted');
export const onBeforeUpdate = createLifecycleMethod('onBeforeUpdate');
export const onUpdated = createLifecycleMethod('onUpdated');
export const onUnmounted = createLifecycleMethod('onUnmounted');
export const onReady = createLifecycleMethod('onReady');

function mergeProps(vnodeProps, fallthroughAttrs) {
  const merged = { ...vnodeProps };
  for (const key in fallthroughAttrs) {
    if (key === 'class') {
      merged.class =
        (vnodeProps.class || '') + ' ' + (fallthroughAttrs.class || '');
      merged.class = merged.class.trim();
    } else if (key === 'style') {
      merged.style = { ...vnodeProps.style, ...fallthroughAttrs.style };
    } else {
      merged[key] = fallthroughAttrs[key];
    }
  }
  return merged;
}

export function createRenderer(options) {
  const {
    createElement: hostCreateElement,
    patchProp: hostPatchProp,
    insert: hostInsert,
    remove: hostRemove,
    setElementText: hostSetElementText,
    createText: hostCreateText,
    createComment: hostCreateComment,
    querySelector: hostQuerySelector,
  } = options;

  const patch = (n1, n2, container, anchor = null, parentComponent = null) => {
    if (n1 === n2) return;
    if (n1 && (n1.type !== n2.type || n1.key !== n2.key)) {
      unmount(n1);
      n1 = null;
    }
    const { type } = n2;
    switch (type) {
      case Text:
        n2.el = n1 ? n1.el : hostCreateText(n2.children);
        if (n1) {
          if (n2.children !== n1.children) {
            hostSetElementText(n2.el, n2.children);
          }
        } else {
          hostInsert(n2.el, container, anchor);
        }
        break;
      case Comment:
        n2.el = n1 ? n1.el : hostCreateComment(n2.children);
        if (!n1) {
          hostInsert(n2.el, container, anchor);
        }
        break;
      case Fragment:
        if (!n1) {
          const childrenToPatch = Array.isArray(n2.children)
            ? n2.children
            : [n2.children];
          childrenToPatch.forEach((c) =>
            patch(null, c, container, anchor, parentComponent),
          );
        } else {
          patchChildren(n1, n2, container, parentComponent);
        }
        break;
      case Teleport:
        const target = hostQuerySelector(n2.props.to);
        if (target) {
          patchChildren(n1, n2, target, parentComponent);
        } else {
          console.warn(`Teleport target "${n2.props.to}" not found.`);
        }
        break;
      default:
        if (isString(type)) {
          patchElement(n1, n2, container, anchor, parentComponent);
        } else if (isObjectAndNotArray(type)) {
          if (!n1) {
            mountComponent(n2, container, anchor, parentComponent);
          } else if (n1.type === n2.type) {
            updateComponent(n1, n2, container);
          } else {
            unmount(n1);
            mountComponent(n2, container, anchor, parentComponent);
          }
        }
    }
  };

  const patchElement = (n1, n2, container, anchor, parentComponent) => {
    const el = (n2.el = n1 ? n1.el : hostCreateElement(n2.type));
    const oldProps = n1?.props || {};
    const newProps = n2.props || {};
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        hostPatchProp(el, key, oldProps[key], newProps[key]);
      }
    }
    for (const key in oldProps) {
      if (!(key in newProps)) {
        hostPatchProp(el, key, oldProps[key], null);
      }
    }
    patchChildren(n1, n2, el, parentComponent);
    if (!n1) {
      hostInsert(el, container, anchor);
    }
  };

  const patchChildren = (n1, n2, container, parentComponent) => {
    const c1 = n1?.children;
    const c2 = n2?.children;
    if (isString(c2)) {
      if (Array.isArray(c1)) {
        unmountChildren(c1);
      }
      hostSetElementText(container, c2);
      return;
    }
    const oldChildren =
      c1 && !isString(c1) ? (Array.isArray(c1) ? c1 : [c1]) : [];
    const newChildren = c2 ? (Array.isArray(c2) ? c2 : [c2]) : [];
    if (newChildren.length === 0) {
      if (oldChildren.length > 0) {
        unmountChildren(oldChildren);
      }
      if (isString(c1)) {
        hostSetElementText(container, '');
      }
      return;
    }

    if (oldChildren.length === 0) {
      newChildren.forEach((c) =>
        patch(null, c, container, null, parentComponent),
      );
      return;
    }

    if (newChildren.some((child) => child.key != null)) {
      patchKeyedChildren(oldChildren, newChildren, container, parentComponent);
    } else {
      patchUnkeyedChildren(
        oldChildren,
        newChildren,
        container,
        parentComponent,
      );
    }
  };

  const patchUnkeyedChildren = (c1, c2, container, parentComponent) => {
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);

    for (let i = 0; i < commonLength; i++) {
      patch(c1[i], c2[i], container, null, parentComponent);
    }
    if (newLength > oldLength) {
      for (let i = commonLength; i < newLength; i++) {
        patch(null, c2[i], container, null, parentComponent);
      }
    } else {
      unmountChildren(c1.slice(commonLength));
    }
  };

  const patchKeyedChildren = (c1, c2, container, parentComponent) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;

    while (i <= e1 && i <= e2 && c1[i].key === c2[i].key) {
      patch(c1[i], c2[i], container, null, parentComponent);
      i++;
    }
    while (i <= e1 && i <= e2 && c1[e1].key === c2[e2].key) {
      patch(c1[e1], c2[e2], container, null, parentComponent);
      e1--;
      e2--;
    }

    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : null;
        while (i <= e2) {
          patch(null, c2[i++], container, anchor, parentComponent);
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i++]);
      }
    } else {
      const s1 = i,
        s2 = i;
      const keyToNewIndexMap = new Map();
      for (i = s2; i <= e2; i++) {
        keyToNewIndexMap.set(c2[i].key, i);
      }
      const toBePatched = e2 - s2 + 1;
      const newIndexToOldIndexMap = new Array(toBePatched).fill(0);
      let moved = false;
      let maxNewIndexSoFar = 0;
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i];
        const newIndex = keyToNewIndexMap.get(prevChild.key);
        if (newIndex === undefined) {
          unmount(prevChild);
        } else {
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
          newIndexToOldIndexMap[newIndex - s2] = i + 1;
          patch(prevChild, c2[newIndex], container, null, parentComponent);
        }
      }
      const increasingNewIndexSequence = moved
        ? getLongestIncreasingSubsequence(newIndexToOldIndexMap)
        : [];
      let j = increasingNewIndexSequence.length - 1;
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i;
        const nextChild = c2[nextIndex];
        const anchor = nextIndex + 1 < l2 ? c2[nextIndex + 1].el : null;
        if (newIndexToOldIndexMap[i] === 0) {
          patch(null, nextChild, container, anchor, parentComponent);
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            hostInsert(nextChild.el, container, anchor);
          } else {
            j--;
          }
        }
      }
    }
  };

  const mountComponent = (
    vnode,
    container,
    anchor,
    parentComponent,
    isHydrating = false,
  ) => {
    const instance = (vnode.component = createComponent(
      vnode,
      parentComponent,
      false,
      isHydrating,
    ));

    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined' &&
      window.__WEBS_DEVELOPER__
    ) {
      instance.uid = instanceCounter++;
      window.__WEBS_DEVELOPER__.componentInstances.set(instance.uid, instance);
      window.__WEBS_DEVELOPER__.notify();
    }

    const scheduler = () => {
      if (instance.update) {
        instance.update();
      }
    };

    const runner = effect(
      () => {
        if (!instance.isMounted) {
          instance.hooks.onBeforeMount?.forEach((h) => h.call(instance.ctx));

          const subTree = (instance.subTree = instance.render.call(
            instance.ctx,
            instance.ctx,
          ));

          if (
            Object.keys(instance.attrs).length > 0 &&
            subTree.type !== Fragment
          ) {
            subTree.props = mergeProps(subTree.props, instance.attrs);
          }
          if (isHydrating) {
            hydrateNode(subTree, vnode.el, instance);
          } else {
            patch(null, subTree, container, anchor, instance);
          }
          vnode.el = subTree.el;
          instance.isMounted = true;
          instance.hooks.onMounted?.forEach((h) => h.call(instance.ctx));
        } else {
          instance.hooks.onBeforeUpdate?.forEach((h) => h.call(instance.ctx));
          const prevTree = instance.subTree;
          const nextTree = (instance.subTree = instance.render.call(
            instance.ctx,
            instance.ctx,
          ));
          const newAttrs = instance.attrs;
          if (Object.keys(newAttrs).length > 0 && nextTree.type !== Fragment) {
            nextTree.props = mergeProps(nextTree.props, newAttrs);
          }
          const parentContainer = prevTree.el.parentElement;
          const anchor = prevTree.el.nextSibling;
          patch(prevTree, nextTree, parentContainer, anchor, instance);
          vnode.el = nextTree.el;
          instance.hooks.onUpdated?.forEach((h) => h.call(instance.ctx));
        }
      },
      { scheduler },
    );
    instance.update = runner;
    instance.hooks.onReady?.forEach((h) => h.call(instance.ctx));
  };

  const updateComponent = (n1, n2, container) => {
    const instance = (n2.component = n1.component);

    if (!instance.parent) {
      const anchor = n1.el.nextSibling;
      unmount(n1);
      mountComponent(n2, container, anchor, null);
      return;
    }

    instance.vnode = n2;
    n2.el = n1.el;

    instance.appContext.params = n2.props.params || instance.appContext.params;

    const { props: propsOptions } = instance.type;
    const vnodeProps = n2.props || {};
    const nextProps = {};
    const nextAttrs = {};

    for (const key in vnodeProps) {
      if (propsOptions && propsOptions.hasOwnProperty(key)) {
        nextProps[key] = vnodeProps[key];
      } else {
        nextAttrs[key] = vnodeProps[key];
      }
    }

    const shouldUpdate = (prev, next) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return true;
      for (const key of nextKeys) {
        if (!prev.hasOwnProperty(key) || prev[key] !== next[key]) {
          return true;
        }
      }
      return false;
    };

    const needsUpdate =
      shouldUpdate(instance.props, nextProps) ||
      shouldUpdate(instance.attrs, nextAttrs);

    instance.attrs = nextAttrs;
    instance.slots = n2.children || {};

    if (propsOptions) {
      for (const key in propsOptions) {
        const options = propsOptions[key];
        let newValue;
        if (nextProps.hasOwnProperty(key)) {
          newValue = nextProps[key];
        } else if (options?.hasOwnProperty('default')) {
          const def = options.default;
          newValue = isFunction(def) ? def() : def;
        } else {
          newValue = undefined;
        }
        instance.internalCtx[key] = newValue;
      }
    }

    instance.props = nextProps;

    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined' &&
      window.__WEBS_DEVELOPER__
    ) {
      window.__WEBS_DEVELOPER__.notify();
    }

    if (needsUpdate && instance.update) {
      instance.update();
    }
  };

  const unmount = (vnode) => {
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof window !== 'undefined' &&
      window.__WEBS_DEVELOPER__
    ) {
      if (vnode.component && vnode.component.uid !== undefined) {
        window.__WEBS_DEVELOPER__.componentInstances.delete(
          vnode.component.uid,
        );
        window.__WEBS_DEVELOPER__.notify();
      }
    }

    if (vnode.component) {
      if (vnode.component.update && vnode.component.update.effect) {
        vnode.component.update.effect.stop();
      }
      vnode.component.hooks.onUnmounted?.forEach((h) =>
        h.call(vnode.component.ctx),
      );
      unmount(vnode.component.subTree);
      return;
    }

    if (vnode.type === Fragment || vnode.type === Teleport) {
      unmountChildren(vnode.children);
      return;
    }
    hostRemove(vnode.el);
  };

  const unmountChildren = (children) => {
    if (Array.isArray(children)) {
      children.forEach(unmount);
    }
  };

  const hydrate = (vnode, container) => {
    hydrateNode(vnode, container.firstChild, null);
    return vnode.component;
  };

  const hydrateNode = (vnode, domNode, parentComponent = null) => {
    while (
      domNode &&
      ((domNode.nodeType === 3 && !domNode.textContent.trim()) ||
        (domNode.nodeType === 8 && domNode.data === 'w'))
    ) {
      domNode = domNode.nextSibling;
    }

    if (!domNode && vnode.type !== Comment) {
      let vnodeDescription = 'a VNode';
      if (typeof vnode.type === 'string') {
        vnodeDescription = `an element <${vnode.type}>`;
      } else if (vnode.type === Text) {
        vnodeDescription = `a text node with content: "${vnode.children.trim()}"`;
      } else if (typeof vnode.type === 'object' && vnode.type.name) {
        vnodeDescription = `a component <${vnode.type.name}>`;
      }

      const parentEl =
        parentComponent?.vnode.el || document.getElementById('root');

      console.groupCollapsed(`[Hydration Error] DOM Mismatch`);
      console.error(
        `The client-side virtual DOM tree does not match the server-rendered HTML. ` +
          `This can be caused by incorrect HTML nesting, conditional rendering differences between server and client, or extra whitespace.`,
      );
      console.log(`- Expected to find: ${vnodeDescription}`);
      console.log(
        `- Instead found: Nothing. The server-rendered HTML has been fully consumed.`,
      );
      console.log('- VNode causing the error:', vnode);
      if (parentEl) {
        console.log('- Last known parent element in DOM:', parentEl);
        console.log('- Server-rendered HTML of parent:\n', parentEl.innerHTML);
      }
      console.groupEnd();

      return null;
    }

    const { type, props, children } = vnode;
    vnode.el = domNode;

    switch (type) {
      case Text:
        if (props && props['w-dynamic']) {
          if (domNode.nodeType !== 8 || domNode.data !== '[') {
            return domNode.nextSibling;
          }
          const textNode = domNode.nextSibling;
          const closingComment = textNode ? textNode.nextSibling : null;
          if (
            !closingComment ||
            closingComment.nodeType !== 8 ||
            closingComment.data !== ']'
          ) {
            return domNode.nextSibling;
          }
          vnode.el = textNode;
          return closingComment.nextSibling;
        }
        if (domNode.nodeType !== 3) {
          return domNode.nextSibling;
        }
        return domNode.nextSibling;
      case Comment:
        if (domNode && domNode.nodeType === 8) {
          return domNode.nextSibling;
        }
        return domNode;
      case Fragment:
        return hydrateChildren(
          children,
          domNode.parentElement,
          domNode,
          parentComponent,
        );
      default:
        if (isObjectAndNotArray(type)) {
          mountComponent(vnode, null, null, parentComponent, true);
          return domNode.nextSibling;
        } else if (isString(type)) {
          if (props) {
            for (const key in props) {
              hostPatchProp(domNode, key, null, props[key]);
            }
          }
          hydrateChildren(
            children,
            domNode,
            domNode.firstChild,
            parentComponent,
          );
          return domNode.nextSibling;
        }
    }
    return domNode ? domNode.nextSibling : null;
  };

  const hydrateChildren = (
    children,
    _parentDom,
    startNode,
    parentComponent = null,
  ) => {
    let nextDomNode = startNode;
    const childVnodes = Array.isArray(children)
      ? children
      : children
        ? [children]
        : [];
    for (const childVnode of childVnodes) {
      if (!childVnode) continue;
      nextDomNode = hydrateNode(childVnode, nextDomNode, parentComponent);
    }
    return nextDomNode;
  };

  return { patch, hydrate };
}

const setCurrentInstance = (instance) => {
  currentInstance = instance;
};

export function createComponent(
  vnode,
  parent,
  isSsr = false,
  _isHydrating = false,
) {
  const parentAppContext = parent ? parent.appContext : null;
  const appContext = vnode.appContext || parentAppContext || {};
  appContext.globals = appContext.globals || {};
  appContext.provides = appContext.provides || {};

  if (isSsr && !parent) {
    appContext.params = vnode.props.params || {};
  }

  const instance = {
    uid: -1,
    vnode,
    type: vnode.type,
    slots: vnode.children || {},
    attrs: {},
    props: {},
    prevAttrs: null,
    ctx: {},
    internalCtx: {},
    isMounted: false,
    subTree: null,
    update: null,
    render: null,
    appContext,
    parent,
    provides: parent
      ? Object.create(parent.provides)
      : appContext.provides || {},
    hooks: {},
  };

  const { props: propsOptions, setup, template } = instance.type;

  const vnodeProps = vnode.props || {};
  const resolvedProps = {};

  for (const key in vnodeProps) {
    if (propsOptions && propsOptions.hasOwnProperty(key)) {
      resolvedProps[key] = vnodeProps[key];
    } else {
      instance.attrs[key] = vnodeProps[key];
    }
  }
  if (propsOptions) {
    for (const key in propsOptions) {
      if (!resolvedProps.hasOwnProperty(key)) {
        const options = propsOptions[key];
        const def = options?.hasOwnProperty('default')
          ? options.default
          : undefined;
        resolvedProps[key] = isFunction(def) ? def() : def;
      }
    }
  }

  instance.props = resolvedProps;

  if (!isSsr) {
    for (const key in resolvedProps) {
      let value = resolvedProps[key];
      if (isString(value)) {
        const trimmed = value.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            resolvedProps[key] = JSON.parse(trimmed);
          } catch (e) {}
        }
      }
    }
  }

  let setupResult = {};
  if (setup) {
    const setupContext = {
      attrs: instance.attrs,
      $params: instance.appContext.params,
    };

    setCurrentInstance(instance);
    setupResult = setup(resolvedProps, setupContext) || {};
    setCurrentInstance(null);
  }

  const serverState = vnode.props.initialState || {};

  const finalState = {
    ...resolvedProps,
    ...serverState,
    ...setupResult,
  };

  instance.internalCtx = finalState;

  instance.ctx = new Proxy(
    {},
    {
      has: (_, key) =>
        key === '$params' ||
        key === '$slots' ||
        key === '$attrs' ||
        key in instance.internalCtx ||
        key in instance.type.components ||
        (instance.appContext.globals && key in instance.appContext.globals),
      get: (_, key) => {
        if (key === '$params') return instance.appContext.params;
        if (key === '$slots') return instance.slots;
        if (key === '$attrs') return instance.attrs;
        if (key in instance.internalCtx) {
          const val = instance.internalCtx[key];
          return isRef(val) ? val.value : val;
        }
        const component = instance.type.components?.[key];
        if (component) return component;
        if (instance.appContext.globals && key in instance.appContext.globals)
          return instance.appContext.globals[key];
      },
      set: (_, key, value) => {
        if (isSsr) return false;
        if (key in instance.internalCtx) {
          const s = instance.internalCtx[key];
          if (isRef(s)) {
            s.value = value;
          } else {
            instance.internalCtx[key] = value;
          }
          return true;
        }
        return false;
      },
    },
  );

  if (!instance.type.render) {
    if (isFunction(template)) {
      const htmlTagFn = (strings, ...values) => {
        let result = '';
        strings.forEach((string, i) => {
          result += string;
          if (i < values.length) {
            let value = values[i];
            if (isRef(value)) {
              value = value.value;
            }
            if (typeof value === 'object' && value !== null) {
              result += JSON.stringify(value);
            } else {
              result += value;
            }
          }
        });
        return result;
      };
      const templateString = template(htmlTagFn, instance.ctx);
      instance.render = compile({ ...instance.type, template: templateString });
    } else {
      instance.render = compile(instance.type);
    }
  } else {
    instance.render = instance.type.render;
  }

  return instance;
}

export class VNode {
  constructor(type, props, children) {
    if (
      props &&
      (Array.isArray(props) ||
        (typeof props !== 'object' && !isFunction(props)))
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

export function createVnode(type, props, children) {
  return new VNode(type, props, children);
}

export const h = createVnode;

function getLongestIncreasingSubsequence(arr) {
  if (arr.length === 0) return [];
  const p = new Array(arr.length);
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = (u + v) >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
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

export async function renderToString(vnode) {
  try {
    const context = { componentState: {} };
    const html = await renderVnode(vnode, null, context);
    return { html, componentState: context.componentState };
  } catch (e) {
    console.error(`[SSR Error] ${e.message}\n${e.stack}`);
    const html = `<div style="color:red; background:lightyellow; border: 1px solid red; padding: 1rem;">SSR Error: ${escapeHtml(e.message)}</div>`;
    return { html, componentState: {} };
  }
}

async function renderVnode(vnode, parentComponent, context) {
  if (vnode == null) return '';
  if (isString(vnode) || typeof vnode === 'number')
    return escapeHtml(String(vnode));
  if (!isObjectAndNotArray(vnode) || !vnode.type)
    return `<!-- invalid vnode detected -->`;

  const { type, props, children } = vnode;

  switch (type) {
    case Text:
      const content = escapeHtml(children);
      return props && props['w-dynamic']
        ? `<!--[-->${content}<!--]-->`
        : content;
    case Comment:
      return `<!--${escapeHtml(children)}-->`;
    case Fragment:
    case Teleport:
      return await renderChildren(children, parentComponent, context);
    default:
      if (isString(type)) {
        const tag = type.toLowerCase();
        let html = `<${tag}${renderProps(props)}>`;
        if (!voidElements.has(tag)) {
          html +=
            (await renderChildren(children, parentComponent, context)) ||
            '<!--w-->';
          html += `</${tag}>`;
        }
        return html;
      } else if (isObjectAndNotArray(type)) {
        const instance = createComponent(vnode, parentComponent, true);

        const subTree = instance.render.call(instance.ctx, instance.ctx);
        if (
          Object.keys(instance.attrs).length > 0 &&
          subTree.type !== Fragment
        ) {
          subTree.props = mergeProps(subTree.props, instance.attrs);
        }

        if (!parentComponent && context) {
          context.componentState = instance.internalCtx;
        }

        if (isFunction(instance.render)) {
          return await renderVnode(subTree, instance, context);
        }
        return `<!-- component failed to render -->`;
      }
      return `<!-- invalid vnode type -->`;
  }
}

async function renderChildren(children, parentComponent, context) {
  if (!children) return '';
  const childArray = Array.isArray(children) ? children : [children];
  let result = '';
  for (const child of childArray) {
    result += await renderVnode(child, parentComponent, context);
  }
  return result;
}

function renderProps(props) {
  let result = '';
  for (const key in props) {
    if (key === 'key' || key.startsWith('on') || key === 'w-dynamic') continue;
    const value = props[key];
    if (value === true || value === '') {
      result += ` ${key}`;
    } else if (value != null && value !== false) {
      const stringValue =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      result += ` ${key}='${escapeHtml(stringValue)}'`;
    }
  }
  return result;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (match) => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return match;
    }
  });
}
