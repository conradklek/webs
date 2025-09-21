/**
 * @file Type definitions for the expression evaluator.
 */

/**
 * @typedef {object} JsToken
 * @property {string} type - The type of the token (e.g., 'IDENTIFIER', 'NUMBER', 'OPERATOR').
 * @property {string | number} value - The raw value of the token.
 */

/**
 * @typedef {object} AstNode
 * @property {string} type - The type of the AST node (e.g., 'Literal', 'Identifier').
 */

/** @typedef {AstNode & { value: any }} LiteralNode */
/** @typedef {AstNode & { name: string }} IdentifierNode */
/** @typedef {AstNode & { quasis: {type: 'TemplateElement', value: {raw: string}, tail: boolean}[], expressions: AstNode[] }} TemplateLiteralNode */
/** @typedef {AstNode & { properties: {type: 'Property', key: AstNode, value: AstNode}[] }} ObjectExpressionNode */
/** @typedef {AstNode & { elements: AstNode[] }} ArrayExpressionNode */
/** @typedef {AstNode & { operator: string, left: AstNode, right: AstNode }} BinaryExpressionNode */
/** @typedef {AstNode & { operator: string, argument: AstNode }} UnaryExpressionNode */
/** @typedef {AstNode & { object: AstNode, property: IdentifierNode, optional: boolean }} MemberExpressionNode */
/** @typedef {AstNode & { object: AstNode, property: AstNode, optional: boolean, computed: true }} ComputedMemberExpressionNode */
/** @typedef {AstNode & { callee: AstNode, arguments: AstNode[], optional: boolean }} CallExpressionNode */
/** @typedef {AstNode & { test: AstNode, consequent: AstNode, alternate: AstNode }} ConditionalExpressionNode */
/** @typedef {AstNode & { left: AstNode, right: AstNode }} AssignmentExpressionNode */
/** @typedef {AstNode & { params: AstNode[], body: AstNode, expressions?: AstNode[] }} ArrowFunctionExpressionNode */
/** @typedef {AstNode & {}} EmptyParenthesesNode */

/**
 * @file A secure, non-evaluating JavaScript expression tokenizer and parser, designed for safely executing template logic.
 */

/** @type {Map<string, JsToken[]>} */
const jsTokenCache = new Map();

/** @type {Record<string, string>} */
const JS_ESCAPE_MAP = { n: '\n', t: '\t', r: '\r' };

/** @type {Record<string, string>} */
const JS_KEYWORDS = {
  true: 'BOOLEAN',
  false: 'BOOLEAN',
  null: 'NULL',
  undefined: 'UNDEFINED',
};

/** @param {string | undefined} c */
const jsIsWhitespace = (c) =>
  c === ' ' || c === '\n' || c === '\t' || c === '\r';
/** @param {string | undefined} c */
const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';
/** @param {string | undefined} c */
const isIdentStart = (c) =>
  c !== undefined &&
  ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '$' || c === '_');
/** @param {string | undefined} c */
const isIdentPart = (c) => isIdentStart(c) || isDigit(c);

/**
 * Tokenizes a JavaScript expression string into an array of tokens.
 * Caches results for performance.
 * @param {string} expression - The JavaScript expression to tokenize.
 * @returns {JsToken[]} An array of tokens.
 */
