import { parseHtml, parseJs, tokenizeJs } from './parser.js';
import * as Webs from './renderer.js';

const devtools = typeof window !== 'undefined' && window.__WEBS_DEVELOPER__;

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
        case 'TemplateLiteral': {
          let code = '`';
          let i = 0;
          for (const quasi of expr.quasis) {
            code += quasi.value.raw.replace(/`/g, '\\`');
            if (!quasi.tail) {
              code += `\${${this.genExpr(expr.expressions[i++])}}`;
            }
          }
          code += '`';
          return code;
        }
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
          if (p.modifiers && p.modifiers.has('prevent')) {
            handlerBody = `$event.preventDefault(); ${handlerBody}`;
          }
          if (p.modifiers && p.modifiers.has('stop')) {
            handlerBody = `$event.stopPropagation(); ${handlerBody}`;
          }

          return `'${p.name}': ($event) => { ${handlerBody} }`;
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
      if (!children) return '[]';
      const childNodes = (Array.isArray(children) ? children : [children])
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
        case NODE_TYPES.ELEMENT: {
          let props = this.genProps(node.properties);
          if (node.key) {
            const propsObj = JSON.parse(props.slice(1, -1));
            propsObj.key = this.genExpr(node.key);
            props = `{${Object.entries(propsObj)
              .map(([k, v]) => `'${k}':${v}`)
              .join(',')}}`;
          }
          return `_h('${node.tagName}', ${props}, ${this.genChildren(
            node.children,
          )})`;
        }
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
          const genBranch = (branch, index) => {
            if (!branch) return 'null';
            const nextBranch = node.branches[index + 1];
            const alternate = nextBranch
              ? genBranch(nextBranch, index + 1)
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

          const childNodes = this.genChildren(node.children);
          const childCode = `(() => {
            const child = ${childNodes}[0];
            if (child && !child.props) child.props = {};
            if (child && child.props) child.props.key = ${this.genExpr(
              keyName,
            )};
            return child;
          })()`;

          this.scope.delete(value);
          if (key) this.scope.delete(key);
          return `_h(_Fragment, null, (${this.genExpr(
            source,
          )} || []).map(${params} => ${childCode}))`;
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
    const errorFn = () =>
      Webs.h(Webs.Comment, null, 'Render function compile error');
    return {
      fn: errorFn,
      source: `return Webs.h(Webs.Comment, null, 'Render function compile error');`,
    };
  }
}

const parseExprCache = new Map();

export class Compiler {
  constructor(componentDef, options = null) {
    this.definition = componentDef;
    this.componentNameMap = new Map();
    const allComponents = {
      ...(componentDef.components || {}),
      ...(options?.globalComponents || {}),
    };

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

  parseHtml(html) {
    return parseHtml(html);
  }

  compile() {
    const rawAst = this.parseHtml(this.definition.template);
    const transformedAst = this._transformNode(rawAst);
    const { fn, source } = generateRenderFn(transformedAst);

    if (devtools) {
      devtools.events.emit('component:compiled', {
        name: this.definition.name,
        template: this.definition.template,
        source: source,
      });
    }

    return fn;
  }

  _parseExpr(str) {
    if (str === null || str === undefined) return null;
    const cleanStr = String(str).replace(/\n/g, ' ').trim();
    if (!cleanStr) return null;
    if (parseExprCache.has(cleanStr)) {
      return parseExprCache.get(cleanStr);
    }

    try {
      const ast = parseJs(tokenizeJs(cleanStr));
      parseExprCache.set(cleanStr, ast);
      return ast;
    } catch (e) {
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
      case 'ifBlock':
      case 'eachBlock':
        return this._transformBlock(node);
      default:
        return null;
    }
  }

  _transformText(node) {
    const text = node.content;
    if (!text.includes('{{')) {
      return { type: NODE_TYPES.TEXT, value: text };
    }
    const mustacheRegex = /\{\{([^}]+)\}\}/g;
    const tokens = [];
    let lastIndex = 0;
    let match;
    while ((match = mustacheRegex.exec(text))) {
      if (match.index > lastIndex) {
        tokens.push({
          type: NODE_TYPES.TEXT,
          value: text.substring(lastIndex, match.index),
        });
      }
      tokens.push({
        type: NODE_TYPES.INTERPOLATION,
        expression: this._parseExpr(match[1].trim()),
      });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      tokens.push({
        type: NODE_TYPES.TEXT,
        value: text.substring(lastIndex),
      });
    }

    if (tokens.length === 0) return { type: NODE_TYPES.TEXT, value: text };
    if (tokens.length === 1) return tokens[0];
    return { type: NODE_TYPES.FRAGMENT, children: tokens };
  }

