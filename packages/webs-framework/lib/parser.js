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

    if ('+-*/<>&|!?='.includes(char)) {
      tokens.push({ type: char === '=' ? 'EQUALS' : 'OPERATOR', value: char });
      i++;
      continue;
    }

    throw new Error(`Tokenizer Error: Unrecognized character '${char}'`);
  }

  jsTokenCache.set(expression, tokens);
  return tokens;
}

export function parseJs(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const consume = () => tokens[i++];

  let parseAssignment;

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
    if (peek()?.type !== 'RBRACKET') {
      throw new Error("Expected ']' to close array literal.");
    }
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
    if (peek() && (peek().value === '++' || peek().value === '--')) {
      const op = consume().value;
      if (
        node.type !== 'Identifier' &&
        node.type !== 'MemberExpression' &&
        node.type !== 'ComputedMemberExpression'
      ) {
        throw new Error('Invalid left-hand side in update expression.');
      }
      node = {
        type: 'UpdateExpression',
        operator: op,
        argument: node,
        prefix: false,
      };
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

  const parseMultiplicative = buildBinaryParser(parseUnary, ['*', '/']);
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
  const parseNullishCoalescing = buildBinaryParser(parseLogicalAnd, ['??']);
  const parseLogicalOr = buildBinaryParser(parseNullishCoalescing, ['||']);

  const parseTernary = () => {
    const test = parseLogicalOr();
    if (peek()?.value === '?') {
      consume();
      const consequent = parseTernary();
      if (peek()?.type !== 'COLON')
        throw new Error("Expected ':' for ternary operator.");
      consume();
      const alternate = parseTernary();
      return { type: 'ConditionalExpression', test, consequent, alternate };
    }
    return test;
  };

  const parseArrow = () => {
    const left = parseTernary();
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
    throw new Error(`Parser Error: Unexpected tokens at end of expression.`);
  }
  return ast;
}

export const htmlAstCache = new Map();

const HTML_TOKENIZER_STATE = {
  DATA: 1,
  TAG_OPEN: 2,
  TAG_NAME: 3,
  BEFORE_ATTRIBUTE_NAME: 4,
  ATTRIBUTE_NAME: 5,
  BEFORE_ATTRIBUTE_VALUE: 6,
  ATTRIBUTE_VALUE_DOUBLE_QUOTED: 7,
  ATTRIBUTE_VALUE_SINGLE_QUOTED: 8,
  ATTRIBUTE_VALUE_UNQUOTED: 9,
  COMMENT: 10,
  SELF_CLOSING_START_TAG: 11,
};

const htmlIsWhitespace = (c) =>
  c === ' ' || c === '\n' || c === '\t' || c === '\r';

function tokenizeHtml(html) {
  let state = HTML_TOKENIZER_STATE.DATA;
  let i = 0;
  const tokens = [];
  let buffer = '';
  let tagToken = null;

  while (i < html.length) {
    const char = html[i];
    switch (state) {
      case HTML_TOKENIZER_STATE.DATA:
        if (char === '<') {
          if (buffer) tokens.push({ type: 'text', content: buffer });
          buffer = '';
          state = HTML_TOKENIZER_STATE.TAG_OPEN;
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.TAG_OPEN:
        if (char === '!') {
          if (html.substring(i, i + 3) === '!--') {
            state = HTML_TOKENIZER_STATE.COMMENT;
            i += 2;
          }
        } else if (char === '/') {
          tagToken = { type: 'tagEnd', tagName: '' };
          state = HTML_TOKENIZER_STATE.TAG_NAME;
        } else if (/[a-zA-Z]/.test(char)) {
          tagToken = {
            type: 'tagStart',
            tagName: char,
            attributes: [],
            selfClosing: false,
          };
          state = HTML_TOKENIZER_STATE.TAG_NAME;
        }
        break;

      case HTML_TOKENIZER_STATE.TAG_NAME:
        if (htmlIsWhitespace(char)) {
          state = HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME;
        } else if (char === '/') {
          tagToken.selfClosing = true;
          state = HTML_TOKENIZER_STATE.SELF_CLOSING_START_TAG;
        } else if (char === '>') {
          tokens.push(tagToken);
          state = HTML_TOKENIZER_STATE.DATA;
        } else {
          tagToken.tagName += char;
        }
        break;

      case HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME:
        if (!htmlIsWhitespace(char)) {
          if (char === '>') {
            tokens.push(tagToken);
            state = HTML_TOKENIZER_STATE.DATA;
          } else if (char === '/') {
            tagToken.selfClosing = true;
            state = HTML_TOKENIZER_STATE.SELF_CLOSING_START_TAG;
          } else if (char !== '=') {
            buffer = char;
            state = HTML_TOKENIZER_STATE.ATTRIBUTE_NAME;
          }
        }
        break;

      case HTML_TOKENIZER_STATE.ATTRIBUTE_NAME:
        if (char === '=' || htmlIsWhitespace(char) || char === '>') {
          tagToken.attributes.push({ name: buffer, value: true });
          buffer = '';
          if (char === '=') state = HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_VALUE;
          else if (char === '>') {
            tokens.push(tagToken);
            state = HTML_TOKENIZER_STATE.DATA;
          } else state = HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME;
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_VALUE:
        if (char === '"')
          state = HTML_TOKENIZER_STATE.ATTRIBUTE_VALUE_DOUBLE_QUOTED;
        else if (char === "'")
          state = HTML_TOKENIZER_STATE.ATTRIBUTE_VALUE_SINGLE_QUOTED;
        else if (!htmlIsWhitespace(char)) {
          buffer = char;
          state = HTML_TOKENIZER_STATE.ATTRIBUTE_VALUE_UNQUOTED;
        }
        break;

      case HTML_TOKENIZER_STATE.ATTRIBUTE_VALUE_DOUBLE_QUOTED:
      case HTML_TOKENIZER_STATE.ATTRIBUTE_VALUE_SINGLE_QUOTED:
        const quote =
          state === HTML_TOKENIZER_STATE.ATTRIBUTE_VALUE_DOUBLE_QUOTED
            ? '"'
            : "'";
        if (char === quote) {
          tagToken.attributes[tagToken.attributes.length - 1].value = buffer;
          buffer = '';
          state = HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME;
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.ATTRIBUTE_VALUE_UNQUOTED:
        if (htmlIsWhitespace(char) || char === '>') {
          tagToken.attributes[tagToken.attributes.length - 1].value = buffer;
          buffer = '';
          state =
            char === '>'
              ? HTML_TOKENIZER_STATE.DATA
              : HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME;
          if (char === '>') tokens.push(tagToken);
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.COMMENT:
        if (char === '-' && html.substring(i, i + 3) === '-->') {
          tokens.push({ type: 'comment', content: buffer });
          buffer = '';
          i += 2;
          state = HTML_TOKENIZER_STATE.DATA;
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.SELF_CLOSING_START_TAG:
        if (char === '>') {
          tokens.push(tagToken);
          state = HTML_TOKENIZER_STATE.DATA;
        }
        break;
    }
    i++;
  }

  if (state === HTML_TOKENIZER_STATE.DATA && buffer) {
    tokens.push({ type: 'text', content: buffer });
  }
  return tokens;
}

export function buildTree(tokens) {
  const root = { type: 'root', children: [] };
  const stack = [root];

  for (const token of tokens) {
    const parent = stack[stack.length - 1];
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
        const tagNameLower = token.tagName.toLowerCase();
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tagName === tagNameLower) {
            stack.length = i;
            break;
          }
        }
        break;
      }
      case 'text':
        if (token.content.length > 0) {
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
