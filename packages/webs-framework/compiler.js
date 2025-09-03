import { parseHtml, parseJs, tokenizeJs } from './parser';
import * as Webs from './renderer';

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
};

export const ATTR_TYPES = {
  STATIC: 10,
  DIRECTIVE: 11,
  EVENT_HANDLER: 12,
};

const DIR_IF = 'w-if';
const DIR_ELSE_IF = 'w-else-if';
const DIR_ELSE = 'w-else';
const DIR_FOR = 'w-for';

const cacheStringFunction = (fn) => {
  const cache = Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};

const camelize = cacheStringFunction((str) => {
  return str.replace(/-(\w)/g, (_, c) => (c ? c.toUpperCase() : ''));
});

export function generateRenderFn(ast) {
  const ctx = {
    scope: new Set(),
    genExpr(expr) {
      if (!expr) return 'null';
      switch (expr.type) {
        case 'Identifier':
          return this.scope.has(expr.name) ? expr.name : `_ctx.${expr.name}`;
        case 'Literal':
          return JSON.stringify(expr.value);
        case 'ObjectExpression': {
          const props = expr.properties
            .map((p) => {
              const key =
                p.key.type === 'Identifier'
                  ? `'${p.key.name}'`
                  : this.genExpr(p.key);
              const value = this.genExpr(p.value);
              return `${key}: ${value}`;
            })
            .join(',');
          return `{${props}}`;
        }
        case 'ArrayExpression': {
          return `[${expr.elements.map((e) => this.genExpr(e)).join(',')}]`;
        }
        case 'BinaryExpression':
          return `(${this.genExpr(expr.left)}${expr.operator}${this.genExpr(
            expr.right,
          )})`;
        case 'UnaryExpression':
          return `${expr.operator}${this.genExpr(expr.argument)}`;
        case 'UpdateExpression':
          return `(${this.genExpr(expr.argument)}${expr.operator})`;
        case 'MemberExpression': {
          const objectExpr = this.genExpr(expr.object);
          const propertyName = expr.property.name;
          return `(${objectExpr}?.${propertyName})`;
        }
        case 'ComputedMemberExpression':
          return `${this.genExpr(expr.object)}[${this.genExpr(expr.property)}]`;
        case 'CallExpression':
          return `${this.genExpr(expr.callee)}(${expr.arguments
            .map((a) => this.genExpr(a))
            .join(',')})`;
        case 'ConditionalExpression':
          return `(${this.genExpr(expr.test)}?${this.genExpr(
            expr.consequent,
          )}:${this.genExpr(expr.alternate)})`;
        case 'AssignmentExpression':
          return `(${this.genExpr(expr.left)}=${this.genExpr(expr.right)})`;
        default:
          return 'null';
      }
    },
    genProps(props) {
      const genProp = (p) => {
        if (p.type === ATTR_TYPES.STATIC) {
          return `'${p.name}':${JSON.stringify(p.value)}`;
        }
        if (p.type === ATTR_TYPES.DIRECTIVE)
          return `'${p.name}':${this.genExpr(p.expression)}`;
        if (p.type === ATTR_TYPES.EVENT_HANDLER) {
          this.scope.add('$event');
          const exprCode = this.genExpr(p.expression);
          this.scope.delete('$event');

          let handlerBody = exprCode;
          if (p.expression && p.expression.type === 'Identifier') {
            handlerBody = `${exprCode}($event)`;
          }
          if (p.modifiers && p.modifiers.size > 0) {
            const statements = [];
            if (p.modifiers.has('prevent')) {
              statements.push('$event.preventDefault();');
            }
            if (p.modifiers.has('stop')) {
              statements.push('$event.stopPropagation();');
            }
            statements.push(handlerBody);
            return `'${p.name}': ($event) => { ${statements.join(' ')} }`;
          } else {
            return `'${p.name}': ($event) => (${handlerBody})`;
          }
        }
      };
      return `{${props
        .map((p) => p && genProp(p))
        .filter(Boolean)
        .join(',')}}`;
    },
    genSlots(slots) {
      const slotEntries = Object.entries(slots).map(([name, children]) => {
        return `${name}: () => ${this.genChildren(children)}`;
      });
      return `{ ${slotEntries.join(', ')} }`;
    },
    genChildren(children) {
      const childNodes = children
        .map((c) => this.genNode(c))
        .filter((c) => c && c !== 'null');
      return `[${childNodes.join(',')}]`;
    },
    genNode(node) {
      if (!node) return 'null';
      switch (node.type) {
        case NODE_TYPES.ROOT: {
          if (node.children.length === 1) {
            return this.genNode(node.children[0]);
          }
          return `_h(_Fragment, null, ${this.genChildren(node.children)})`;
        }
        case NODE_TYPES.FRAGMENT:
          return `_h(_Fragment, null, ${this.genChildren(node.children)})`;
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
        case NODE_TYPES.ELEMENT:
          return `_h('${node.tagName}', ${this.genProps(
            node.properties,
          )}, ${this.genChildren(node.children)})`;
        case NODE_TYPES.TEXT:
          return `_h(_Text, null, ${JSON.stringify(node.value)})`;
        case NODE_TYPES.INTERPOLATION:
          return `_h(_Text, { 'w-dynamic': true }, String(${this.genExpr(
            node.expression,
          )}))`;
        case NODE_TYPES.COMMENT:
          return `_h(_Comment, null, ${JSON.stringify(node.value)})`;
        case NODE_TYPES.SLOT: {
          const slotName = node.name || 'default';
          const fallbackContent = this.genChildren(node.children);
          return `_h(_Fragment, null, _ctx.$slots.${slotName} ? _ctx.$slots.${slotName}() : ${fallbackContent})`;
        }
        case NODE_TYPES.IF: {
          const genBranch = (branch) => {
            if (branch.condition) {
              return `(${this.genExpr(
                branch.condition,
              )}) ? ${this.genNode(branch.node)} : `;
            }
            return this.genNode(branch.node);
          };
          const hasElse =
            node.branches[node.branches.length - 1].condition === null;
          let code = node.branches.map(genBranch).join('');
          if (!hasElse) {
            code += `null`;
          }
          return `(${code})`;
        }
        case NODE_TYPES.FOR: {
          const { source, value, key } = node;
          const params = key ? `(${value}, ${key})` : value;
          this.scope.add(value);
          if (key) this.scope.add(key);
          const childCode = this.genNode(node.children[0]);
          this.scope.delete(value);
          if (key) this.scope.delete(key);
          return `_h(_Fragment, null, (${this.genExpr(
            source,
          )} || []).map(${params} => (${childCode})))`;
        }
      }
      return 'null';
    },
  };
  const generatedCode = ctx.genNode(ast);
  const functionBody = `
const { h: _h, Text: _Text, Fragment: _Fragment, Comment: _Comment } = Webs;
return ${generatedCode || 'null'};
`;
  try {
    const fn = new Function('Webs', '_ctx', functionBody).bind(null, Webs);
    return { fn, source: functionBody };
  } catch (e) {
    console.error('Error compiling render function:', e);
    const errorFn = () =>
      Webs.h(Webs.Comment, null, 'Render function compile error');
    return {
      fn: errorFn,
      source: `return Webs.h(Webs.Comment, null, 'Render function compile error');`,
    };
  }
}

