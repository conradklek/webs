const js_is_whitespace = (c) =>
  c === " " || c === "\n" || c === "\t" || c === "\r";

const is_digit = (c) => c >= "0" && c <= "9";

const is_ident_start = (c) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "$" || c === "_";

const is_ident_part = (c) => is_ident_start(c) || is_digit(c);

export const js_token_cache = new Map();

const JS_ESCAPE_MAP = { n: "\n", t: "\t", r: "\r" };

const JS_KEYWORDS = {
  true: "BOOLEAN",
  false: "BOOLEAN",
  null: "NULL",
  undefined: "UNDEFINED",
};

/**
 * Tokenizes a JavaScript expression string.
 * @param {string} expression - The expression string to tokenize.
 * @returns {Array<object>} An array of token objects.
 */
export function tokenize_expression(expression) {
  if (js_token_cache.has(expression)) {
    return js_token_cache.get(expression);
  }
  const tokens = [];
  let i = 0;
  while (i < expression.length) {
    let char = expression[i];
    if (js_is_whitespace(char)) {
      i++;
      continue;
    }
    if (is_ident_start(char)) {
      let ident = char;
      while (++i < expression.length && is_ident_part(expression[i])) {
        ident += expression[i];
      }
      tokens.push({ type: JS_KEYWORDS[ident] || "IDENTIFIER", value: ident });
      continue;
    }
    if (is_digit(char)) {
      let num_str = char;
      while (
        ++i < expression.length &&
        (is_digit(expression[i]) || expression[i] === ".")
      ) {
        num_str += expression[i];
      }
      tokens.push({ type: "NUMBER", value: parseFloat(num_str) });
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      let value = "";
      i++;
      while (i < expression.length && expression[i] !== quote) {
        let c = expression[i++];
        if (c === "\\" && i < expression.length) {
          c = expression[i];
          value += JS_ESCAPE_MAP[c] || c;
          i++;
        } else {
          value += c;
        }
      }
      i++;
      tokens.push({ type: "STRING", value });
      continue;
    }
    const two_char_op = char + expression[i + 1];
    const three_char_op = two_char_op + expression[i + 2];
    if (three_char_op === "===" || three_char_op === "!==") {
      tokens.push({ type: "OPERATOR", value: three_char_op });
      i += 3;
      continue;
    }
    if (
      ["==", "!=", "<=", ">=", "&&", "||", "??", "?.", "=>"].includes(
        two_char_op,
      )
    ) {
      tokens.push({
        type: two_char_op === "=>" ? "ARROW" : "OPERATOR",
        value: two_char_op,
      });
      i += 2;
      continue;
    }
    if ("()[]{},.:".includes(char)) {
      const type = {
        "(": "LPAREN",
        ")": "RPAREN",
        "[": "LBRACKET",
        "]": "RBRACKET",
        "{": "LBRACE",
        "}": "RBRACE",
        ",": "COMMA",
        ".": "DOT",
        ":": "COLON",
      }[char];
      tokens.push({ type, value: char });
      i++;
      continue;
    }
    if ("+-*/<>&|!?=".includes(char)) {
      tokens.push({ type: char === "=" ? "EQUALS" : "OPERATOR", value: char });
      i++;
      continue;
    }
    throw new Error(`Tokenizer Error: Unrecognized character '${char}'`);
  }
  js_token_cache.set(expression, tokens);
  return tokens;
}

/**
 * Parses an array of JavaScript expression tokens into an AST.
 * @param {Array<object>} tokens - The array of tokens from `tokenize_expression`.
 * @returns {object} An expression AST object.
 */
