/**
 * @file Type definitions for the compiler.
 */

/** @typedef {import('./vdom.js').VNode} VNode */
/** @typedef {import('./renderer.js').Component<any>} Component */
/** @typedef {import('./expression-evaluator.js').AstNode} JsAstNode */
/** @typedef {import('./template-parser.js').HtmlAstNode} HtmlAstNode */
/** @typedef {import('./template-parser.js').ElementNode} ElementNode */
/** @typedef {import('./template-parser.js').AttributeToken} AttributeToken */

/**
 * @typedef {object} ComponentOptions
 * @property {Record<string, Component>} [globalComponents]
 */

/**
 * @typedef {Window & { __WEBS_DEVELOPER__?: { events: { emit: (event: string, data: any) => void; } } }} DevtoolsWindow
 */

/**
 * Enum for intermediate AST node types used by the compiler.
 * @enum {number}
 */
export const NODE_TYPES = {
  ROOT: 0,
  ELEMENT: 1,
  COMPONENT: 2,
  TEXT: 3,
  INTERPOLATION: 4,
  COMMENT: 5,
  FRAGMENT: 6,
  IF: 7,
  FOR: 8,
  SLOT: 9,
  DYNAMIC_TEXT: 10,
};

/**
 * Enum for intermediate AST attribute types used by the compiler.
 * @enum {number}
 */
export const ATTR_TYPES = {
  STATIC: 10,
  DIRECTIVE: 11,
  EVENT_HANDLER: 12,
};

/**
 * @file Compiles component templates into optimized render functions.
 */

import { parseHtml } from './template-parser.js';
import { parseJs, tokenizeJs } from './expression-evaluator.js';
import * as VDOM from './vdom.js';
import { createLogger } from '../shared/logger.js';

/** @typedef {import('./expression-evaluator.js').JsToken} JsToken */
/** @typedef {import('./expression-evaluator.js').LiteralNode} LiteralNode */
/** @typedef {import('./expression-evaluator.js').IdentifierNode} IdentifierNode */
/** @typedef {import('./expression-evaluator.js').TemplateLiteralNode} TemplateLiteralNode */
/** @typedef {import('./expression-evaluator.js').ObjectExpressionNode} ObjectExpressionNode */
/** @typedef {import('./expression-evaluator.js').ArrayExpressionNode} ArrayExpressionNode */
/** @typedef {import('./expression-evaluator.js').BinaryExpressionNode} BinaryExpressionNode */
/** @typedef {import('./expression-evaluator.js').UnaryExpressionNode} UnaryExpressionNode */
/** @typedef {import('./expression-evaluator.js').MemberExpressionNode} MemberExpressionNode */
/** @typedef {import('./expression-evaluator.js').ComputedMemberExpressionNode} ComputedMemberExpressionNode */
/** @typedef {import('./expression-evaluator.js').CallExpressionNode} CallExpressionNode */
/** @typedef {import('./expression-evaluator.js').ConditionalExpressionNode} ConditionalExpressionNode */
/** @typedef {import('./expression-evaluator.js').AssignmentExpressionNode} AssignmentExpressionNode */
/** @typedef {import('./expression-evaluator.js').ArrowFunctionExpressionNode} ArrowFunctionExpressionNode */
/** @typedef {import('./template-parser.js').IfBlockNode} IfBlockNode */
/** @typedef {import('./template-parser.js').ElseIfBlockNode} ElseIfBlockNode */
/** @typedef {import('./template-parser.js').EachBlockNode} EachBlockNode */
/** @typedef {import('./template-parser.js').TextNode} TextNode */
/** @typedef {import('./template-parser.js').CommentNode} CommentNode */

/**
 * @internal
 * @type {DevtoolsWindow}
 */
const devtools =
  typeof window !== 'undefined' ? window : /** @type {DevtoolsWindow} */ ({});

const logger = createLogger('[Compiler]');

/**
 * @internal
 * Caches the result of a function that takes a string argument.
 * @param {(str: string) => string} fn The function to memoize.
 * @returns {(str: string) => string} The memoized function.
 */
const cacheStringFunction = (fn) => {
  const cache = Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};

/**
 * @internal
 * Converts kebab-case to camelCase.
 * @type {(str: string) => string}
 */
const camelize = cacheStringFunction((str) => {
  /**
   * @param {string} _
   * @param {string} character
   */
  return str.replace(/-(\w)/g, (_, character) =>
    character ? character.toUpperCase() : '',
  );
});