export class Compiler {
  constructor(componentDef, options = null) {
    this.definition = componentDef;
    this.componentNameMap = new Map();

    const collectComponents = (comps) => {
      if (!comps) return;
      for (const key in comps) {
        const compDef = comps[key];
        if (compDef && typeof compDef === 'object') {
          this.componentNameMap.set(key, key);
          if (compDef.components) {
            collectComponents(compDef.components);
          }
        }
      }
    };

    collectComponents(componentDef.components);
    this.options = options;
  }

  parseHtml(html) {
    return parseHtml(html);
  }

  compile() {
    const rawAst = this.parseHtml(this.definition.template);
    const transformedAst = this._transformNode(rawAst);
    return generateRenderFn(transformedAst).fn;
  }
  _parseExpr(str) {
    if (!str) return null;
    const cleanStr = str.replace(/\n/g, ' ').trim();
    try {
      return parseJs(tokenizeJs(cleanStr));
    } catch (e) {
      console.warn(`Expression parse error: "${str}"`, e);
      return null;
    }
  }

  _processSlots(children) {
    const slots = {};
    const defaultChildren = [];
    let hasNamedSlots = false;

    for (const child of children) {
      if (child.type === 'element' && child.tagName === 'template') {
        const slotAttr = child.attributes.find((a) => a.name.startsWith('#'));
        if (slotAttr) {
          const slotName = slotAttr.name.substring(1) || 'default';
          slots[slotName] = this._transformChildren(child.children);
          hasNamedSlots = true;
          continue;
        }
      }
      if (child.type === 'text' && !child.content.trim()) {
        continue;
      }
      defaultChildren.push(child);
    }

    if (defaultChildren.length > 0 || !hasNamedSlots) {
      slots.default = this._transformChildren(defaultChildren);
    }
    return slots;
  }