export function parse_expression(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const consume = () => tokens[i++];
  let parse_assignment;
  const parse_object_literal = () => {
    consume();
    const properties = [];
    if (peek()?.type !== "RBRACE") {
      do {
        const key = parse_primary();
        if (key.type !== "Identifier" && key.type !== "Literal") {
          throw new Error("Invalid property key in object literal.");
        }
        if (peek()?.type !== "COLON")
          throw new Error("Expected ':' after property key.");
        consume();
        const value = parse_assignment();
        properties.push({ type: "Property", key, value });
      } while (peek()?.type === "COMMA" && consume());
    }
    if (peek()?.type !== "RBRACE")
      throw new Error("Expected '}' to close object literal.");
    consume();
    return { type: "ObjectLiteral", properties };
  };
  const parse_primary = () => {
    const token = peek();
    if (!token) throw new Error("Unexpected end of expression.");
    switch (token.type) {
      case "NUMBER":
      case "STRING":
        return { type: "Literal", value: consume().value };
      case "BOOLEAN":
        return { type: "Literal", value: consume().value === "true" };
      case "NULL":
      case "UNDEFINED":
        consume();
        return { type: "Literal", value: null };
      case "IDENTIFIER":
        return { type: "Identifier", name: consume().value };
      case "LPAREN": {
        consume();
        if (peek()?.type === "RPAREN") {
          consume();
          return { type: "EmptyParentheses" };
        }
        const expr = parse_assignment();
        if (peek()?.type !== "RPAREN") throw new Error("Expected ')'");
        consume();
        return expr;
      }
      case "LBRACE":
        return parse_object_literal();
      default:
        throw new Error(`Parser Error: Unexpected token ${token.type}`);
    }
  };
  const parse_accessors = () => {
    let node = parse_primary();
    while (peek()) {
      if (peek().value === "." || peek().value === "?.") {
        const optional = consume().value === "?.";
        const prop = consume();
        if (prop.type !== "IDENTIFIER")
          throw new Error("Expected identifier after '.'");
        node = {
          type: "MemberExpression",
          object: node,
          property: { type: "Identifier", name: prop.value },
          optional,
        };
      } else if (peek().type === "LBRACKET") {
        consume();
        const prop = parse_assignment();
        if (peek()?.type !== "RBRACKET") throw new Error("Expected ']'");
        consume();
        node = {
          type: "ComputedMemberExpression",
          object: node,
          property: prop,
          optional: false,
        };
      } else if (peek().type === "LPAREN") {
        consume();
        const args = [];
        if (peek().type !== "RPAREN") {
          do {
            args.push(parse_assignment());
          } while (peek()?.type === "COMMA" && consume());
        }
        if (peek()?.type !== "RPAREN") throw new Error("Expected ')'");
        consume();
        node = {
          type: "CallExpression",
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
  const parse_unary = () => {
    if (
      peek()?.type === "OPERATOR" &&
      (peek().value === "!" || peek().value === "-")
    ) {
      const op = consume().value;
      return { type: "UnaryExpression", operator: op, argument: parse_unary() };
    }
    return parse_accessors();
  };
  const build_binary_parser = (next, ops) => () => {
    let left = next();
    while (peek() && ops.includes(peek().value)) {
      const op = consume().value;
      const right = next();
      left = { type: "BinaryExpression", operator: op, left, right };
    }
    return left;
  };
  const parse_multiplicative = build_binary_parser(parse_unary, ["*", "/"]);
  const parse_additive = build_binary_parser(parse_multiplicative, ["+", "-"]);
  const parse_comparison = build_binary_parser(parse_additive, [
    "<",
    ">",
    "<=",
    ">=",
  ]);
  const parse_equality = build_binary_parser(parse_comparison, [
    "==",
    "!=",
    "===",
    "!==",
  ]);
  const parse_logical_and = build_binary_parser(parse_equality, ["&&"]);
  const parse_nullish_coalescing = build_binary_parser(parse_logical_and, [
    "??",
  ]);
  const parse_logical_or = build_binary_parser(parse_nullish_coalescing, [
    "||",
  ]);
  const parse_ternary = () => {
    const test = parse_logical_or();
    if (peek()?.value === "?") {
      consume();
      const consequent = parse_ternary();
      if (peek()?.type !== "COLON")
        throw new Error("Expected ':' for ternary operator.");
      consume();
      const alternate = parse_ternary();
      return { type: "ConditionalExpression", test, consequent, alternate };
    }
    return test;
  };
  const parse_arrow = () => {
    const left = parse_ternary();
    if (peek()?.type === "ARROW") {
      consume();
      const params =
        left.type === "Identifier"
          ? [left]
          : left.type === "EmptyParentheses"
            ? []
            : left.expressions;
      if (!Array.isArray(params))
        throw new Error("Invalid arrow function parameters.");
      return {
        type: "ArrowFunctionExpression",
        params,
        body: parse_assignment(),
      };
    }
    return left;
  };
  parse_assignment = () => {
    const left = parse_arrow();
    if (peek()?.type === "EQUALS") {
      consume();
      if (
        left.type !== "Identifier" &&
        left.type !== "MemberExpression" &&
        left.type !== "ComputedMemberExpression"
      ) {
        throw new Error("Invalid left-hand side in assignment expression.");
      }
      return { type: "AssignmentExpression", left, right: parse_assignment() };
    }
    return left;
  };
  const ast = parse_assignment();
  if (i < tokens.length) {
    throw new Error(`Parser Error: Unexpected tokens at end of expression.`);
  }
  return ast;
}