/**
 * @internal
 * Generates the body of a render function from a transformed AST.
 * @param {any} ast The transformed Abstract Syntax Tree of the template.
 * @returns {{ fn: (_ctx: object) => VNode | null, source: string }} The generated render function and its source code.
 */
export function generateRenderFn(ast) {
  const ctx = {
    /** @type {Set<string>} */
    scope: new Set(),
    /** @param {JsAstNode | null} expr
     * @returns {string}
     */
    genExpr(expr) {
      if (!expr) return 'null';
      switch (expr.type) {
        case 'Identifier':
          return this.scope.has(/** @type {IdentifierNode} */ (expr).name)
            ? /** @type {IdentifierNode} */ (expr).name
            : `_ctx.${/** @type {IdentifierNode} */ (expr).name}`;
        case 'Literal':
          return JSON.stringify(/** @type {LiteralNode} */ (expr).value);
        case 'TemplateLiteral': {
          let code = '`';
          let i = 0;
          const templateNode = /** @type {TemplateLiteralNode} */ (expr);
          for (const quasi of templateNode.quasis) {
            code += quasi.value.raw.replace(/`/g, '\\`');
            if (!quasi.tail) {
              const expression = templateNode.expressions[i++];
              if (expression) {
                code += `\${${this.genExpr(expression)}}`;
              }
            }
          }
          code += '`';
          return code;
        }
        case 'ObjectExpression': {
          const props = /** @type {ObjectExpressionNode} */ (expr).properties
            .map((p) => {
              const key =
                p.key.type === 'Identifier'
                  ? `'${/** @type {IdentifierNode} */ (p.key).name}'`
                  : this.genExpr(p.key);
              const value = this.genExpr(p.value);
              return `${key}: ${value}`;
            })
            .join(',');
          return `{${props}}`;
        }
        case 'ArrayExpression': {
          return `[${
            /** @type {ArrayExpressionNode} */ (expr).elements
              .map((e) => this.genExpr(e))
              .join(',')
          }]`;
        }
        case 'BinaryExpression':
          const binaryNode = /** @type {BinaryExpressionNode} */ (expr);
          return `(${this.genExpr(binaryNode.left)} ${
            binaryNode.operator
          } ${this.genExpr(binaryNode.right)})`;
        case 'UnaryExpression':
          const unaryNode = /** @type {UnaryExpressionNode} */ (expr);
          return `${unaryNode.operator}${this.genExpr(unaryNode.argument)}`;
        case 'MemberExpression': {
          const memberNode = /** @type {MemberExpressionNode} */ (expr);
          const objectExpr = this.genExpr(memberNode.object);
          const propertyName = memberNode.property.name;
          return `(${objectExpr}?.${propertyName})`;
        }
        case 'ComputedMemberExpression':
          const computedNode = /** @type {ComputedMemberExpressionNode} */ (
            expr
          );
          return `${this.genExpr(computedNode.object)}[${this.genExpr(
            computedNode.property,
          )}]`;
        case 'CallExpression':
          const callNode = /** @type {CallExpressionNode} */ (expr);
          return `${this.genExpr(callNode.callee)}(${callNode.arguments
            .map((a) => this.genExpr(a))
            .join(',')})`;
        case 'ConditionalExpression':
          const conditionalNode = /** @type {ConditionalExpressionNode} */ (
            expr
          );
          return `(${this.genExpr(conditionalNode.test)} ? ${this.genExpr(
            conditionalNode.consequent,
          )} : ${this.genExpr(conditionalNode.alternate)})`;
        case 'AssignmentExpression':
          const assignmentNode = /** @type {AssignmentExpressionNode} */ (expr);
          return `(${this.genExpr(assignmentNode.left)} = ${this.genExpr(
            assignmentNode.right,
          )})`;
        default:
          return 'null';
      }
    },
    /** @param {any[]} props
     * @returns {string}
     */
    genProps(props) {
      /** @param {any} p */
      const genProp = (p) => {
        if (p.type === ATTR_TYPES.STATIC) {
          return `'${p.name}': ${JSON.stringify(p.value)}`;
        }
        if (p.type === ATTR_TYPES.DIRECTIVE)
          return `'${p.name}': ${this.genExpr(p.expression)}`;
        if (p.type === ATTR_TYPES.EVENT_HANDLER) {
          this.scope.add('$event');
          const exprCode = this.genExpr(p.expression);
          this.scope.delete('$event');

          let handlerBody = exprCode;
          if (p.expression && p.expression.type === 'Identifier') {
            handlerBody = `${exprCode}($event)`;
          }
          if (p.modifiers && p.modifiers.has('prevent')) {
            handlerBody = `$event.preventDefault(); ${handlerBody}`;
          }
          if (p.modifiers && p.modifiers.has('stop')) {
            handlerBody = `$event.stopPropagation(); ${handlerBody}`;
          }

          return `'${p.name}': ($event) => { ${handlerBody} }`;
        }
        return '';
      };
      return `{${props
        .map((p) => p && genProp(p))
        .filter(Boolean)
        .join(',')}}`;
    },
    /** @param {Record<string, any[]>} slots
     * @returns {string}
     */
    genSlots(slots) {
      const slotEntries = Object.entries(slots).map(([name, children]) => {
        return `'${name}': () => ${this.genChildren(children)}`;
      });
      return `{ ${slotEntries.join(', ')} }`;
    },
    /** @param {any[] | any} children
     * @returns {string}
     */
    genChildren(children) {
      if (!children || (Array.isArray(children) && children.length === 0)) {
        return '[]';
      }
      const childNodes = (Array.isArray(children) ? children : [children])
        .map((/** @type {HtmlAstNode} */ c) => this.genNode(c))
        .filter((c) => c && c !== 'null');

      if (childNodes.length === 0) return '[]';
      return `[${childNodes.join(',')}]`;
    },
    /** @param {any} node
     * @returns {string}
     */
    genNode(node) {
      if (!node) return 'null';

      switch (node.type) {
        case NODE_TYPES.ROOT: {
          const childrenCode = this.genChildren(node.children);
          if (!node.children || node.children.length === 0) return 'null';
          if (node.children.length === 1) {
            return this.genNode(node.children[0]);
          }
          return `_h(_Fragment, {}, ${childrenCode})`;
        }
        case NODE_TYPES.FRAGMENT:
          const fragmentChildren = (
            Array.isArray(node.children) ? node.children : [node.children]
          )
            .map((/** @type {HtmlAstNode} */ c) => this.genNode(c))
            .filter(Boolean);
          if (fragmentChildren.length === 0) return 'null';
          if (fragmentChildren.length === 1) return fragmentChildren[0];
          return `_h(_Fragment, {}, [${fragmentChildren.join(',')}])`;
        case NODE_TYPES.COMPONENT: {
          const slots = this.genSlots(node.slots);
          let componentAccess;
          if (node.isDynamic) {
            const dynamicNameExpr = this.genExpr(node.tagName);
            componentAccess = `_ctx[${dynamicNameExpr}]`;
          } else {
            componentAccess = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(node.tagName)
              ? `_ctx.${node.tagName}`
              : `_ctx['${node.tagName}']`;
          }

          return `_h(${componentAccess}, ${this.genProps(
            node.properties,
          )}, ${slots})`;
        }
        case NODE_TYPES.ELEMENT: {
          let props = this.genProps(node.properties);
          if (node.key) {
            const keyExpr = this.genExpr(node.key);
            if (props.length > 2) {
              props = `{ 'key': ${keyExpr}, ${props.slice(1, -1)} }`;
            } else {
              props = `{ 'key': ${keyExpr} }`;
            }
          }
          return `_h('${node.tagName}', ${props}, ${this.genChildren(
            node.children,
          )})`;
        }
        case NODE_TYPES.TEXT:
          return `_h(_Text, {}, ${JSON.stringify(node.value)})`;
        case NODE_TYPES.INTERPOLATION:
          return `_h(_Text, { 'w-dynamic': true }, String(${this.genExpr(
            node.expression,
          )}))`;
        case NODE_TYPES.COMMENT:
          return `_h(_Comment, {}, ${JSON.stringify(node.value)})`;
        case NODE_TYPES.SLOT: {
          const slotName = node.name || 'default';
          const fallbackContent = this.genChildren(node.children);
          const slotOutlet = `(_ctx.$slots && typeof _ctx.$slots['${slotName}'] === 'function' && _ctx.$slots['${slotName}']())`;
          const normalizedSlots = `(Array.isArray(${slotOutlet}) ? ${slotOutlet} : (${slotOutlet} ? [${slotOutlet}] : null))`;
          const finalChildren = `${normalizedSlots} || ${fallbackContent}`;

          return `_h(_Fragment, {}, ...(${finalChildren} || []))`;
        }
        case NODE_TYPES.IF: {
          /**
           * @param {any} branch
           * @param {number} index
           * @returns {string}
           */
          const genBranch = (branch, index) => {
            if (!branch) return 'null';
            const alternate = node.branches[index + 1]
              ? genBranch(node.branches[index + 1], index + 1)
              : 'null';
            return `(${this.genExpr(
              branch.condition,
            )}) ? ${this.genNode(branch.node)} : ${alternate}`;
          };
          return genBranch(node.branches[0], 0);
        }
        case NODE_TYPES.FOR: {
          const { source, value, key, keyName } = node;
          const params = key ? `(${value}, ${key})` : value;
          this.scope.add(value);
          if (key) this.scope.add(key);

          const childNode = this.genNode(node.children[0]);

          let childCode = childNode;
          if (keyName) {
            childCode = `(() => {
                const child = ${childNode};
                if (child && child.props) child.props.key = ${this.genExpr(
                  keyName,
                )};
                return child;
            })()`;
          }

          this.scope.delete(value);
          if (key) this.scope.delete(key);
          return `_h(_Fragment, {}, (${this.genExpr(
            source,
          )} || []).map(${params} => ${childCode}))`;
        }
        case NODE_TYPES.DYNAMIC_TEXT: {
          const childrenCode = this.genChildren(node.children);
          return `_h(_DynamicText, {}, ${childrenCode})`;
        }
      }
      return 'null';
    },
  };
  const functionBody = `
const { h: _h, Text: _Text, Fragment: _Fragment, Comment: _Comment, DynamicText: _DynamicText } = VDOM;
return ${ctx.genNode(ast) || 'null'};
`;
  try {
    logger.debug('Generated render function source:', functionBody);
    /** @type {(_ctx: object) => VNode | null} */
    const fn = new Function('VDOM', '_ctx', functionBody).bind(null, VDOM);
    return { fn, source: functionBody };
  } catch (e) {
    logger.error('Render function compilation error', e, functionBody);
    /** @type {() => VNode} */
    const errorFn = () =>
      VDOM.h(VDOM.Comment, {}, 'Render function compile error');
    return {
      fn: errorFn,
      source: `return VDOM.h(VDOM.Comment, {}, 'Render function compile error');`,
    };
  }
}

/** @type {Map<string, JsAstNode | null>} */
const parseExprCache = new Map();

export class Compiler {
  /**
   * @param {Component} componentDef
   * @param {ComponentOptions | null} options
   */
  constructor(componentDef, options = null) {
    this.definition = componentDef;
    /** @type {Map<string, string>} */
    this.componentNameMap = new Map();
    const allComponents = {
      ...(componentDef.components || {}),
      ...(options?.globalComponents || {}),
    };

    /** @param {Record<string, Component> | undefined} comps */
    const collectComponents = (comps) => {
      if (!comps) return;
      for (const key in comps) {
        const compDef = comps[key];
        if (compDef && typeof compDef === 'object') {
          this.componentNameMap.set(key.toLowerCase(), key);
          if (compDef.components) {
            collectComponents(compDef.components);
          }
        }
      }
    };

    collectComponents(allComponents);
    this.options = options;
  }

  /** @param {string} html */
  parseHtml(html) {
    logger.debug('Parsing HTML template:', html);
    const ast = parseHtml(html);
    logger.debug('Parsed HTML AST:', JSON.stringify(ast, null, 2));
    return ast;
  }

  compile() {
    logger.info(`Starting compilation for component: ${this.definition.name}`);
    const rawAst = this.parseHtml(
      /** @type {string} */ (this.definition.template),
    );
    const transformedAst = this._transformNode(rawAst);
    logger.debug('Transformed AST:', JSON.stringify(transformedAst, null, 2));
    const { fn, source } = generateRenderFn(transformedAst);
    logger.info('Compilation finished.');

    devtools?.__WEBS_DEVELOPER__?.events.emit('component:compiled', {
      name: this.definition.name,
      template: this.definition.template,
      source: source,
    });

    return fn;
  }

  /**
   * @param {string | null | undefined} str
   * @returns {JsAstNode | null}
   */
  _parseExpr(str) {
    if (str === null || str === undefined) return null;
    const cleanStr = String(str).replace(/\n/g, ' ').trim();
    if (!cleanStr) return null;
    if (parseExprCache.has(cleanStr)) {
      return parseExprCache.get(cleanStr) || null;
    }

    try {
      const ast = parseJs(tokenizeJs(cleanStr));
      parseExprCache.set(cleanStr, ast);
      return ast;
    } catch (e) {
      logger.error(`Expression parsing error for: \"${cleanStr}\"`, e);
      return null;
    }
  }

  /**
   * @param {HtmlAstNode[]} children
   * @returns {Record<string, any>}
   */
  _processSlots(children) {
    /** @type {Record<string, any>} */
    const slots = {};
    const defaultChildren = [];

    for (const child of children) {
      if (
        child.type === 'element' &&
        /** @type {ElementNode} */ (child).tagName === 'template'
      ) {
        const slotAttr = /** @type {ElementNode} */ (child).attributes.find(
          (/**@type {{name: string}}*/ a) => a.name.startsWith('#'),
        );
        if (slotAttr) {
          const slotName = slotAttr.name.substring(1) || 'default';
          slots[slotName] = this._transformChildren(child.children || []);
          continue;
        }
      }
      if (
        child.type === 'text' &&
        !(/** @type {TextNode} */ (child).content.trim())
      ) {
        continue;
      }
      defaultChildren.push(child);
    }

    if (defaultChildren.length > 0) {
      slots.default = this._transformChildren(defaultChildren);
    }

    return slots;
  }
  /**
   * @param {HtmlAstNode} node
   * @returns {any}
   */
  _transformNode(node) {
    switch (node.type) {
      case 'root':
        return {
          type: NODE_TYPES.ROOT,
          children: this._transformChildren(node.children || []),
        };
      case 'element':
        return this._transformElement(/** @type {ElementNode} */ (node));
      case 'text':
        return this._transformText(node);
      case 'comment':
        return {
          type: NODE_TYPES.COMMENT,
          value: /** @type {CommentNode} */ (node).content,
        };
      case 'ifBlock':
      case 'eachBlock':
        return this._transformBlock(node);
      default:
        return null;
    }
  }

  /**
   * @param {HtmlAstNode} node
   * @returns {any}
   */
  _transformText(node) {
    const text = /** @type {TextNode} */ (node).content;
    if (!text.includes('{{')) {
      return { type: NODE_TYPES.TEXT, value: text };
    }
    const mustacheRegex = /{{([^}]+)}}/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    mustacheRegex.lastIndex = 0;
    while ((match = mustacheRegex.exec(text))) {
      if (match.index > lastIndex) {
        parts.push({
          type: NODE_TYPES.TEXT,
          value: text.substring(lastIndex, match.index),
        });
      }
      const expression = match[1]?.trim();
      if (expression) {
        parts.push({
          type: NODE_TYPES.INTERPOLATION,
          expression: this._parseExpr(expression),
        });
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ type: NODE_TYPES.TEXT, value: text.substring(lastIndex) });
    }

    return { type: NODE_TYPES.DYNAMIC_TEXT, children: parts };
  }

  /**
   * @param {HtmlAstNode[]} children
   * @returns {any[]}
   */
  _transformChildren(children) {
    const transformed = [];
    let i = 0;
    while (i < children.length) {
      const child = children[i];
      if (!child) {
        i++;
        continue;
      }
      if (child.type === 'ifBlock') {
        /** @type {{condition: JsAstNode | null, node: any}[]} */
        const branches = [];
        /** @type {HtmlAstNode | undefined} */
        let current = child;
        let nextIndex = i + 1;
        while (current) {
          if (current.type === 'ifBlock' || current.type === 'elseIfBlock') {
            branches.push({
              condition: this._parseExpr(
                /** @type {IfBlockNode | ElseIfBlockNode} */ (current).test,
              ),
              node: {
                type: NODE_TYPES.FRAGMENT,
                children: this._transformChildren(current.children || []),
              },
            });
          } else if (current.type === 'elseBlock') {
            branches.push({
              condition: this._parseExpr('true'),
              node: {
                type: NODE_TYPES.FRAGMENT,
                children: this._transformChildren(current.children || []),
              },
            });
          }

          const next = children[nextIndex];
          if (
            next &&
            (next.type === 'elseIfBlock' || next.type === 'elseBlock')
          ) {
            current = next;
            nextIndex++;
          } else {
            current = undefined;
          }
        }
        transformed.push({ type: NODE_TYPES.IF, branches });
        i = nextIndex;
        continue;
      }

      const transformedNode = this._transformNode(child);
      if (transformedNode) {
        transformed.push(transformedNode);
      }
      i++;
    }
    return transformed;
  }

  /**
   * @param {any} block
   * @returns {any}
   */
  _transformBlock(block) {
    if (block.type === 'eachBlock') {
      let itemStr = String(/** @type {EachBlockNode} */ (block).item).trim();
      let keyExpr = /** @type {EachBlockNode} */ (block).key;

      if (!keyExpr && itemStr.endsWith(')') && !itemStr.startsWith('(')) {
        const parenIndex = itemStr.lastIndexOf('(');
        if (parenIndex !== -1) {
          keyExpr = itemStr.substring(parenIndex + 1, itemStr.length - 1);
          itemStr = itemStr.substring(0, parenIndex).trim();
        }
      }

      const match = itemStr.match(/^\(?\s*(\w+)(?:\s*,\s*(\w+))?\s*\)?$/);

      if (!match) {
        logger.error('Invalid each block item syntax:', itemStr);
        return null;
      }

      const valueMatch = match[1];
      const keyMatch = match[2];

      if (!valueMatch) return null;

      return {
        type: NODE_TYPES.FOR,
        source: this._parseExpr(
          /** @type {EachBlockNode} */ (block).expression,
        ),
        value: valueMatch,
        key: keyMatch,
        keyName: this._parseExpr(keyExpr),
        children: this._transformChildren(block.children),
      };
    }
    return null;
  }

  /**
   * @param {ElementNode} el
   * @returns {any}
   */
  _transformElement(el) {
    if (el.tagName === 'slot') {
      const nameAttr = el.attributes.find(
        (/**@type {{name: string}}*/ a) => a.name === 'name',
      );
      return {
        type: NODE_TYPES.SLOT,
        name: nameAttr ? String(nameAttr.value) : 'default',
        children: this._transformChildren(el.children),
      };
    }

    return this._transformNativeElement(el);
  }

  /**
   * @param {ElementNode} el
   * @returns {any}
   */
  _transformNativeElement(el) {
    if (el.tagName === 'component') {
      const isAttr = el.attributes.find(
        (/**@type {{name: string}}*/ a) => a.name === ':is' || a.name === 'is',
      );
      if (isAttr && typeof isAttr.value === 'string') {
        return {
          type: NODE_TYPES.COMPONENT,
          tagName: this._parseExpr(isAttr.value),
          isDynamic: true,
          properties: this._processAttributes(
            el.attributes.filter(
              (/**@type {{name: string}}*/ a) =>
                a.name !== ':is' && a.name !== 'is',
            ),
          ),
          slots: this._processSlots(el.children),
        };
      }
    }

    const tagName = el.tagName;
    const registeredCompKey = this.componentNameMap.get(tagName.toLowerCase());
    const isComponent = !!registeredCompKey;

    if (isComponent) {
      return {
        type: NODE_TYPES.COMPONENT,
        tagName: registeredCompKey,
        properties: this._processAttributes(el.attributes),
        slots: this._processSlots(el.children),
      };
    } else {
      return {
        type: NODE_TYPES.ELEMENT,
        tagName: tagName,
        properties: this._processAttributes(el.attributes),
        children: this._transformChildren(el.children),
      };
    }
  }

  /**
   * @param {AttributeToken[]} attrs
   * @returns {any[]}
   */
  _processAttributes(attrs) {
    const properties = [];
    /** @type {Set<number>} */
    const consumedIndices = new Set();

    for (let i = 0; i < attrs.length; i++) {
      if (consumedIndices.has(i)) continue;

      const attr = attrs[i];
      if (!attr) continue;
      let name = attr.name;
      let value = attr.value;

      if (name === '@ref' && typeof value === 'string') {
        properties.push({
          type: ATTR_TYPES.DIRECTIVE,
          name: 'ref',
          expression: this._parseExpr(value),
        });
        continue;
      }

      if (name.startsWith('@') && !name.includes('.')) {
        let j = i + 1;
        while (
          j < attrs.length &&
          (attrs[j]?.name === 'prevent' || attrs[j]?.name === 'stop')
        ) {
          const modifierAttr = attrs[j];
          if (modifierAttr) {
            name += `.${modifierAttr.name}`;
            if (modifierAttr.value) {
              value = modifierAttr.value ?? value;
            }
            consumedIndices.add(j);
          }
          j++;
        }
      }

      if (name.startsWith('bind:') && typeof value === 'string') {
        const propToBind = name.split(':')[1];
        if (!propToBind) {
          continue;
        }

        properties.push({
          type: ATTR_TYPES.DIRECTIVE,
          name: propToBind.includes('-') ? propToBind : camelize(propToBind),
          expression: this._parseExpr(value),
        });

        const eventName = propToBind === 'value' ? 'onInput' : 'onChange';
        const valueAccessor = propToBind === 'value' ? 'value' : 'checked';

        properties.push({
          type: ATTR_TYPES.EVENT_HANDLER,
          name: eventName,
          expression: this._parseExpr(
            `${value} = $event.target.${valueAccessor}`,
          ),
        });
        continue;
      }

      if (name.startsWith('@') && typeof value === 'string') {
        const [eventName, ...modifiers] = name.slice(1).split('.');
        if (eventName) {
          const pascalEventName =
            eventName.charAt(0).toUpperCase() + eventName.slice(1);
          const prop = {
            type: ATTR_TYPES.EVENT_HANDLER,
            name: `on${pascalEventName}`,
            expression: this._parseExpr(value),
            modifiers: new Set(modifiers),
          };
          properties.push(prop);
        }
      } else if (name.startsWith(':') && typeof value === 'string') {
        const propName = name.substring(1);
        properties.push({
          type: ATTR_TYPES.DIRECTIVE,
          name: propName.includes('-') ? propName : camelize(propName),
          expression: this._parseExpr(value),
        });
      } else if (!name.startsWith('w-') && !name.startsWith('#')) {
        properties.push({ type: ATTR_TYPES.STATIC, name, value });
      }
    }
    return properties;
  }
}

