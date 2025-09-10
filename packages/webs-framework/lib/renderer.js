import { effect, isRef } from './reactivity.js';
import { compile, compileCache } from './compiler.js';
import {
  isObject,
  isString,
  isFunction,
  normalizeClass,
  createLogger,
  voidElements,
} from './shared.js';

const logger = createLogger('[Renderer]');
const devtools = typeof window !== 'undefined' && window.__WEBS_DEVELOPER__;

let instanceIdCounter = 0;

function getNodeDescription(node) {
  if (!node) return 'null';
  switch (node.nodeType) {
    case 1:
      return `<${node.tagName.toLowerCase()}>`;
    case 3:
      const text = node.textContent.trim();
      return `#text "${text.length > 30 ? text.slice(0, 27) + '...' : text}"`;
    case 8:
      return `<!--${node.data}-->`;
    default:
      return node.nodeName;
  }
}

export const Text = Symbol('Text');
export const Comment = Symbol('Comment');
export const Fragment = Symbol('Fragment');
export const Teleport = Symbol('Teleport');

let currentInstance = null;
const instanceStack = [];

export function provide(key, value) {
  if (!currentInstance) return;
  if (currentInstance.provides === currentInstance.parent?.provides) {
    currentInstance.provides = Object.create(
      currentInstance.parent.provides || null,
    );
  }
  currentInstance.provides[key] = value;
}

