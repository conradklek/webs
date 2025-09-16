/**
 * @file Core DOM rendering engine. Handles VDOM patching, component lifecycle, and hydration.
 */

import { effect } from '../core/reactivity.js';
import { createLogger } from '../core/logger.js';
import { isObject, isString } from '../utils/lang.js';
import {
  createComponent,
  pushInstance,
  popInstance,
  mergeProps,
  applyServerState,
} from '../core/component.js';
import {
  Text,
  Comment,
  Fragment,
  Teleport,
  DynamicText,
  createVnode,
} from '../core/vdom.js';

/**
 * @typedef {import('../core/vdom.js').VNode} VNode
 * @typedef {import('../core/vdom.js').VNodeChild} VNodeChild
 * @typedef {import('../core/vdom.js').VNodeChildren} VNodeChildren
 * @typedef {import('../core/component.js').ComponentInstance<any>} ComponentInstance
 * @typedef {import('../core/reactivity.js').ReactiveEffect} ReactiveEffect
 */

/**
 * @typedef {object} PropOptions
 * @property {any} [default] - The default value for the prop.
 */

/**
 * @typedef {import('../core/vdom.js').Slots} Slots
 * @typedef {import('../core/vdom.js').Props} Props
 */

/**
 * @typedef {object} SetupContext
 * @property {Readonly<Record<string, any>>} attrs
 * @property {Readonly<Slots>} slots
 * @property {Readonly<Record<string, any>>} params
 */

/**
 * @template T
 * @typedef {object} Component
 * @property {string} name
 * @property {Record<string, PropOptions>} [props]
 * @property {(props: Readonly<Props>, context: SetupContext) => object | void} [setup]
 * @property {string | (() => string)} [template]
 * @property {() => VNode | null} [render]
 * @property {Record<string, Component<any>>} [components]
 */

/**
 * @typedef {object} AppContext
 * @property {Record<string, Component<any>>} [components]
 * @property {object} [globals]
 * @property {Record<string | symbol, any>} [provides]
 * @property {Record<string, any>} [params]
 */

/**
 * @typedef {object} RendererOptions
 * @property {(tag: string) => Element} createElement
 * @property {(text: string) => globalThis.Text} createText
 * @property {(text: string) => globalThis.Comment} createComment
 * @property {(el: Element, text: string) => void} setElementText
 * @property {(child: Node, parent: Element, anchor?: Node | null) => void} insert
 * @property {(child: Node) => void} remove
 * @property {(el: Element, key: string, prevValue: any, nextValue: any) => void} patchProp
 * @property {(selector: string) => Element | null} querySelector
 */

/**
 * @template T
 * @typedef {object} Renderer
 * @property {(n1: VNode | null, n2: VNode | null, container: Element, anchor?: Node | null, parentComponent?: ComponentInstance | null) => void} patch
 * @property {(vnode: VNode, container: Element) => ComponentInstance | undefined | null} hydrate
 */

/**
 * @typedef {Window & { __WEBS_DEVELOPER__?: { events: { emit: (event: string, data: any) => void; } } }} DevtoolsWindow
 */

const logger = createLogger('[Renderer]');
/** @type {DevtoolsWindow} */
const devtools =
  typeof window !== 'undefined' ? /** @type {any} */ (window) : {};

/**
 * @internal
 * @param {Node | null} node
 * @returns {string}
 */
function getNodeDescription(node) {
  if (!node) return 'null';
  switch (node.nodeType) {
    case 1:
      return `<${/** @type {Element} */ (node).tagName.toLowerCase()}>`;
    case 3:
      const text = (node.textContent || '').trim();
      return `#text \"${text.length > 30 ? text.slice(0, 27) + '...' : text}\"`;
    case 8:
      return `<!--${/** @type {Comment} */ (node).data}-->`;
    default:
      return node.nodeName;
  }
}