  _transformNode(node) {
    switch (node.type) {
      case 'root':
        return {
          type: NODE_TYPES.ROOT,
          children: this._transformChildren(node.children),
        };
      case 'element':
        return this._transformElement(node);
      case 'text':
        return this._transformText(node);
      case 'comment':
        return { type: NODE_TYPES.COMMENT, value: node.content };
      default:
        return null;
    }
  }
  _transformText(node) {
    if (node.content.trim() === '') {
      return null;
    }

    const unescape = (str) => {
      return str.replace(
        /&amp;|&lt;|&gt;|&quot;|&#039;|&larr;|&rarr;|&uarr;|&darr;|&harr;|&crarr;|&nbsp;|&copy;/g,
        (tag) => {
          const replacements = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#039;': "'",
            '&larr;': '←',
            '&rarr;': '→',
            '&uarr;': '↑',
            '&darr;': '↓',
            '&harr;': '↔',
            '&crarr;': '↵',
            '&nbsp;': ' ',
            '&copy;': '©',
          };
          return replacements[tag] || tag;
        },
      );
    };
    const text = unescape(node.content);
    if (!text.includes('{{')) {
      return { type: NODE_TYPES.TEXT, value: text };
    }
    const mustacheRegex = /\{\{([^}]+)\}\}/g;
    const tokens = [];
    let lastIndex = 0;
    let match;
    mustacheRegex.lastIndex = 0;
    while ((match = mustacheRegex.exec(text))) {
      if (match.index > lastIndex) {
        const textContent = text.substring(lastIndex, match.index);
        if (textContent) {
          tokens.push({ type: NODE_TYPES.TEXT, value: textContent });
        }
      }
      tokens.push({
        type: NODE_TYPES.INTERPOLATION,
        expression: this._parseExpr(match[1].trim()),
      });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      const textContent = text.substring(lastIndex);
      if (textContent) {
        tokens.push({ type: NODE_TYPES.TEXT, value: textContent });
      }
    }
    if (tokens.length === 0) return null;
    return tokens.length === 1
      ? tokens[0]
      : { type: NODE_TYPES.FRAGMENT, children: tokens };
  }

  _transformChildren(children) {
    const transformed = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === 'element') {
        const forAttr = child.attributes.find((a) => a.name === DIR_FOR);
        if (forAttr) {
          transformed.push(this._transformElement(child));
          continue;
        }

        const ifAttr = child.attributes.find((a) => a.name === DIR_IF);
        if (ifAttr) {
          const branches = [];
          const ifNodeClone = {
            ...child,
            attributes: child.attributes.filter((a) => a.name !== DIR_IF),
          };
          branches.push({
            condition: this._parseExpr(ifAttr.value),
            node: this._transformNode(ifNodeClone),
          });
          let j = i + 1;
          while (j < children.length) {
            const next = children[j];
            const isWhitespaceText =
              next.type === 'text' && !next.content.trim();
            if (next.type === 'element') {
              const elseIfAttr = next.attributes.find(
                (a) => a.name === DIR_ELSE_IF,
              );
              const elseAttr = next.attributes.find((a) => a.name === DIR_ELSE);
              if (elseIfAttr) {
                const elseIfNodeClone = {
                  ...next,
                  attributes: next.attributes.filter(
                    (a) => a.name !== DIR_ELSE_IF,
                  ),
                };
                branches.push({
                  condition: this._parseExpr(elseIfAttr.value),
                  node: this._transformNode(elseIfNodeClone),
                });
                i = j;
              } else if (elseAttr) {
                const elseNodeClone = {
                  ...next,
                  attributes: next.attributes.filter(
                    (a) => a.name !== DIR_ELSE,
                  ),
                };
                branches.push({
                  condition: null,
                  node: this._transformNode(elseNodeClone),
                });
                i = j;
                break;
              } else {
                break;
              }
            } else if (!isWhitespaceText) {
              break;
            }
            j++;
          }
          transformed.push({ type: NODE_TYPES.IF, branches });
          continue;
        }
      }
      const transformedNode = this._transformNode(child);
      if (transformedNode) {
        if (Array.isArray(transformedNode)) {
          transformed.push(...transformedNode);
        } else {
          transformed.push(transformedNode);
        }
      }
    }
    return transformed;
  }
  _transformElement(el) {
    const forAttr = el.attributes.find((a) => a.name === DIR_FOR);
    if (forAttr) {
      const match = String(forAttr.value).match(
        /^\s*(?:(\w+)|(?:\((\w+)\s*,\s*(\w+)\)))\s+in\s+(.+)$/,
      );
      if (!match) {
        console.warn(`Invalid w-for expression: ${forAttr.value}`);
        return this._transformNativeElement(el);
      }
      const forNodeChild = {
        ...el,
        attributes: el.attributes.filter((a) => a.name !== DIR_FOR),
      };
      return {
        type: NODE_TYPES.FOR,
        source: this._parseExpr(match[4]),
        value: match[1] || match[2],
        key: match[3],
        children: [this._transformNode(forNodeChild)],
      };
    }

    if (el.tagName === 'slot') {
      const nameAttr = el.attributes.find((a) => a.name === 'name');
      return {
        type: NODE_TYPES.SLOT,
        name: nameAttr ? nameAttr.value : 'default',
        children: this._transformChildren(el.children),
      };
    }

    return this._transformNativeElement(el);
  }

  _transformNativeElement(el) {
    if (el.tagName === 'component') {
      const isAttr = el.attributes.find(
        (a) => a.name === ':is' || a.name === 'is',
      );
      if (isAttr) {
        return {
          type: NODE_TYPES.COMPONENT,
          tagName: this._parseExpr(isAttr.value),
          isDynamic: true,
          properties: this._processAttributes(
            el.attributes.filter((a) => a.name !== ':is' && a.name !== 'is'),
          ),
          slots: this._processSlots(el.children),
        };
      }
    }

    const tagName = el.tagName;
    const registeredCompKey = this.componentNameMap.get(tagName);
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

  _processAttributes(attrs) {
    const properties = [];

    for (const attr of attrs) {
      const name = attr.name;

      if (name.startsWith('bind:')) {
        const propToBind = name.split(':')[1];
        if (!propToBind) {
          console.warn(`[Compiler] Invalid bind directive: ${name}`);
          continue;
        }

        const eventName = propToBind === 'checked' ? 'onChange' : 'onInput';
        const valueAccessor = propToBind === 'checked' ? 'checked' : 'value';

        properties.push({
          type: ATTR_TYPES.DIRECTIVE,
          name: propToBind,
          expression: this._parseExpr(attr.value),
        });

        properties.push({
          type: ATTR_TYPES.EVENT_HANDLER,
          name: eventName,
          expression: this._parseExpr(
            `${attr.value} = $event.target.${valueAccessor}`,
          ),
        });
        continue;
      }

      if (name.startsWith('@')) {
        const [eventName, ...modifiers] = name.slice(1).split('.');
        const pascalEventName =
          eventName.charAt(0).toUpperCase() + eventName.slice(1);
        properties.push({
          type: ATTR_TYPES.EVENT_HANDLER,
          name: `on${pascalEventName}`,
          expression: this._parseExpr(attr.value),
          modifiers: new Set(modifiers),
        });
      } else if (name.startsWith(':')) {
        const propName = name.substring(1);
        properties.push({
          type: ATTR_TYPES.DIRECTIVE,
          name: propName.includes('-') ? propName : camelize(propName),
          expression: this._parseExpr(attr.value),
        });
      } else if (!name.startsWith('w-') && !name.startsWith('#')) {
        properties.push({ type: ATTR_TYPES.STATIC, name, value: attr.value });
      }
    }
    return properties;
  }
}

const compileCache = new WeakMap();

export function compile(componentDef) {
  if (compileCache.has(componentDef)) {
    return compileCache.get(componentDef);
  }

  let templateContent = componentDef.template;
  if (typeof templateContent === 'function') {
    const htmlTagFn = (strings, ...values) => {
      let result = '';
      strings.forEach((string, i) => {
        result += string;
        if (i < values.length) {
          const value = values[i];
          if (typeof value === 'object' && value !== null) {
            result += JSON.stringify(value);
          } else {
            result += String(value);
          }
        }
      });
      return result;
    };
    templateContent = templateContent(htmlTagFn, {});
  }

  if (typeof templateContent !== 'string') {
    console.warn('Component is missing a valid template option.');
    return () => Webs.h(Webs.Comment, null, 'Component missing template');
  }

  const finalComponentDef = { ...componentDef, template: templateContent };
  const compiler = new Compiler(finalComponentDef);
  const renderFn = compiler.compile();
  compileCache.set(componentDef, renderFn);
  return renderFn;
}