export function tokenizeJs(expression) {
  if (jsTokenCache.has(expression)) {
    const cached = jsTokenCache.get(expression);
    if (cached) return cached;
  }

  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    let char = expression[i];
    if (char === undefined) break;

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
          tokens.push(...tokenizeJs(innerExpression || ''));
          tokens.push({ type: 'RBRACE', value: '}' });
          i++;
        } else {
          if (expression[i] === '\\') {
            const nextChar = expression[i + 1];
            currentQuasi += nextChar ? `\\${nextChar}` : `\\`;
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
      let nextChar = expression[++i];
      while (nextChar && isIdentPart(nextChar)) {
        ident += nextChar;
        nextChar = expression[++i];
      }
      const keywordType = /** @type {string | undefined} */ (
        JS_KEYWORDS[ident]
      );
      tokens.push({ type: keywordType || 'IDENTIFIER', value: ident });
      continue;
    }

    if (isDigit(char)) {
      let numStr = char;
      let nextChar = expression[++i];
      while (nextChar && (isDigit(nextChar) || nextChar === '.')) {
        numStr += nextChar;
        nextChar = expression[++i];
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
          const nextChar = expression[i];
          if (nextChar) {
            const escaped = JS_ESCAPE_MAP[nextChar];
            value += escaped !== undefined ? escaped : nextChar;
          }
          i++;
        } else {
          value += c;
        }
      }
      i++;
      tokens.push({ type: 'STRING', value });
      continue;
    }

    const twoCharOp = expression.slice(i, i + 2);
    const threeCharOp = expression.slice(i, i + 3);

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

    if (char && '()[]{},.:'.includes(char)) {
      /** @type {Record<string, string>} */
      const typeMap = {
        '(': 'LPAREN',
        ')': 'RPAREN',
        '[': 'LBRACKET',
        ']': 'RBRACKET',
        '{': 'LBRACE',
        '}': 'RBRACE',
        ',': 'COMMA',
        '.': 'DOT',
        ':': 'COLON',
      };
      const type = typeMap[char];
      if (type) {
        tokens.push({ type, value: char });
      }
      i++;
      continue;
    }

    if (char && '+-*/%<>&|!?='.includes(char)) {
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

/**
 * Parses an array of JavaScript tokens into an Abstract Syntax Tree (AST).
 * @param {JsToken[]} tokens - The array of tokens from tokenizeJs.
 * @returns {AstNode} The root node of the generated AST.
 */
export function parseJs(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const consume = () => tokens[i++];

  /** @type {() => AstNode} */
  let parseAssignment;

  /** @returns {TemplateLiteralNode} */
  const parseTemplateLiteral = () => {
    consume();
    /** @type {{type: 'TemplateElement', value: {raw: string}, tail: boolean}[]} */
    const quasis = [];
    /** @type {AstNode[]} */
    const expressions = [];

    while (peek()?.type !== 'BACKTICK') {
      if (peek()?.type === 'TEMPLATE_STRING') {
        quasis.push({
          type: 'TemplateElement',
          value: { raw: /** @type {string} */ (consume()?.value) ?? '' },
          tail: false,
        });
      }
      if (peek()?.type === 'TEMPLATE_EXPR_START') {
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
      const lastQuasi = quasis[quasis.length - 1];
      if (lastQuasi) {
        lastQuasi.tail = true;
      }
    }

    if (!peek() || peek()?.type !== 'BACKTICK')
      throw new Error('Unterminated template literal');
    consume();

    return { type: 'TemplateLiteral', quasis, expressions };
  };

  /** @returns {AstNode} */
  const parsePrimary = () => {
    const token = peek();
    if (!token) throw new Error('Unexpected end of expression.');
    switch (token.type) {
      case 'NUMBER':
      case 'STRING':
        return /** @type {LiteralNode} */ ({
          type: 'Literal',
          value: consume()?.value ?? null,
        });
      case 'BOOLEAN':
        return /** @type {LiteralNode} */ ({
          type: 'Literal',
          value: consume()?.value === 'true',
        });
      case 'NULL':
      case 'UNDEFINED':
        consume();
        return /** @type {LiteralNode} */ ({ type: 'Literal', value: null });
      case 'IDENTIFIER':
        return /** @type {IdentifierNode} */ ({
          type: 'Identifier',
          name: /** @type {string} */ (consume()?.value) ?? '',
        });
      case 'LPAREN': {
        consume();
        if (peek()?.type === 'RPAREN') {
          consume();
          return /** @type {EmptyParenthesesNode} */ ({
            type: 'EmptyParentheses',
          });
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
        throw new Error(
          `Parser Error: Unexpected token ${token.type} with value ${token.value}`,
        );
    }
  };

  /** @returns {ObjectExpressionNode} */
  const parseObjectLiteral = () => {
    consume();
    /** @type {{type: 'Property', key: AstNode, value: AstNode}[]} */
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

  /** @returns {ArrayExpressionNode} */
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

  /** @returns {AstNode} */
  const parseAccessors = () => {
    let node = parsePrimary();
    while (peek()) {
      const currentToken = peek();
      if (!currentToken) break;
      if (currentToken.value === '.' || currentToken.value === '?.') {
        const optional = consume()?.value === '?.';
        const prop = consume();
        if (!prop || prop.type !== 'IDENTIFIER')
          throw new Error("Expected identifier after '.'");
        node = /** @type {MemberExpressionNode} */ ({
          type: 'MemberExpression',
          object: node,
          property: {
            type: 'Identifier',
            name: /** @type {string} */ (prop.value) ?? '',
          },
          optional: optional ?? false,
        });
      } else if (currentToken.type === 'LBRACKET') {
        consume();
        const prop = parseAssignment();
        if (peek()?.type !== 'RBRACKET') throw new Error("Expected ']'");
        consume();
        node = /** @type {ComputedMemberExpressionNode} */ ({
          type: 'ComputedMemberExpression',
          object: node,
          property: prop,
          optional: false,
          computed: true,
        });
      } else if (currentToken.type === 'LPAREN') {
        consume();
        const args = [];
        if (peek()?.type !== 'RPAREN') {
          do {
            args.push(parseAssignment());
          } while (peek()?.type === 'COMMA' && consume());
        }
        if (peek()?.type !== 'RPAREN') throw new Error("Expected ')'");
        consume();
        const isOptional =
          node.type === 'MemberExpression' &&
          /** @type {MemberExpressionNode} */ (node).optional;
        node = /** @type {CallExpressionNode} */ ({
          type: 'CallExpression',
          callee: node,
          arguments: args,
          optional: isOptional,
        });
      } else {
        break;
      }
    }
    return node;
  };

  /** @returns {AstNode} */
  const parseUnary = () => {
    const currentToken = peek();
    if (
      currentToken?.type === 'OPERATOR' &&
      (currentToken.value === '!' || currentToken.value === '-')
    ) {
      const op = consume()?.value;
      if (typeof op !== 'string') {
        throw new Error('Expected unary operator');
      }
      return /** @type {UnaryExpressionNode} */ ({
        type: 'UnaryExpression',
        operator: op,
        argument: parseUnary(),
      });
    }
    return parseAccessors();
  };

  /**
   * @param {() => AstNode} nextParser
   * @param {string[]} operators
   * @returns {() => AstNode}
   */
  const buildBinaryParser = (nextParser, operators) => () => {
    let left = nextParser();
    let currentToken = peek();
    while (
      currentToken &&
      typeof currentToken.value === 'string' &&
      operators.includes(currentToken.value)
    ) {
      const op = consume()?.value;
      if (typeof op !== 'string') {
        throw new Error('Expected binary operator');
      }
      const right = nextParser();
      left = /** @type {BinaryExpressionNode} */ ({
        type: 'BinaryExpression',
        operator: op,
        left,
        right,
      });
      currentToken = peek();
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

  /** @returns {AstNode} */
  const parseConditional = () => {
    const test = parseNullishCoalescing();
    if (peek()?.value === '?') {
      consume();
      const consequent = parseAssignment();
      if (peek()?.type !== 'COLON')
        throw new Error("Expected ':' for ternary operator.");
      consume();
      const alternate = parseAssignment();
      return /** @type {ConditionalExpressionNode} */ ({
        type: 'ConditionalExpression',
        test,
        consequent,
        alternate,
      });
    }
    return test;
  };

  /** @returns {AstNode} */
  const parseArrow = () => {
    const left = parseConditional();
    if (peek()?.type === 'ARROW') {
      consume();
      /** @type {AstNode[]} */
      const params =
        left.type === 'Identifier'
          ? [left]
          : left.type === 'EmptyParentheses'
            ? []
            : /** @type {ArrowFunctionExpressionNode} */ (left).expressions ||
              [];
      if (!Array.isArray(params))
        throw new Error('Invalid arrow function parameters.');
      return /** @type {ArrowFunctionExpressionNode} */ ({
        type: 'ArrowFunctionExpression',
        params,
        body: parseAssignment(),
      });
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
      return /** @type {AssignmentExpressionNode} */ ({
        type: 'AssignmentExpression',
        left,
        right: parseAssignment(),
      });
    }
    return left;
  };

  const ast = parseAssignment();

  if (i < tokens.length) {
    const token = peek();
    if (token) {
      throw new Error(
        `Parser Error: Unexpected token '${token.value}' at end of expression.`,
      );
    }
  }

  return ast;
}