export function inject(key, defaultValue) {
  if (!currentInstance) return defaultValue;

  let instance = currentInstance;
  while (instance) {
    if (instance.provides && key in instance.provides) {
      return instance.provides[key];
    }
    instance = instance.parent;
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
export const onPropsReceived = createLifecycleMethod('onPropsReceived');

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

function applyServerState(targetState, serverState) {
  logger.debug('Applying server state...', {
    targetState: { ...targetState },
    serverState: { ...serverState },
  });
  if (!isObject(targetState) || !isObject(serverState)) return;

  for (const key in serverState) {
    if (!serverState.hasOwnProperty(key)) continue;
    const serverVal = serverState[key];
    const existing = targetState[key];

    if (isRef(existing)) {
      if (existing.value !== serverVal) {
        logger.debug(`Updating ref for key: ${key}`, {
          from: existing.value,
          to: serverVal,
        });
        if (isObject(existing.value) && isObject(serverVal)) {
          applyServerState(existing.value, serverVal);
        } else {
          existing.value = serverVal;
        }
      }
    } else if (Array.isArray(existing) && Array.isArray(serverVal)) {
      logger.debug(`Updating array for key: ${key}`);
      existing.length = 0;
      existing.push(...serverVal);
    } else if (
      isObject(existing) &&
      isObject(serverVal) &&
      !Array.isArray(existing)
    ) {
      logger.debug(`Recursively applying state for key: ${key}`);
      applyServerState(existing, serverVal);
    } else {
      logger.debug(`Directly setting state for key: ${key}`);
      targetState[key] = serverVal;
    }
  }
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

    if (n1 && (!n2 || n1.type !== n2.type || n1.key !== n2.key)) {
      unmount(n1);
      n1 = null;
    }

    if (!n2) {
      return;
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
        }
        break;
      default:
        if (isString(type)) {
          patchElement(n1, n2, container, anchor, parentComponent);
        } else if (isObject(type)) {
          if (!n1) {
            mountComponent(n2, container, anchor, parentComponent);
          } else {
            updateComponent(n1, n2);
          }
        }
    }
  };

  const patchElement = (n1, n2, container, anchor, parentComponent) => {
    const el = (n2.el = n1 ? n1.el : hostCreateElement(n2.type));
    const oldProps = n1?.props || {};
    const newProps = n2.props || {};

    for (const key in newProps) {
      hostPatchProp(el, key, oldProps[key], newProps[key]);
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
    logger.log(
      `Mounting component: <${vnode.type.name || 'Anonymous'}>. Hydrating: ${isHydrating}`,
    );
    const instance = (vnode.component = createComponent(
      vnode,
      parentComponent,
      false,
      isHydrating,
    ));

    const runner = effect(
      () => {
        instanceStack.push(instance);
        currentInstance = instance;

        if (!instance.isMounted) {
          logger.debug(`- BeforeMount hook for <${instance.type.name}>`);
          instance.hooks.onBeforeMount?.forEach((h) => h.call(instance.ctx));
          let subTree = instance.render.call(instance.ctx, instance.ctx);

          if (!subTree) {
            subTree = createVnode(Comment, null, 'w-if');
          }
          instance.subTree = subTree;

          if (
            Object.keys(instance.attrs).length > 0 &&
            subTree.type !== Fragment
          ) {
            subTree.props = mergeProps(subTree.props, instance.attrs);
          }

          if (isHydrating) {
            logger.debug(`- Hydrating DOM for <${instance.type.name}>`);
            if (!vnode.el) {
              logger.warn(
                `- Hydration failed for <${instance.type.name}>: no DOM element to hydrate against.`,
              );
            }
            const parentEl = vnode.el ? vnode.el.parentElement : null;
            if (!parentEl) {
              logger.warn(
                `- Hydration failed for component <${instance.type.name}>: DOM node is detached.`,
              );
            }
            hydrateNode(subTree, vnode.el, parentEl, instance);
          } else {
            logger.debug(`- Patching new DOM for <${instance.type.name}>`);
            patch(null, subTree, container, anchor, instance);
          }

          vnode.el = subTree.el;
          if (subTree.type === Fragment) {
            const children = (
              Array.isArray(subTree.children)
                ? subTree.children
                : [subTree.children]
            ).flat();
            for (let i = children.length - 1; i >= 0; i--) {
              if (children[i] && children[i].el) {
                instance.lastEl = children[i].el;
                break;
              }
            }
            for (let i = 0; i < children.length; i++) {
              if (children[i] && children[i].el) {
                vnode.el = children[i].el;
                break;
              }
            }
          } else {
            instance.lastEl = subTree.el;
          }

          instance.isMounted = true;
          logger.debug(`- Mounted hook for <${instance.type.name}>`);
          instance.hooks.onMounted?.forEach((h) => h.call(instance.ctx));

          if (devtools) {
            devtools.events.emit('component:added', {
              uid: instance.uid,
              parentId: instance.parent ? instance.parent.uid : null,
              name: instance.type.name || 'Anonymous',
              props: instance.props,
              state: instance.internalCtx,
            });
          }
        } else {
          logger.debug(`- Updating component <${instance.type.name}>`);
          instance.hooks.onBeforeUpdate?.forEach((h) => h.call(instance.ctx));
          const prevTree = instance.subTree;
          let nextTree = instance.render.call(instance.ctx, instance.ctx);

          if (!nextTree) {
            nextTree = createVnode(Comment, null, 'w-if');
          }
          instance.subTree = nextTree;
          logger.debug(
            `[VDOM Diff] <${instance.type.name}> Before:`,
            prevTree,
            'After:',
            nextTree,
          );

          const newAttrs = instance.attrs;
          if (Object.keys(newAttrs).length > 0 && nextTree.type !== Fragment) {
            nextTree.props = mergeProps(nextTree.props, newAttrs);
          }

          let anchorNodeForParent = prevTree.el;

          if (prevTree.type === Fragment && prevTree.children) {
            const children = Array.isArray(prevTree.children)
              ? prevTree.children
              : [prevTree.children];
            if (children.length > 0 && children[0]) {
              anchorNodeForParent = children[0].el;
            }
          }

          const parentContainer = anchorNodeForParent
            ? anchorNodeForParent.parentElement
            : null;

          if (parentContainer) {
            patch(prevTree, nextTree, parentContainer, null, instance);
            vnode.el = nextTree.el;
            logger.debug(`- Updated hook for <${instance.type.name}>`);
            instance.hooks.onUpdated?.forEach((h) => h.call(instance.ctx));
            if (devtools) {
              devtools.events.emit('component:updated', {
                uid: instance.uid,
                props: instance.props,
                state: instance.internalCtx,
              });
            }
          }
        }

        instanceStack.pop();
        currentInstance = instanceStack[instanceStack.length - 1] || null;
      },
      {
        scheduler: () => {
          if (instance.update) instance.update();
        },
      },
    );
    instance.update = runner;
    instance.hooks.onReady?.forEach((h) => h.call(instance.ctx));
  };

  const hasPropsChanged = (prevProps, nextProps) => {
    const nextKeys = Object.keys(nextProps);
    if (nextKeys.length !== Object.keys(prevProps).length) return true;
    for (const key of nextKeys) {
      if (nextProps[key] !== prevProps[key]) return true;
    }
    return false;
  };

  const shouldUpdateComponent = (n1, n2) => {
    const { props: prevProps, children: prevChildren } = n1;
    const { props: nextProps, children: nextChildren } = n2;

    if (prevChildren || nextChildren) return true;
    if (prevProps === nextProps) return false;
    if (!prevProps) return !!nextProps;
    if (!nextProps) return true;

    return hasPropsChanged(prevProps, nextProps);
  };

  const updateComponent = (n1, n2) => {
    const instance = (n2.component = n1.component);
    const oldProps = { ...(n1.props || {}) };
    const newProps = { ...(n2.props || {}) };
    logger.debug(`Updating component instance <${instance.type.name}>`, {
      oldProps,
      newProps,
    });

    if (!shouldUpdateComponent(n1, n2)) {
      n2.el = n1.el;
      instance.vnode = n2;
      logger.log(
        `Component <${instance.type.name}> update skipped as props and children are identical.`,
      );
      return;
    }

    instance.vnode = n2;
    n2.el = n1.el;

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

    instance.attrs = nextAttrs;
    instance.slots = n2.children || {};

    if (instance.hooks.onPropsReceived) {
      instance.hooks.onPropsReceived.forEach((h) =>
        h.call(instance.ctx, nextProps, instance.props),
      );
    }

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

    if (vnodeProps.initialState) {
      logger.log(
        `Component <${instance.type.name}> received new initialState, applying...`,
        vnodeProps.initialState,
      );
      applyServerState(instance.internalCtx, vnodeProps.initialState);
    }

    if (instance.update) {
      instance.update();
    }
  };

  const unmount = (vnode) => {
    if (!vnode) return;

    if (vnode.component) {
      logger.debug(`Unmounting component: <${vnode.type.name || 'Anonymous'}>`);

      if (devtools) {
        devtools.events.emit('component:removed', { uid: vnode.component.uid });
      }

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
    if (vnode.el) {
      hostRemove(vnode.el);
    }
  };

  const unmountChildren = (children) => {
    if (Array.isArray(children)) {
      children.forEach(unmount);
    }
  };

  const hydrate = (vnode, container) => {
    logger.log('Starting client-side hydration process...');
    if (!container.firstChild) {
      logger.warn(
        'Hydration container is empty, falling back to patch (mount).',
      );
      patch(null, vnode, container);
      return vnode.component;
    }
    const rootDomNode = skipNonEssentialNodes(container.firstChild);
    if (!rootDomNode) {
      logger.warn(
        'Hydration container contains no visible DOM nodes. Falling back to patch.',
      );
      patch(null, vnode, container);
      return vnode.component;
    }

    hydrateNode(vnode, rootDomNode, container, null);
    logger.log('Hydration complete.');
    return vnode.component;
  };

  const skipNonEssentialNodes = (node) => {
    let currentNode = node;
    while (
      currentNode &&
      (currentNode.nodeType === 8 ||
        (currentNode.nodeType === 3 && currentNode.textContent.trim() === ''))
    ) {
      currentNode = currentNode.nextSibling;
    }
    return currentNode;
  };

  const hydrateNode = (vnode, domNode, parentDom, parentComponent = null) => {
    if (!vnode) {
      logger.debug('- HydrateNode: VNode is null, returning current DOM node.');
      return domNode;
    }
    if (isObject(vnode.type)) {
      logger.debug(`- Hydrating Component VNode: <${vnode.type.name}>`);
      vnode.el = domNode;
      mountComponent(vnode, parentDom, domNode, parentComponent, true);
      const lastNode = vnode.component.lastEl;
      return lastNode ? lastNode.nextSibling : domNode;
    }

    const vnodeTypeStr = isString(vnode.type)
      ? vnode.type
      : vnode.type.toString();
    logger.debug(`- Hydrating VNode of type: ${vnodeTypeStr}`);

    if (vnode.type === Fragment) {
      logger.debug('-- VNode is a Fragment.');
      const nextDomNode = hydrateChildren(
        vnode.children,
        parentDom,
        domNode,
        parentComponent,
      );
      const childVnodes = (
        Array.isArray(vnode.children) ? vnode.children : [vnode.children]
      ).flat();

      const firstChildVnode = childVnodes.find((c) => c && c.el);

      if (firstChildVnode) {
        vnode.el = firstChildVnode.el;
      }
      return nextDomNode;
    }

    let currentDomNode = skipNonEssentialNodes(domNode);
    logger.debug(
      `-- Current DOM node to hydrate against: ${getNodeDescription(currentDomNode)}`,
    );

    if (!currentDomNode) {
      logger.warn(
        '-- DOM node is null. Mismatch found. Patching VNode into parent.',
        { vnode, parentDom },
      );
      patch(null, vnode, parentDom, null, parentComponent);
      return null;
    }

    const { type, props, children } = vnode;

    const handleMismatch = (expected, found, vnodeDetails) => {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug(
          `[HMR Hydration Info] Mismatch is expected during dev. Expected ${expected}, found ${found}. Patching DOM.`,
          vnodeDetails,
        );
        patch(null, vnode, parentDom, currentDomNode, parentComponent);
        hostRemove(currentDomNode);
        return vnode.el ? vnode.el.nextSibling : null;
      } else {
        logger.warn(
          `[Hydration Mismatch] Expected ${expected}, but found ${found}`,
          vnodeDetails,
        );
        return currentDomNode.nextSibling;
      }
    };

    if (type === Text && props && props['w-dynamic']) {
      if (
        currentDomNode &&
        currentDomNode.nodeType === 8 &&
        currentDomNode.data === '['
      ) {
        const textNode = currentDomNode.nextSibling;
        const closingComment = textNode ? textNode.nextSibling : null;

        if (
          closingComment &&
          closingComment.nodeType === 8 &&
          closingComment.data === ']'
        ) {
          vnode.el = textNode;
          logger.debug('-- Hydrated dynamic text block successfully.');
          return closingComment.nextSibling;
        } else {
          return handleMismatch(
            "closing comment '<!--]-->'",
            getNodeDescription(closingComment),
            vnode,
          );
        }
      }
    }

    vnode.el = currentDomNode;

    switch (type) {
      case Text:
        if (!currentDomNode || currentDomNode.nodeType !== 3) {
          return handleMismatch(
            'a text node',
            getNodeDescription(currentDomNode),
            { expectedContent: vnode.children, vnode },
          );
        } else if (
          String(currentDomNode.textContent) !== String(vnode.children)
        ) {
          return handleMismatch(
            `text content "${vnode.children}"`,
            `"${currentDomNode.textContent}"`,
            vnode,
          );
        }
        return currentDomNode.nextSibling;

      case Comment:
        if (!currentDomNode || currentDomNode.nodeType !== 8) {
          return handleMismatch(
            'a comment node',
            getNodeDescription(currentDomNode),
            vnode,
          );
        }
        return currentDomNode.nextSibling;
      case Teleport:
        return hydrateChildren(
          children,
          hostQuerySelector(props.to),
          null,
          parentComponent,
        );
      default:
        if (isString(type)) {
          const vnodeTagName = type.toLowerCase();
          const domTagName = currentDomNode?.tagName?.toLowerCase();

          if (
            !currentDomNode ||
            currentDomNode.nodeType !== 1 ||
            domTagName !== vnodeTagName
          ) {
            return handleMismatch(
              `element <${type}>`,
              getNodeDescription(currentDomNode),
              vnode,
            );
          }
          if (props) {
            for (const key in props) {
              hostPatchProp(currentDomNode, key, null, props[key]);
            }
          }
          hydrateChildren(
            children,
            currentDomNode,
            currentDomNode.firstChild,
            parentComponent,
          );
          return currentDomNode.nextSibling;
        }
    }
    return currentDomNode ? currentDomNode.nextSibling : null;
  };

  const hydrateChildren = (
    children,
    parentDom,
    startNode,
    parentComponent = null,
  ) => {
    let nextDomNode = startNode;
    if (!children) return nextDomNode;

    const childVnodes = (
      Array.isArray(children) ? children : [children]
    ).flat();

    for (const childVnode of childVnodes) {
      if (!childVnode) continue;
      nextDomNode = hydrateNode(
        childVnode,
        nextDomNode,
        parentDom,
        parentComponent,
      );
    }
    return nextDomNode;
  };

  return { patch, hydrate };
}

function createComponent(vnode, parent, isSsr = false, _isHydrating = false) {
  const parentAppContext = parent ? parent.appContext : null;
  const appContext = vnode.appContext || parentAppContext || {};
  appContext.globals = appContext.globals || {};
  appContext.provides = appContext.provides || {};

  if (isSsr) {
    logger.debug(`SSR: Creating component instance for <${vnode.type.name}>`);
  }

  const instance = {
    uid: instanceIdCounter++,
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
      ? parent.provides
      : Object.create(appContext.provides || null),
    hooks: {},
    lastEl: null,
  };

  const { props: propsOptions, setup } = instance.type;
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

  let setupResult = {};
  if (setup) {
    const setupContext = {
      attrs: instance.attrs,
      slots: instance.slots,
      params: instance.appContext.params || {},
    };

    instanceStack.push(instance);
    currentInstance = instance;

    setupResult = setup(resolvedProps, setupContext) || {};

    instanceStack.pop();
    currentInstance = instanceStack[instanceStack.length - 1] || null;
  }

  if (!isSsr) {
    const serverState = (vnode.props || {}).initialState || {};
    logger.debug(
      `Applying initial server state to <${instance.type.name}> component`,
      { serverState },
    );
    const finalState = { ...resolvedProps, ...setupResult };
    applyServerState(finalState, serverState);
    instance.internalCtx = finalState;
  } else {
    instance.internalCtx = { ...resolvedProps, ...setupResult };
  }

  instance.ctx = new Proxy(
    {},
    {
      has: (_, key) =>
        key in instance.internalCtx ||
        key === '$attrs' ||
        key === '$slots' ||
        key === '$props' ||
        (instance.appContext.params && key === 'params') ||
        (instance.type.components && key in instance.type.components) ||
        (instance.appContext.components &&
          key in instance.appContext.components) ||
        (instance.appContext.globals && key in instance.appContext.globals),
      get: (_, key) => {
        if (key in instance.internalCtx) {
          const val = instance.internalCtx[key];
          return isRef(val) ? val.value : val;
        }
        if (instance.appContext.params && key === 'params') {
          return instance.appContext.params;
        }
        if (key === '$attrs') {
          return instance.attrs;
        }
        if (key === '$slots') {
          return instance.slots;
        }
        if (key === '$props') {
          const allProps = { ...instance.props };
          for (const key in allProps) {
            if (isRef(allProps[key])) {
              allProps[key] = allProps[key].value;
            }
          }
          return allProps;
        }

        if (isSsr) {
          const allComponents = {
            ...(instance.type.components || {}),
            ...(instance.appContext.components || {}),
          };
          if (key in allComponents) {
            logger.debug(`SSR: Resolved component <${key}>`);
            return allComponents[key];
          }
        }

        if (instance.type.components && key in instance.type.components)
          return instance.type.components[key];
        if (
          instance.appContext.components &&
          key in instance.appContext.components
        )
          return instance.appContext.components[key];
        if (instance.appContext.globals && key in instance.appContext.globals)
          return instance.appContext.globals[key];

        if (isSsr) {
          logger.warn(
            `SSR: Component or property "${key}" not found on instance <${instance.type.name}>`,
          );
        }
        return undefined;
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

  instance.render = compile(instance.type, {
    globalComponents: instance.appContext.components,
  });

  return instance;
}

export class VNode {
  constructor(type, props, children) {
    this.type = type;
    this.props = props;
    this.children = children;
    this.el = null;
    this.key = props && props.key;
    this.component = null;
  }
}

export function createVnode(type, propsOrChildren, children) {
  let props = {};
  let finalChildren = null;

  if (isObject(propsOrChildren) && !Array.isArray(propsOrChildren)) {
    props = propsOrChildren;
    if (arguments.length > 2) {
      finalChildren = Array.prototype.slice.call(arguments, 2);
    }
  } else {
    finalChildren =
      arguments.length > 1 ? Array.prototype.slice.call(arguments, 1) : [];
  }

  if (Array.isArray(finalChildren)) {
    if (finalChildren.length === 1) {
      finalChildren = finalChildren[0];
    } else if (finalChildren.length === 0) {
      finalChildren = null;
    }
  }

  if (arguments.length > 2) {
    const lastArg = arguments[arguments.length - 1];
    if (isObject(lastArg) && !lastArg.type) {
      finalChildren = lastArg;
    }
  } else if (isObject(children) && !Array.isArray(children) && !children.type) {
    finalChildren = children;
  }

  if (Array.isArray(finalChildren)) {
    finalChildren = finalChildren.flat().filter(Boolean);
  }

  return new VNode(type, props, finalChildren);
}

export const h = (...args) => {
  if (typeof args[0] === 'function' || typeof args[0] === 'object') {
    const [type, props, children] = args;
    if (args.length === 3 && isObject(children) && !Array.isArray(children)) {
      return new VNode(type, props || {}, children);
    }
  }
  return createVnode(...args);
};

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

function unwrapRefs(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const res = {};
  for (const key in obj) {
    const val = obj[key];
    if (isRef(val)) {
      res[key] = unwrapRefs(val.value);
    } else if (Array.isArray(val)) {
      res[key] = val.map(unwrapRefs);
    } else if (
      typeof val === 'object' &&
      val !== null &&
      !(val instanceof Set) &&
      !(val instanceof Map)
    ) {
      res[key] = unwrapRefs(val);
    } else {
      res[key] = val;
    }
  }
  return res;
}

export async function renderToString(vnode) {
  try {
    const context = { componentState: {} };
    const html = await renderVnode(vnode, null, context);
    const unwrappedState = unwrapRefs(context.componentState);

    if (unwrappedState && unwrappedState.session) {
      delete unwrappedState.session;
    }

    return { html, componentState: unwrappedState };
  } catch (e) {
    const html = `<div style="color:red; background:lightyellow; border: 1px solid red; padding: 1rem;">SSR Error: ${escapeHtml(
      e.message,
    )}</div>`;
    return { html, componentState: {} };
  }
}

async function renderVnode(vnode, parentComponent, context) {
  if (vnode == null) return '';
  if (isString(vnode) || typeof vnode === 'number') {
    return escapeHtml(String(vnode));
  }
  if (!isObject(vnode) || !vnode.type) {
    return `<!-- invalid vnode detected -->`;
  }

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
      if (isObject(children) && !Array.isArray(children)) {
        const slotContent = children.default ? children.default() : [];
        return await renderChildren(slotContent, parentComponent, context);
      }
      return await renderChildren(children, parentComponent, context);
    default:
      if (isString(type)) {
        const tag = type.toLowerCase();
        let html = `<${tag}${renderProps(props)}>`;
        if (!voidElements.has(tag)) {
          html += await renderChildren(children, parentComponent, context);
          html += `</${tag}>`;
        }
        return html;
      } else if (isObject(type)) {
        const instance = createComponent(vnode, parentComponent, true);

        if (parentComponent) {
          instance.appContext.components = {
            ...(parentComponent.appContext.components || {}),
            ...(parentComponent.type.components || {}),
            ...(instance.type.components || {}),
          };
        }

        let subTree = instance.render.call(instance.ctx, instance.ctx);

        if (!subTree) {
          return `<!--w-if-->`;
        }

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
  if (!props) return '';
  let result = '';
  for (const key in props) {
    if (key === 'key' || key.startsWith('on') || key === 'w-dynamic') continue;
    const value = props[key];
    if (key === 'class') {
      result += ` class="${escapeHtml(normalizeClass(value))}"`;
    } else if (key === 'style') {
      const styleString = isObject(value)
        ? Object.entries(value)
            .map(
              ([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`,
            )
            .join(';')
        : value;
      result += ` style="${escapeHtml(styleString)}"`;
    } else if (typeof value === 'boolean') {
      if (value) result += ` ${key}`;
    } else if (value != null) {
      result += ` ${key}="${escapeHtml(String(value))}"`;
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
        return '&#039;';
      default:
        return match;
    }
  });
}