/**
 * Creates a renderer instance with platform-specific DOM manipulation methods.
 * @param {RendererOptions} options - The platform-specific renderer options.
 * @returns {Renderer<any>} A renderer object with `patch` and `hydrate` methods.
 */
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

  /** @type {Renderer<any>['patch']} */
  const patch = (n1, n2, container, anchor = null, parentComponent = null) => {
    if (n1 === n2) {
      return;
    }

    if (n1 && !n2) {
      unmount(n1);
      return;
    }

    if (n1 && n2 && (n1.type !== n2.type || n1.key !== n2.key)) {
      const anchor = n1.el?.nextSibling ?? null;
      unmount(n1);
      patch(null, n2, container, anchor, parentComponent);
      return;
    }

    if (!n2) {
      return;
    }

    const { type } = n2;
    switch (type) {
      case Text:
        logger.debug('Patching Text node.');
        n2.el = n1 ? n1.el : hostCreateText(/**@type {string}*/ (n2.children));
        if (n1) {
          if (n2.children !== n1.children) {
            /** @type {Node} */ (n2.el).textContent = String(n2.children);
          }
        } else {
          hostInsert(/**@type {Node}*/ (n2.el), container, anchor);
        }
        break;
      case Comment:
        logger.debug('Patching Comment node.');
        n2.el = n1
          ? n1.el
          : hostCreateComment(/**@type {string}*/ (n2.children));
        if (!n1) {
          hostInsert(/**@type {Node}*/ (n2.el), container, anchor);
        }
        break;
      case Fragment:
        logger.debug('Patching Fragment node.');
        if (!n1) {
          const childrenToPatch = Array.isArray(n2.children)
            ? n2.children
            : [n2.children];
          childrenToPatch.forEach((c) => {
            const childVnode =
              isString(c) || typeof c === 'number'
                ? createVnode(Text, null, c)
                : /** @type {VNode} */ (c);
            patch(null, childVnode, container, anchor, parentComponent);
          });
        } else {
          patchChildren(n1, n2, container, anchor, parentComponent);
        }
        break;
      case Teleport:
        logger.debug('Patching Teleport node.');
        if (n2.props?.to) {
          const target = hostQuerySelector(n2.props.to);
          if (target) {
            patchChildren(n1, n2, target, null, parentComponent);
          }
        }
        break;
      case DynamicText:
        logger.debug('Patching Dynamic Text node.');
        const dummyN1 = { type: Fragment, children: n1?.children };
        const dummyN2 = { type: Fragment, children: n2.children };

        patchChildren(
          /** @type {VNode} */ (dummyN1),
          /** @type {VNode} */ (dummyN2),
          container,
          anchor,
          parentComponent,
        );
        break;
      default:
        if (isString(type)) {
          logger.debug(`Patching native element: <${type}>`);
          patchElement(n1, n2, container, anchor, parentComponent);
        } else if (isObject(type)) {
          logger.debug(
            `Patching component: <${
              /** @type {Component<any>} */ (type).name
            }>`,
          );
          if (!n1) {
            mountComponent(n2, container, anchor, parentComponent);
          } else {
            updateComponent(n1, n2);
          }
        }
    }
  };

  /**
   * @param {VNode | null} n1
   * @param {VNode} n2
   * @param {Element} container
   * @param {Node | null} anchor
   * @param {ComponentInstance | null} parentComponent
   */
  const patchElement = (n1, n2, container, anchor, parentComponent) => {
    const el = (n2.el = n1
      ? /** @type {Element} */ (n1.el)
      : hostCreateElement(/**@type {string}*/ (n2.type)));
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

    patchChildren(n1, n2, el, anchor, parentComponent);
    if (!n1) {
      hostInsert(el, container, anchor);
    }
  };

  /**
   * @param {VNode | null} n1
   * @param {VNode} n2
   * @param {Element} container
   * @param {Node | null} anchor
   * @param {ComponentInstance | null} parentComponent
   */
  const patchChildren = (n1, n2, container, anchor, parentComponent) => {
    const c1 = n1?.children;
    const c2 = n2?.children;

    if (isString(c2)) {
      if (c1 && !isString(c1)) {
        unmountChildren(/** @type {VNodeChildren} */ (c1));
      }
      hostSetElementText(container, c2);
      return;
    }
    /** @param {any} c */
    const isSlotsObject = (c) =>
      isObject(c) && !('type' in c) && !Array.isArray(c);
    const oldChildren =
      c1 && !isSlotsObject(c1) ? (Array.isArray(c1) ? c1 : [c1]).flat() : [];
    const newChildren =
      c2 && !isSlotsObject(c2) ? (Array.isArray(c2) ? c2 : [c2]).flat() : [];

    if (newChildren.length === 0) {
      if (oldChildren.length > 0) {
        unmountChildren(/** @type {VNodeChildren} */ (oldChildren));
      }
      if (!isString(c1)) {
        hostSetElementText(container, '');
      }
      return;
    }

    if (oldChildren.length === 0) {
      newChildren.forEach((c) => {
        // @ts-ignore
        if (c && (c.type !== Text || c.children?.trim())) {
          patch(
            null,
            /** @type {VNode} */ (c),
            container,
            anchor,
            parentComponent,
          );
        }
      });
      return;
    }

    const oldVNodes = /** @type {VNode[]} */ (oldChildren.filter(isObject));
    const newVNodes = /** @type {VNode[]} */ (newChildren.filter(isObject));

    if (newVNodes.some((child) => child.key != null)) {
      patchKeyedChildren(oldVNodes, newVNodes, container, parentComponent);
    } else {
      patchUnkeyedChildren(oldVNodes, newVNodes, container, parentComponent);
    }
  };

  /**
   * @param {VNode[]} c1
   * @param {VNode[]} c2
   * @param {Element} container
   * @param {ComponentInstance | null} parentComponent
   */
  const patchUnkeyedChildren = (c1, c2, container, parentComponent) => {
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);

    for (let i = 0; i < commonLength; i++) {
      const nextChild = c2[i];
      const oldChild = c1[i];
      if (nextChild && oldChild) {
        patch(oldChild, nextChild, container, null, parentComponent);
      }
    }
    if (newLength > oldLength) {
      for (let i = commonLength; i < newLength; i++) {
        const nextChild = c2[i];
        if (nextChild) {
          patch(null, nextChild, container, null, parentComponent);
        }
      }
    } else if (oldLength > newLength) {
      unmountChildren(c1.slice(commonLength));
    }
  };

  /**
   * @param {VNode[]} c1
   * @param {VNode[]} c2
   * @param {Element} container
   * @param {ComponentInstance | null} parentComponent
   */
  const patchKeyedChildren = (c1, c2, container, parentComponent) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;

    while (i <= e1 && i <= e2) {
      const p = c1[i];
      const n = c2[i];
      if (p && n && p.key === n.key) {
        patch(p, n, container, null, parentComponent);
        i++;
      } else {
        break;
      }
    }
    while (i <= e1 && i <= e2) {
      const p = c1[e1];
      const n = c2[e2];
      if (p && n && p.key === n.key) {
        patch(p, n, container, null, parentComponent);
        e1--;
        e2--;
      } else {
        break;
      }
    }

    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos]?.el : null;
        while (i <= e2) {
          const nextChild = c2[i++];
          if (nextChild)
            patch(null, nextChild, container, anchor, parentComponent);
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        const oldChild = c1[i++];
        if (oldChild) unmount(oldChild);
      }
    } else {
      const s1 = i,
        s2 = i;
      /** @type {Map<any, number>} */
      const keyToNewIndexMap = new Map();
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i];
        if (nextChild?.key != null) {
          keyToNewIndexMap.set(nextChild.key, i);
        }
      }
      const toBePatched = e2 - s2 + 1;
      const newIndexToOldIndexMap = new Array(toBePatched).fill(0);
      let moved = false;
      let maxNewIndexSoFar = 0;
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i];
        if (prevChild) {
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
            const nextChild = c2[newIndex];
            if (nextChild)
              patch(prevChild, nextChild, container, null, parentComponent);
          }
        }
      }
      const increasingNewIndexSequence = moved
        ? getLongestIncreasingSubsequence(newIndexToOldIndexMap)
        : [];
      let j = increasingNewIndexSequence.length - 1;
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i;
        const nextChild = c2[nextIndex];
        const anchor = nextIndex + 1 < l2 ? c2[nextIndex + 1]?.el : null;
        if (newIndexToOldIndexMap[i] === 0) {
          if (nextChild)
            patch(null, nextChild, container, anchor, parentComponent);
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            if (nextChild?.el) {
              hostInsert(nextChild.el, container, anchor);
            }
          } else {
            j--;
          }
        }
      }
    }
  };

  /**
   * @param {VNode} vnode
   * @param {Element} container
   * @param {Node | null} anchor
   * @param {ComponentInstance | null} parentComponent
   * @param {boolean} [isHydrating=false]
   */
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
    ));

    const runner = effect(
      () => {
        pushInstance(instance);

        if (!instance.isMounted) {
          instance.hooks.onBeforeMount?.forEach((h) => h.call(instance.ctx));
          let subTree = instance.render.call(instance.ctx, instance.ctx);

          if (!subTree) {
            subTree = createVnode(Comment, null, 'w-if');
          }
          instance.subTree = subTree;

          if (
            Object.keys(instance.attrs).length > 0 &&
            subTree.type !== Fragment &&
            subTree.props
          ) {
            subTree.props = mergeProps(subTree.props, instance.attrs);
          }

          if (isHydrating) {
            if (!vnode.el) {
              logger.warn(
                `Hydration failed for <${instance.type.name}>: no DOM element to hydrate against.`,
              );
            }
            const parentEl = vnode.el ? vnode.el.parentElement : null;
            if (!parentEl) {
              logger.warn(
                `Hydration failed for component <${instance.type.name}>: DOM node is detached.`,
              );
            }
            hydrateNode(subTree, vnode.el, parentEl, instance);
          } else {
            patch(null, subTree, container, anchor, instance);
          }

          vnode.el = subTree.el;
          if (subTree.type === Fragment) {
            /** @type {any[]} */
            const children = (
              Array.isArray(subTree.children)
                ? subTree.children
                : [subTree.children]
            )
              .flat()
              .filter(Boolean);
            for (let i = children.length - 1; i >= 0; i--) {
              const child = children[i];
              if (isObject(child) && /** @type {VNode} */ (child).el) {
                instance.lastEl = /** @type {VNode} */ (child).el;
                break;
              }
            }
            for (let i = 0; i < children.length; i++) {
              const child = children[i];
              if (isObject(child) && /** @type {VNode} */ (child).el) {
                vnode.el = /** @type {VNode} */ (child).el;
                break;
              }
            }
          } else {
            instance.lastEl = subTree.el;
          }

          instance.isMounted = true;
          instance.hooks.onMounted?.forEach((h) => h.call(instance.ctx));

          if (devtools && devtools.__WEBS_DEVELOPER__) {
            devtools.__WEBS_DEVELOPER__.events.emit('component:added', {
              uid: instance.uid,
              parentId: instance.parent ? instance.parent.uid : null,
              name: instance.type.name || 'Anonymous',
              props: instance.props,
              state: instance.internalCtx,
            });
          }
        } else {
          instance.hooks.onBeforeUpdate?.forEach((h) => h.call(instance.ctx));
          const prevTree = instance.subTree;
          let nextTree = instance.render.call(instance.ctx, instance.ctx);

          if (!nextTree) {
            nextTree = createVnode(Comment, null, 'w-if');
          }
          instance.subTree = nextTree;

          const newAttrs = instance.attrs;
          if (
            Object.keys(newAttrs).length > 0 &&
            nextTree.type !== Fragment &&
            nextTree.props
          ) {
            nextTree.props = mergeProps(nextTree.props, newAttrs);
          }

          let anchorNodeForParent = prevTree?.el;

          if (prevTree?.type === Fragment && prevTree.children) {
            const children = Array.isArray(prevTree.children)
              ? prevTree.children
              : [prevTree.children];
            if (children.length > 0 && isObject(children[0])) {
              anchorNodeForParent = /** @type {VNode}*/ (children[0]).el;
            }
          }

          const parentContainer = anchorNodeForParent
            ? anchorNodeForParent.parentElement
            : null;

          if (parentContainer) {
            patch(prevTree, nextTree, parentContainer, null, instance);
            vnode.el = nextTree.el;
            instance.hooks.onUpdated?.forEach((h) => h.call(instance.ctx));
            if (devtools && devtools.__WEBS_DEVELOPER__) {
              devtools.__WEBS_DEVELOPER__.events.emit('component:updated', {
                uid: instance.uid,
                props: instance.props,
                state: instance.internalCtx,
              });
            }
          }
        }

        popInstance();
      },
      undefined,
      {
        scheduler: () => {
          if (instance.update) instance.update();
        },
      },
    );
    instance.update = runner;
    instance.hooks.onReady?.forEach((h) => h.call(instance.ctx));
  };
  /**
   * @param {Props} prevProps
   * @param {Props} nextProps
   * @returns {boolean}
   */
  const hasPropsChanged = (prevProps, nextProps) => {
    const nextKeys = Object.keys(nextProps);
    if (nextKeys.length !== Object.keys(prevProps).length) return true;
    for (const key of nextKeys) {
      if (nextProps[key] !== prevProps[key]) return true;
    }
    return false;
  };

  /**
   * @param {VNode} n1
   * @param {VNode} n2
   * @returns {boolean}
   */
  const shouldUpdateComponent = (n1, n2) => {
    const { props: prevProps, children: prevChildren } = n1;
    const { props: nextProps, children: nextChildren } = n2;

    if (prevChildren || nextChildren) return true;
    if (prevProps === nextProps) return false;
    if (!prevProps) return !!nextProps;
    if (!nextProps) return true;

    return hasPropsChanged(prevProps, nextProps);
  };

  /**
   * @param {VNode} n1
   * @param {VNode} n2
   */
  const updateComponent = (n1, n2) => {
    const instance = (n2.component = /** @type {ComponentInstance} */ (
      n1.component
    ));

    if (!shouldUpdateComponent(n1, n2)) {
      n2.el = n1.el;
      instance.vnode = n2;
      return;
    }

    instance.vnode = n2;
    n2.el = n1.el;

    const { props: propsOptions } = instance.type;
    const vnodeProps = n2.props || {};
    const nextProps = {};
    const nextAttrs = {};

    for (const key in vnodeProps) {
      if (
        propsOptions &&
        Object.prototype.hasOwnProperty.call(propsOptions, key)
      ) {
        /** @type {any} */ (nextProps)[key] = vnodeProps[key];
      } else {
        /** @type {any} */ (nextAttrs)[key] = vnodeProps[key];
      }
    }

    instance.attrs = nextAttrs;
    instance.slots = /** @type {Slots} */ (n2.children) || {};

    if (instance.hooks.onPropsReceived) {
      instance.hooks.onPropsReceived.forEach((h) =>
        h.call(instance.ctx, nextProps, instance.props),
      );
    }

    if (propsOptions) {
      for (const key in propsOptions) {
        const options = propsOptions[key];
        let newValue;
        if (Object.prototype.hasOwnProperty.call(nextProps, key)) {
          newValue = /** @type {any} */ (nextProps)[key];
        } else if (options?.hasOwnProperty('default')) {
          const def = options.default;
          newValue = typeof def === 'function' ? def() : def;
        } else {
          newValue = undefined;
        }
        /** @type {any} */ (instance.internalCtx)[key] = newValue;
      }
    }
    instance.props = nextProps;

    if (vnodeProps.initialState) {
      applyServerState(instance.internalCtx, vnodeProps.initialState);
    }

    if (instance.update) {
      instance.update();
    }
  };

  /** @param {VNode | VNodeChild} vnode */
  const unmount = (vnode) => {
    if (!vnode || !isObject(vnode)) return;

    if (vnode.component) {
      if (devtools && devtools.__WEBS_DEVELOPER__) {
        devtools.__WEBS_DEVELOPER__.events.emit('component:removed', {
          uid: vnode.component.uid,
        });
      }

      if (vnode.component.update) {
        /** @type {any} */ (vnode.component.update).effect?.stop();
      }
      vnode.component.hooks.onUnmounted?.forEach((/** @type {any} */ h) =>
        h.call(vnode.component?.ctx),
      );
      unmount(vnode.component.subTree);
      return;
    }
    if (vnode.type === Fragment || vnode.type === Teleport) {
      if (vnode.children) {
        unmountChildren(/** @type {VNodeChildren} */ (vnode.children));
      }
      return;
    }
    if (vnode.el) {
      hostRemove(vnode.el);
    }
  };

  /** @param {VNodeChildren} children */
  const unmountChildren = (children) => {
    const childrenToUnmount = (
      Array.isArray(children) ? children : [children]
    ).filter(Boolean);
    childrenToUnmount.forEach(unmount);
  };

  /** @type {Renderer<any>['hydrate']} */
  const hydrate = (vnode, container) => {
    if (!container.firstChild) {
      patch(null, vnode, container);
      return vnode.component;
    }
    const rootDomNode = skipNonEssentialNodes(container.firstChild);
    if (!rootDomNode) {
      patch(null, vnode, container);
      return vnode.component;
    }

    hydrateNode(vnode, rootDomNode, container, null);
    return vnode.component;
  };

  /**
   * @param {Node | null} node
   * @returns {Node | null}
   */
  const skipNonEssentialNodes = (node) => {
    let currentNode = node;
    while (
      currentNode &&
      (currentNode.nodeType === 8 ||
        (currentNode.nodeType === 3 &&
          (currentNode.textContent || '').trim() === ''))
    ) {
      currentNode = currentNode.nextSibling;
    }
    return currentNode;
  };

  /**
   * @param {VNode} vnode
   * @param {Node | null} domNode
   * @param {Element | null} parentDom
   * @param {ComponentInstance | null} parentComponent
   * @returns {Node | null}
   */
  const hydrateNode = (vnode, domNode, parentDom, parentComponent = null) => {
    if (!vnode) {
      return domNode;
    }

    if (isObject(vnode.type)) {
      vnode.el = domNode;
      if (parentDom) {
        mountComponent(vnode, parentDom, domNode, parentComponent, true);
      }
      const lastNode = vnode.component?.lastEl;
      return lastNode ? lastNode.nextSibling : domNode;
    }

    if (vnode.type === Fragment) {
      const nextDomNode = hydrateChildren(
        /** @type {VNodeChildren} */ (vnode.children),
        /** @type {Element} */ (parentDom),
        domNode,
        parentComponent,
      );
      /** @type {any[]} */
      const childVnodes = (
        Array.isArray(vnode.children) ? vnode.children : [vnode.children]
      )
        .flat()
        .filter(Boolean);

      const firstChildVnode = childVnodes.find(
        (c) => isObject(c) && /**@type {VNode}*/ (c).el,
      );

      if (isObject(firstChildVnode)) {
        vnode.el = /**@type {VNode}*/ (firstChildVnode).el;
      }
      return nextDomNode;
    }

    let currentDomNode = skipNonEssentialNodes(/**@type {Node}*/ (domNode));

    if (!currentDomNode || !parentDom) {
      if (parentDom) {
        patch(null, vnode, parentDom, null, parentComponent);
      }
      return null;
    }

    const { type, props, children } = vnode;

    /**
     * @param {string} expected
     * @param {string} found
     * @param {VNode} vnodeDetails
     * @returns {Node | null}
     */
    const handleMismatch = (expected, found, vnodeDetails) => {
      logger.error(
        `[Hydration Mismatch] Expected ${expected}, but found ${found}.`,
        vnodeDetails,
      );
      if (process.env.NODE_ENV !== 'production') {
        patch(null, vnode, parentDom, currentDomNode, parentComponent);
        if (currentDomNode) hostRemove(currentDomNode);
        return vnode.el ? vnode.el.nextSibling : null;
      } else {
        return currentDomNode?.nextSibling ?? null;
      }
    };

    if (type === Text && props && props['w-dynamic']) {
      if (
        currentDomNode &&
        currentDomNode.nodeType === 8 &&
        /**@type {Comment}*/ (currentDomNode).data === '['
      ) {
        const textNode = currentDomNode.nextSibling;
        const closingComment = textNode ? textNode.nextSibling : null;

        if (
          closingComment &&
          closingComment.nodeType === 8 &&
          /**@type {Comment}*/ (closingComment).data === ']'
        ) {
          vnode.el = textNode;
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
            /** @type {VNode} */ ({
              expectedContent: vnode.children,
              ...vnode,
            }),
          );
        } else if (
          String(currentDomNode.textContent) !== String(vnode.children)
        ) {
          if (process.env.NODE_ENV !== 'production') {
            currentDomNode.textContent = String(vnode.children);
          }
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
        if (props && props.to) {
          return hydrateChildren(
            /** @type {VNodeChildren} */ (children),
            hostQuerySelector(props.to),
            null,
            parentComponent,
          );
        }
        return currentDomNode.nextSibling;
      default:
        if (isString(type)) {
          const vnodeTagName = type.toLowerCase();
          const domTagName = /** @type {Element} */ (
            currentDomNode
          )?.tagName?.toLowerCase();

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
              hostPatchProp(
                /**@type {Element}*/ (currentDomNode),
                key,
                null,
                props[key],
              );
            }
          }
          hydrateChildren(
            /** @type {VNodeChildren} */ (children),
            /**@type {Element}*/ (currentDomNode),
            currentDomNode.firstChild,
            parentComponent,
          );
          return currentDomNode.nextSibling;
        }
    }
    return currentDomNode ? currentDomNode.nextSibling : null;
  };

  /**
   * @param {VNodeChildren} children
   * @param {Element | null} parentDom
   * @param {Node | null} startNode
   * @param {ComponentInstance | null} parentComponent
   * @returns {Node | null}
   */
  const hydrateChildren = (
    children,
    parentDom,
    startNode,
    parentComponent = null,
  ) => {
    let nextDomNode = startNode;
    if (!children || !parentDom) {
      return nextDomNode;
    }

    const childVnodes = (
      Array.isArray(children) ? children : [children]
    ).flat();

    for (const childVnode of childVnodes) {
      if (!childVnode) continue;
      nextDomNode = hydrateNode(
        /** @type {VNode} */ (childVnode),
        nextDomNode,
        parentDom,
        parentComponent,
      );
    }
    return nextDomNode;
  };

  return { patch, hydrate };
}

