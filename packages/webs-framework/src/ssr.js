import { createComponent, Fragment, Text, Comment, Teleport } from './renderer';
import { compile } from './compiler.js';

const isObject = (val) =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

const isString = (val) => typeof val === 'string';

const isFunction = (val) => typeof val === 'function';

const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export async function renderToString(vnode) {
  try {
    if (vnode && vnode.type) {
      compileTemplates(vnode.type);
    }
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
  if (!isObject(vnode) || !vnode.type) return `<!-- invalid vnode detected -->`;

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
      } else if (isObject(type)) {
        if (!type.render) compileTemplates(type);

        const instance = createComponent(vnode, parentComponent, true);
        if (!parentComponent && context) {
          context.componentState = instance.internalCtx;
        }

        if (isFunction(instance.render)) {
          const subTree = instance.render.call(instance.ctx, instance.ctx);
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
        return '&#39;';
      default:
        return match;
    }
  });
}

function compileTemplates(componentDef) {
  if (componentDef.components) {
    for (const key in componentDef.components) {
      const subComponent = componentDef.components[key];
      compileTemplates(subComponent);
      if (subComponent.components) {
        Object.assign(componentDef.components, subComponent.components);
      }
    }
  }
  if (!componentDef.render && componentDef.template) {
    componentDef.render = compile(componentDef);
  }
}
