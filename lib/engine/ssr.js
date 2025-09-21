/**
 * @file Type definitions for Server-Side Rendering (SSR) functionality.
 * @typedef {import('./vdom.js').VNodeChild} VNodeChild
 * @typedef {import('./vdom.js').VNodeChildren} VNodeChildren
 * @typedef {import('./vdom.js').Slots} Slots
 * @typedef {import('./vdom.js').Props} Props
 * @typedef {import('./component.js').ComponentInstance<any>} ComponentInstance
 */

/**
 * @typedef {object} RenderResult
 * @property {string} html - The rendered HTML string.
 * @property {object} componentState - The initial state of the components.
 */

/**
 * @typedef {object} SsrContext
 * @property {object} componentState - An object to hold the component state.
 */

/**
 * @file Handles Server-Side Rendering (SSR) of VNodes to an HTML string.
 */

import {
  isObject,
  isString,
  isFunction,
  normalizeClass,
  voidElements,
} from '../shared/utils.js';
import { createLogger } from '../shared/logger.js';
import { createComponent, mergeProps } from './component.js';
import { isRef } from './reactivity.js';
import { Text, Comment, Fragment, Teleport, VNode } from './vdom.js';

const logger = createLogger('[SSR]');

/**
 * @internal
 * @param {any} obj
 * @returns {any}
 */
function unwrapRefs(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  /** @type {Record<string, any>} */
  const res = {};
  for (const key in obj) {
    const val = /** @type {any} */ (obj)[key];
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

/**
 * Renders a VNode to an HTML string on the server.
 * @param {VNode} vnode The root VNode to render.
 * @returns {Promise<RenderResult>} An object containing the rendered HTML and the initial state.
 */
export async function renderToString(vnode) {
  try {
    /** @type {SsrContext} */
    const context = { componentState: {} };
    const html = await renderVnode(vnode, null, context);
    const unwrappedState = unwrapRefs(context.componentState);

    if (unwrappedState && /** @type {any} */ (unwrappedState).session) {
      delete (/** @type {any} */ (unwrappedState).session);
    }

    return { html, componentState: unwrappedState };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('SSR rendering error:', e);
    const html = `<div style=\"color:red; background:lightyellow; border: 1px solid red; padding: 1rem;\">SSR Error: ${escapeHtml(
      message,
    )}</div>`;
    return { html, componentState: {} };
  }
}

/**
 * @internal
 * @param {VNodeChild} vnode
 * @param {ComponentInstance | null} parentComponent
 * @param {SsrContext} context
 * @returns {Promise<string>}
 */
async function renderVnode(vnode, parentComponent, context) {
  if (vnode == null) return '';
  if (isString(vnode) || typeof vnode === 'number') {
    return escapeHtml(String(vnode));
  }
  if (!isObject(vnode) || !(vnode instanceof VNode)) {
    return `<!-- invalid vnode detected -->`;
  }

  const { type, props, children } = vnode;

  switch (type) {
    case Text:
      const content = children != null ? escapeHtml(String(children)) : '';
      return props && props['w-dynamic']
        ? `<!--[-->${content}<!--]-->`
        : content;
    case Comment:
      return `<!--${children != null ? escapeHtml(String(children)) : ''}-->`;
    case Fragment:
    case Teleport:
      if (
        isObject(children) &&
        !Array.isArray(children) &&
        !('type' in children)
      ) {
        const slots = /** @type {Slots} */ (children);
        if (slots.default) {
          const defaultContent = slots.default();
          const childArray = (
            Array.isArray(defaultContent) ? defaultContent : [defaultContent]
          ).flat();
          let result = '';
          for (const child of childArray) {
            result += await renderVnode(
              /** @type{VNodeChild} */ (child),
              parentComponent,
              context,
            );
          }
          return result;
        }
        return '';
      }
      return await renderChildren(
        /** @type {VNodeChildren | Slots} */ (children),
        parentComponent,
        context,
      );
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

        let subTree = instance.render
          ? instance.render.call(instance.ctx, instance.ctx)
          : null;

        if (!subTree) {
          return `<!--w-if-->`;
        }

        if (
          Object.keys(instance.attrs).length > 0 &&
          subTree.type !== Fragment &&
          subTree.props
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

/**
 * @internal
 * @param {VNodeChildren | Slots} children
 * @param {ComponentInstance | null} parentComponent
 * @param {SsrContext} context
 * @returns {Promise<string>}
 */
async function renderChildren(children, parentComponent, context) {
  if (!children) return '';
  const childArray = (Array.isArray(children) ? children : [children]).flat();
  let result = '';
  for (const child of childArray) {
    result += await renderVnode(
      /** @type{VNodeChild} */ (child),
      parentComponent,
      context,
    );
  }
  return result;
}

/**
 * @internal
 * @param {Props | null} props
 * @returns {string}
 */
function renderProps(props) {
  if (!props) return '';
  let result = '';
  for (const key in props) {
    if (key === 'key' || key.startsWith('on') || key === 'w-dynamic') continue;
    const value = props[key];
    if (key === 'class') {
      const classValue = normalizeClass(value);
      if (classValue) {
        result += ` class=\"${escapeHtml(classValue)}\"`;
      }
    } else if (key === 'style') {
      const styleString = isObject(value)
        ? Object.entries(value)
            .map(
              ([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`,
            )
            .join(';')
        : String(value);
      if (styleString) {
        result += ` style=\"${escapeHtml(styleString)}\"`;
      }
    } else if (typeof value === 'boolean') {
      if (value) result += ` ${key}`;
    } else if (value != null) {
      result += ` ${key}=\"${escapeHtml(String(value))}\"`;
    }
  }
  return result;
}

/**
 * @internal
 * @param {any} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>\"']/g, (match) => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '\"':
        return '&quot;';
      case "'":
        return '&#039;';
      default:
        return match;
    }
  });
}