/**
 * @internal
 * In-memory cache for compiled render functions.
 * @type {Map<string, (_ctx: object) => VNode | null>}
 */
export const compileCache = new Map();

/**
 * The main compile function. Takes a component definition and returns a render function.
 * Caches the result based on the component's name.
 * @param {Component} componentDef The component definition object.
 * @param {ComponentOptions | null} [options] Compiler options, such as global components.
 * @returns {(_ctx: object) => VNode | null} The compiled render function.
 */
export function compile(componentDef, options = null) {
  if (compileCache.has(componentDef.name)) {
    const cachedFn = compileCache.get(componentDef.name);
    logger.info(
      `Using cached render function for component: ${componentDef.name}`,
    );
    if (cachedFn) return cachedFn;
  }

  /** @type {(_ctx: object) => VNode | null} */
  let renderFn;
  if (typeof componentDef.render === 'function') {
    logger.info('Using provided render function.');
    renderFn = componentDef.render;
  } else {
    let templateContent = componentDef.template;
    if (typeof templateContent === 'function') {
      logger.info('Executing dynamic template function.');
      /**
       * A tagged template literal helper function.
       * @param {TemplateStringsArray} strings
       * @param {...any} values
       * @returns {string}
       */
      const html = (strings, ...values) =>
        strings.raw.reduce(
          (
            /** @type {string} */ acc,
            /** @type {string} */ str,
            /** @type {number} */ i,
          ) => acc + str + (values[i] || ''),
          '',
        );
      templateContent = /** @type {(h: typeof html) => string} */ (
        templateContent
      )(html);
    }

    if (typeof templateContent !== 'string') {
      logger.error('Component missing template', {
        componentName: componentDef.name,
      });
      renderFn = () => VDOM.h(VDOM.Comment, {}, 'Component missing template');
    } else {
      const finalComponentDef = { ...componentDef, template: templateContent };
      const compiler = new Compiler(finalComponentDef, options);
      const transformedAst = compiler._transformNode(
        compiler.parseHtml(finalComponentDef.template),
      );
      const { fn, source } = generateRenderFn(transformedAst);

      devtools?.__WEBS_DEVELOPER__?.events.emit('component:compiled', {
        name: finalComponentDef.name,
        template: finalComponentDef.template,
        source: source,
      });
      renderFn = fn;
    }
  }

  compileCache.set(componentDef.name, renderFn);
  return renderFn;
}
