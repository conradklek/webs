export const voidElements = new Set([
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

const jsTokenCache = new Map();

const JS_ESCAPE_MAP = { n: '\n', t: '\t', r: '\r' };

const JS_KEYWORDS = {
  true: 'BOOLEAN',
  false: 'BOOLEAN',
  null: 'NULL',
  undefined: 'UNDEFINED',
};

const jsIsWhitespace = (c) =>
  c === ' ' || c === '\n' || c === '\t' || c === '\r';
const isDigit = (c) => c >= '0' && c <= '9';
const isIdentStart = (c) =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '$' || c === '_';
const isIdentPart = (c) => isIdentStart(c) || isDigit(c);

export function tokenizeJs(expression) {
  if (jsTokenCache.has(expression)) {
    return jsTokenCache.get(expression);
  }

  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    let char = expression[i];

    if (jsIsWhitespace(char)) {
      i++;
      continue;
    }

    if (char === '`') {
      i++;
      tokens.push({ type: 'BACKTICK', value: '`' });
      let currentQuasi = '';
      while (i < expression.length && expression[i] !== '`') {
        if (expression[i] === '$' && expression[i + 1] === '{') {
          if (currentQuasi) {
            tokens.push({ type: 'TEMPLATE_STRING', value: currentQuasi });
            currentQuasi = '';
          }
          i += 2;
          tokens.push({ type: 'TEMPLATE_EXPR_START', value: '${' });
          let braceCount = 1;
          const exprStart = i;
          while (i < expression.length && braceCount > 0) {
            const c = expression[i];
            if (c === '{') braceCount++;
            else if (c === '}') braceCount--;
            if (braceCount > 0) i++;
          }
          if (braceCount !== 0)
            throw new Error('Unmatched braces in template literal');
          const innerExpression = expression.substring(exprStart, i);
          tokens.push(...tokenizeJs(innerExpression));
          tokens.push({ type: 'RBRACE', value: '}' });
          i++;
        } else {
          if (expression[i] === '\\') {
            currentQuasi += expression[i + 1] ? `\\${expression[i + 1]}` : `\\`;
            i += 2;
          } else {
            currentQuasi += expression[i];
            i++;
          }
        }
      }
      if (currentQuasi) {
        tokens.push({ type: 'TEMPLATE_STRING', value: currentQuasi });
      }
      if (i >= expression.length || expression[i] !== '`') {
        throw new Error('Unterminated template literal');
      }
      tokens.push({ type: 'BACKTICK', value: '`' });
      i++;
      continue;
    }

    if (isIdentStart(char)) {
      let ident = char;
      while (++i < expression.length && isIdentPart(expression[i])) {
        ident += expression[i];
      }
      tokens.push({ type: JS_KEYWORDS[ident] || 'IDENTIFIER', value: ident });
      continue;
    }

    if (isDigit(char)) {
      let numStr = char;
      while (
        ++i < expression.length &&
        (isDigit(expression[i]) || expression[i] === '.')
      ) {
        numStr += expression[i];
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      let value = '';
      i++;
      while (i < expression.length && expression[i] !== quote) {
        let c = expression[i++];
        if (c === '\\' && i < expression.length) {
          c = expression[i];
          value += JS_ESCAPE_MAP[c] || c;
          i++;
        } else {
          value += c;
        }
      }
      i++;
      tokens.push({ type: 'STRING', value });
      continue;
    }

    const twoCharOp = char + expression[i + 1];
    const threeCharOp = twoCharOp + expression[i + 2];
    if (threeCharOp === '===' || threeCharOp === '!==') {
      tokens.push({ type: 'OPERATOR', value: threeCharOp });
      i += 3;
      continue;
    }
    if (
      [
        '==',
        '!=',
        '<=',
        '>=',
        '&&',
        '||',
        '??',
        '?.',
        '=>',
        '++',
        '--',
      ].includes(twoCharOp)
    ) {
      tokens.push({
        type: twoCharOp === '=>' ? 'ARROW' : 'OPERATOR',
        value: twoCharOp,
      });
      i += 2;
      continue;
    }

    if ('()[]{},.:'.includes(char)) {
      const type = {
        '(': 'LPAREN',
        ')': 'RPAREN',
        '[': 'LBRACKET',
        ']': 'RBRACKET',
        '{': 'LBRACE',
        '}': 'RBRACE',
        ',': 'COMMA',
        '.': 'DOT',
        ':': 'COLON',
      }[char];
      tokens.push({ type, value: char });
      i++;
      continue;
    }

    if ('+-*/%<>&|!?='.includes(char)) {
      tokens.push({ type: char === '=' ? 'EQUALS' : 'OPERATOR', value: char });
      i++;
      continue;
    }

    throw new Error(
      `Tokenizer Error: Unrecognized character '${char}' at position ${i}`,
    );
  }

  jsTokenCache.set(expression, tokens);
  return tokens;
}

export function parseJs(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const consume = () => tokens[i++];

  let parseAssignment;

  const parseTemplateLiteral = () => {
    consume();
    const quasis = [];
    const expressions = [];

    while (peek() && peek().type !== 'BACKTICK') {
      if (peek().type === 'TEMPLATE_STRING') {
        quasis.push({
          type: 'TemplateElement',
          value: { raw: consume().value },
          tail: false,
        });
      }
      if (peek() && peek().type === 'TEMPLATE_EXPR_START') {
        consume();
        expressions.push(parseAssignment());
        if (peek()?.type !== 'RBRACE')
          throw new Error("Expected '}' after template expression");
        consume();
      }
    }

    if (quasis.length === expressions.length) {
      quasis.push({ type: 'TemplateElement', value: { raw: '' }, tail: true });
    } else if (quasis.length > 0) {
      quasis[quasis.length - 1].tail = true;
    }

    if (!peek() || peek().type !== 'BACKTICK')
      throw new Error('Unterminated template literal');
    consume();

    return { type: 'TemplateLiteral', quasis, expressions };
  };

  const parsePrimary = () => {
    const token = peek();
    if (!token) throw new Error('Unexpected end of expression.');
    switch (token.type) {
      case 'NUMBER':
      case 'STRING':
        return { type: 'Literal', value: consume().value };
      case 'BOOLEAN':
        return { type: 'Literal', value: consume().value === 'true' };
      case 'NULL':
      case 'UNDEFINED':
        consume();
        return { type: 'Literal', value: null };
      case 'IDENTIFIER':
        return { type: 'Identifier', name: consume().value };
      case 'LPAREN': {
        consume();
        if (peek()?.type === 'RPAREN') {
          consume();
          return { type: 'EmptyParentheses' };
        }
        const expr = parseAssignment();
        if (peek()?.type !== 'RPAREN') throw new Error("Expected ')'");
        consume();
        return expr;
      }
      case 'LBRACE':
        return parseObjectLiteral();
      case 'LBRACKET':
        return parseArrayLiteral();
      case 'BACKTICK':
        return parseTemplateLiteral();
      default:
        throw new Error(`Parser Error: Unexpected token ${token.type}`);
    }
  };

  const parseObjectLiteral = () => {
    consume();
    const properties = [];
    if (peek()?.type !== 'RBRACE') {
      do {
        const key = parsePrimary();
        if (key.type !== 'Identifier' && key.type !== 'Literal') {
          throw new Error('Invalid property key in object literal.');
        }
        if (peek()?.type !== 'COLON')
          throw new Error("Expected ':' after property key.");
        consume();
        const value = parseAssignment();
        properties.push({ type: 'Property', key, value });
      } while (peek()?.type === 'COMMA' && consume());
    }
    if (peek()?.type !== 'RBRACE')
      throw new Error("Expected '}' to close object literal.");
    consume();
    return { type: 'ObjectExpression', properties };
  };

  const parseArrayLiteral = () => {
    consume();
    const elements = [];
    if (peek()?.type !== 'RBRACKET') {
      do {
        elements.push(parseAssignment());
      } while (peek()?.type === 'COMMA' && consume());
    }
    if (peek()?.type !== 'RBRACKET')
      throw new Error("Expected ']' to close array literal.");
    consume();
    return { type: 'ArrayExpression', elements };
  };

  const parseAccessors = () => {
    let node = parsePrimary();
    while (peek()) {
      if (peek().value === '.' || peek().value === '?.') {
        const optional = consume().value === '?.';
        const prop = consume();
        if (prop.type !== 'IDENTIFIER')
          throw new Error("Expected identifier after '.'");
        node = {
          type: 'MemberExpression',
          object: node,
          property: { type: 'Identifier', name: prop.value },
          optional,
        };
      } else if (peek().type === 'LBRACKET') {
        consume();
        const prop = parseAssignment();
        if (peek()?.type !== 'RBRACKET') throw new Error("Expected ']'");
        consume();
        node = {
          type: 'ComputedMemberExpression',
          object: node,
          property: prop,
          optional: false,
        };
      } else if (peek().type === 'LPAREN') {
        consume();
        const args = [];
        if (peek().type !== 'RPAREN') {
          do {
            args.push(parseAssignment());
          } while (peek()?.type === 'COMMA' && consume());
        }
        if (peek()?.type !== 'RPAREN') throw new Error("Expected ')'");
        consume();
        node = {
          type: 'CallExpression',
          callee: node,
          arguments: args,
          optional: node.optional,
        };
      } else {
        break;
      }
    }
    return node;
  };

  const parseUnary = () => {
    if (
      peek()?.type === 'OPERATOR' &&
      (peek().value === '!' || peek().value === '-')
    ) {
      const op = consume().value;
      return { type: 'UnaryExpression', operator: op, argument: parseUnary() };
    }
    return parseAccessors();
  };

  const buildBinaryParser = (nextParser, operators) => () => {
    let left = nextParser();
    while (peek() && operators.includes(peek().value)) {
      const op = consume().value;
      const right = nextParser();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }
    return left;
  };

  const parseMultiplicative = buildBinaryParser(parseUnary, ['*', '/', '%']);
  const parseAdditive = buildBinaryParser(parseMultiplicative, ['+', '-']);
  const parseComparison = buildBinaryParser(parseAdditive, [
    '<',
    '>',
    '<=',
    '>=',
  ]);
  const parseEquality = buildBinaryParser(parseComparison, [
    '==',
    '!=',
    '===',
    '!==',
  ]);
  const parseLogicalAnd = buildBinaryParser(parseEquality, ['&&']);
  const parseLogicalOr = buildBinaryParser(parseLogicalAnd, ['||']);
  const parseNullishCoalescing = buildBinaryParser(parseLogicalOr, ['??']);

  const parseConditional = () => {
    const test = parseNullishCoalescing();
    if (peek()?.value === '?') {
      consume();
      const consequent = parseAssignment();
      if (peek()?.type !== 'COLON')
        throw new Error("Expected ':' for ternary operator.");
      consume();
      const alternate = parseAssignment();
      return { type: 'ConditionalExpression', test, consequent, alternate };
    }
    return test;
  };

  const parseArrow = () => {
    const left = parseConditional();
    if (peek()?.type === 'ARROW') {
      consume();
      const params =
        left.type === 'Identifier'
          ? [left]
          : left.type === 'EmptyParentheses'
            ? []
            : left.expressions;
      if (!Array.isArray(params))
        throw new Error('Invalid arrow function parameters.');
      return {
        type: 'ArrowFunctionExpression',
        params,
        body: parseAssignment(),
      };
    }
    return left;
  };

  parseAssignment = () => {
    const left = parseArrow();
    if (peek()?.type === 'EQUALS') {
      consume();
      if (
        left.type !== 'Identifier' &&
        left.type !== 'MemberExpression' &&
        left.type !== 'ComputedMemberExpression'
      ) {
        throw new Error('Invalid left-hand side in assignment expression.');
      }
      return { type: 'AssignmentExpression', left, right: parseAssignment() };
    }
    return left;
  };

  const ast = parseAssignment();

  if (i < tokens.length) {
    throw new Error(
      `Parser Error: Unexpected token '${peek().value}' at end of expression.`,
    );
  }

  return ast;
}

export const htmlAstCache = new Map();

const directiveRegex =
  /{#if\s+(.+?)}|{#each\s+(.+?)\s+as\s+(.+?)(?:\s*\((.+?)\))?}|{:else if\s+(.+?)}|{:else}|{\/if}|{\/each}/g;

function tokenizeHtml(html) {
  const tokens = [];
  let lastIndex = 0;

  html.replace(
    directiveRegex,
    (match, ifExpr, eachExpr, eachItem, eachKey, elseIfExpr, offset) => {
      if (offset > lastIndex) {
        tokens.push({
          type: 'text',
          content: html.substring(lastIndex, offset),
        });
      }

      if (ifExpr) {
        tokens.push({ type: 'ifStart', expression: ifExpr.trim() });
      } else if (eachExpr) {
        tokens.push({
          type: 'eachStart',
          expression: eachExpr.trim(),
          item: eachItem.trim(),
          key: eachKey ? eachKey.trim() : null,
        });
      } else if (elseIfExpr) {
        tokens.push({ type: 'elseIf', expression: elseIfExpr.trim() });
      } else if (match === '{:else}') {
        tokens.push({ type: 'else' });
      } else if (match === '{/if}') {
        tokens.push({ type: 'ifEnd' });
      } else if (match === '{/each}') {
        tokens.push({ type: 'eachEnd' });
      }

      lastIndex = offset + match.length;
      return match;
    },
  );

  if (lastIndex < html.length) {
    tokens.push({ type: 'text', content: html.substring(lastIndex) });
  }

  const finalTokens = [];
  for (const token of tokens) {
    if (token.type === 'text') {
      finalTokens.push(...tokenizeHtmlContent(token.content));
    } else {
      finalTokens.push(token);
    }
  }

  return finalTokens;
}

function tokenizeHtmlContent(html) {
  const tokens = [];
  const tagRegex = /<\/?([a-zA-Z0-9:-]+)\s*([^>]*)>|<!--([\s\S]*?)-->/g;
  let lastIndex = 0;

  html.replace(tagRegex, (match, tagName, attrs, comment, offset) => {
    if (offset > lastIndex) {
      tokens.push({
        type: 'text',
        content: html.substring(lastIndex, offset),
      });
    }

    if (comment) {
      tokens.push({ type: 'comment', content: comment });
    } else if (match.startsWith('</')) {
      tokens.push({ type: 'tagEnd', tagName });
    } else {
      const attributes = [];
      const attrRegex =
        /([:@]?[a-zA-Z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrs))) {
        attributes.push({
          name: attrMatch[1],
          value: attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? true,
        });
      }
      tokens.push({
        type: 'tagStart',
        tagName,
        attributes,
        selfClosing: match.endsWith('/>'),
      });
    }
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < html.length) {
    tokens.push({ type: 'text', content: html.substring(lastIndex) });
  }
  return tokens;
}

export function buildTree(tokens) {
  const root = { type: 'root', children: [] };
  const stack = [root];

  for (const token of tokens) {
    let parent = stack[stack.length - 1];

    if (token.type === 'ifStart') {
      const node = { type: 'ifBlock', test: token.expression, children: [] };
      parent.children.push(node);
      stack.push(node);
      continue;
    } else if (token.type === 'elseIf') {
      stack.pop();
      parent = stack[stack.length - 1];
      const node = {
        type: 'elseIfBlock',
        test: token.expression,
        children: [],
      };
      parent.children.push(node);
      stack.push(node);
      continue;
    } else if (token.type === 'else') {
      stack.pop();
      parent = stack[stack.length - 1];
      const node = { type: 'elseBlock', children: [] };
      parent.children.push(node);
      stack.push(node);
      continue;
    } else if (token.type === 'eachStart') {
      const node = {
        type: 'eachBlock',
        expression: token.expression,
        item: token.item,
        key: token.key,
        children: [],
      };
      parent.children.push(node);
      stack.push(node);
      continue;
    } else if (token.type === 'ifEnd' || token.type === 'eachEnd') {
      stack.pop();
      continue;
    }

    switch (token.type) {
      case 'tagStart': {
        const node = {
          type: 'element',
          tagName: token.tagName.toLowerCase(),
          attributes: token.attributes,
          children: [],
        };
        parent.children.push(node);
        if (!token.selfClosing && !voidElements.has(node.tagName)) {
          stack.push(node);
        }
        break;
      }
      case 'tagEnd': {
        if (
          stack.length > 1 &&
          stack[stack.length - 1].tagName === token.tagName.toLowerCase()
        ) {
          stack.pop();
        }
        break;
      }
      case 'text':
        if (token.content.trim().length > 0) {
          parent.children.push({ type: 'text', content: token.content });
        }
        break;
      case 'comment':
        parent.children.push({ type: 'comment', content: token.content });
        break;
    }
  }
  return root;
}

export function parseHtml(html) {
  if (htmlAstCache.has(html)) {
    return htmlAstCache.get(html);
  }
  const tokens = tokenizeHtml(html);
  const ast = buildTree(tokens);
  htmlAstCache.set(html, ast);
  return ast;
}