/**
 * @internal
 * @param {number[]} arr
 * @returns {number[]}
 */
function getLongestIncreasingSubsequence(arr) {
  if (arr.length === 0) return [];
  /** @type {(number | undefined)[]} */
  const p = new Array(arr.length);
  const result = [0];
  let i, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0 && arrI != null) {
      const j = result[result.length - 1];
      if (j !== undefined) {
        const arrJ = arr[j];
        if (arrJ != null && arrJ < arrI) {
          p[i] = j;
          result.push(i);
          continue;
        }
      }

      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = (u + v) >> 1;
        const resultC = result[c];
        if (resultC !== undefined) {
          const arrResultC = arr[resultC];
          if (arrResultC != null && arrResultC < arrI) {
            u = c + 1;
          } else {
            v = c;
          }
        }
      }
      const resultU = result[u];
      if (resultU !== undefined) {
        const arrResultU = arr[resultU];
        if (arrResultU && arrI != null && arrI < arrResultU) {
          if (u > 0) {
            const prevResult = result[u - 1];
            if (prevResult !== undefined) p[i] = prevResult;
          }
          result[u] = i;
        }
      }
    }
  }
  u = result.length;
  let v_ = result[u - 1];
  if (v_ === undefined) return [];

  /** @type {number} */
  let currentV = v_;

  while (u-- > 0) {
    result[u] = currentV;
    const p_v_ = p[currentV];
    if (p_v_ === undefined) break;
    currentV = p_v_;
  }
  return result;
}
