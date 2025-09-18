/**
 * @file Defines the core Virtual DOM (VDOM) structures and creation functions.
 */

import { isObject } from '../utils/lang.js';

/**
 * @typedef {import('../renderer/renderer.js').Component<any>} Component
 * @typedef {import('./component.js').ComponentInstance<any>} ComponentInstance
 * @typedef {import('../renderer/renderer.js').AppContext} AppContext
 */

/**
 * @typedef {Record<string, any>} Props
 */

/**
 * @typedef {VNode | string | number | null | undefined} VNodeChild
 */

/**
 * @typedef {VNodeChild[]} VNodeChildrenArray
 */

/**
 * @typedef {VNodeChild | VNodeChildrenArray} VNodeChildren
 */

/**
 * @typedef {Record<string, () => VNodeChildren>} Slots
 */

export const Text = Symbol('Text');
export const Comment = Symbol('Comment');
export const Fragment = Symbol('Fragment');
export const Teleport = Symbol('Teleport');
export const DynamicText = Symbol('DynamicText');

export class VNode {
  /**
   * @param {string | symbol | Component} type
   * @param {Props | null} props
   * @param {VNodeChildren | Slots | string | null} children
   */
  constructor(type, props, children) {
    this.type = type;
    this.props = props || {};
    this.children = children;
    /** @type {Node | null} */
    this.el = null;
    this.key = this.props.key;
    /** @type {ComponentInstance | null} */
    this.component = null;
    /** @type {AppContext | null} */
    this.appContext = null;
  }
}

/**
 * Low-level VNode creation. The `h` function is the public-facing API.
 * @param {string | symbol | Component} type
 * @param {Props | null} props
 * @param {VNodeChildren | string | null} [children]
 * @returns {VNode}
 */
export function createVnode(type, props, children) {
  let normalizedChildren = null;

  if (children !== undefined && children !== null) {
    if (type === Text || type === Comment) {
      normalizedChildren = Array.isArray(children)
        ? children.filter((c) => c != null).join('')
        : String(children);
    } else {
      const childNodes = Array.isArray(children) ? children : [children];
      const flattened = childNodes
        .flat()
        .filter((c) => c !== null && c !== undefined && typeof c !== 'boolean')
        .map((c) =>
          isObject(c) && 'type' in c
            ? /** @type {VNode} */ (c)
            : new VNode(Text, null, String(c)),
        );

      if (flattened.length > 0) {
        normalizedChildren = /** @type {VNodeChildrenArray} */ (flattened);
      }
    }
  }

  return new VNode(type, props, normalizedChildren);
}

/**
 * Hyperscript function for creating VNodes. Public API for manual render functions.
 * @param {string | symbol | Component} type
 * @param {Props | VNodeChildren | null} [propsOrChildren]
 * @param {...(VNodeChildren | Slots)} childrenArgs - Can be VNode children or a single slots object.
 * @returns {VNode}
 */
export function h(type, propsOrChildren, ...childrenArgs) {
  const isComponent = typeof type === 'function' || isObject(type);
  const hasProps =
    isObject(propsOrChildren) &&
    !Array.isArray(propsOrChildren) &&
    !(propsOrChildren instanceof VNode);

  const props = hasProps ? /** @type {Props} */ (propsOrChildren) : {};
  const children = hasProps ? childrenArgs : [propsOrChildren, ...childrenArgs];

  if (
    isComponent &&
    children.length === 1 &&
    isObject(children[0]) &&
    !Array.isArray(children[0]) &&
    !(/** @type {any} */ (children[0] instanceof VNode))
  ) {
    const slots = /** @type {Slots} */ (children[0]);
    return new VNode(type, props, slots);
  }

  const finalChildren = /** @type {VNodeChildren} */ (
    /** @type {unknown} */ (children)
  );
  return createVnode(type, props, finalChildren);
}