  _transformChildren(children) {
    const transformed = [];
    let i = 0;
    while (i < children.length) {
      const child = children[i];
      if (child.type === 'ifBlock') {
        const branches = [];
        let current = child;
        let nextIndex = i + 1;
        while (current) {
          if (current.type === 'ifBlock' || current.type === 'elseIfBlock') {
            branches.push({
              condition: this._parseExpr(current.test),
              node: {
                type: NODE_TYPES.FRAGMENT,
                children: this._transformChildren(current.children),
              },
            });
          } else if (current.type === 'elseBlock') {
            branches.push({
              condition: this._parseExpr('true'),
              node: {
                type: NODE_TYPES.FRAGMENT,
                children: this._transformChildren(current.children),
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
            current = null;
          }
        }
        transformed.push({ type: NODE_TYPES.IF, branches });
        i = nextIndex;
        continue;
      }

      const transformedNode = this._transformNode(child);
      if (transformedNode) {
        if (Array.isArray(transformedNode)) {
          transformed.push(...transformedNode);
        } else {
          transformed.push(transformedNode);
        }
      }
      i++;
    }
    return transformed;
  }

  _transformBlock(block) {
    if (block.type === 'eachBlock') {
      const match = String(block.item).match(
        /^\s*(?:(\w+)|(?:\((\w+)\s*,\s*(\w+)\)))\s*$/,
      );
      if (!match) {
        return null;
      }

      return {
        type: NODE_TYPES.FOR,
        source: this._parseExpr(block.expression),
        value: match[1] || match[2],
        key: match[3],
        keyName: this._parseExpr(block.key),
        children: this._transformChildren(block.children),
      };
    }
    return null;
  }

  _transformElement(el) {
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

  _processAttributes(attrs) {
    const properties = [];
    const consumedIndices = new Set();
    const bindAttributes = new Map();

    for (let i = 0; i < attrs.length; i++) {
      if (consumedIndices.has(i)) continue;

      const attr = attrs[i];
      let name = attr.name;
      let value = attr.value;

      if (name === '@ref') {
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
          (attrs[j].name === 'prevent' || attrs[j].name === 'stop')
        ) {
          name += `.${attrs[j].name}`;
          if (attrs[j].value) {
            value = attrs[j].value;
          }
          consumedIndices.add(j);
          j++;
        }
      }

      if (name.startsWith('bind:')) {
        const propToBind = name.split(':')[1];
        if (!propToBind) {
          continue;
        }
        bindAttributes.set(propToBind, value);

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

      if (name.startsWith('@')) {
        const [eventName, ...modifiers] = name.slice(1).split('.');
        const pascalEventName =
          eventName.charAt(0).toUpperCase() + eventName.slice(1);
        const prop = {
          type: ATTR_TYPES.EVENT_HANDLER,
          name: `on${pascalEventName}`,
          expression: this._parseExpr(value),
          modifiers: new Set(modifiers),
        };
        properties.push(prop);
      } else if (name.startsWith(':')) {
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

export const compileCache = new WeakMap();

export function compile(componentDef, options = null) {
  if (compileCache.has(componentDef)) {
    console.log(`[Compiler] Cache HIT for component: ${componentDef.name}`);
    return compileCache.get(componentDef);
  }
  console.log(
    `[Compiler] Cache MISS for component: ${componentDef.name}. Compiling...`,
  );

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
    return () => Webs.h(Webs.Comment, null, 'Component missing template');
  }

  const finalComponentDef = { ...componentDef, template: templateContent };
  const compiler = new Compiler(finalComponentDef, options);
  const renderFn = compiler.compile();
  compileCache.set(componentDef, renderFn);
  return renderFn;
}
