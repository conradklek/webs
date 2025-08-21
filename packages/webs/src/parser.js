const void_elements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const js_token_cache = new Map();

const JS_ESCAPE_MAP = { n: "\n", t: "\t", r: "\r" };
const JS_KEYWORDS = {
  true: "BOOLEAN",
  false: "BOOLEAN",
  null: "NULL",
  undefined: "UNDEFINED",
};

const js_is_whitespace = (c) =>
  c === " " || c === "\n" || c === "\t" || c === "\r";
const is_digit = (c) => c >= "0" && c <= "9";
const is_ident_start = (c) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "$" || c === "_";
const is_ident_part = (c) => is_ident_start(c) || is_digit(c);

export function tokenize_js(expression) {
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

export function parse_js(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const consume = () => tokens[i++];

  let parse_assignment;

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

  const build_binary_parser = (next_parser, operators) => () => {
    let left = next_parser();
    while (peek() && operators.includes(peek().value)) {
      const op = consume().value;
      const right = next_parser();
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

export const html_ast_cache = new Map();

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

const html_is_whitespace = (c) =>
  c === " " || c === "\n" || c === "\t" || c === "\r";

function tokenize_html(html) {
  let state = HTML_TOKENIZER_STATE.DATA;
  let i = 0;
  const tokens = [];
  let buffer = "";
  let tag_token = null;

  while (i < html.length) {
    const char = html[i];
    switch (state) {
      case HTML_TOKENIZER_STATE.DATA:
        if (char === "<") {
          if (buffer) tokens.push({ type: "text", content: buffer });
          buffer = "";
          state = HTML_TOKENIZER_STATE.TAG_OPEN;
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.TAG_OPEN:
        if (char === "!") {
          if (html.substring(i, i + 3) === "!--") {
            state = HTML_TOKENIZER_STATE.COMMENT;
            i += 2;
          }
        } else if (char === "/") {
          tag_token = { type: "tagEnd", tagName: "" };
          state = HTML_TOKENIZER_STATE.TAG_NAME;
        } else if (/[a-zA-Z]/.test(char)) {
          tag_token = { type: "tagStart", tagName: char, attributes: [] };
          state = HTML_TOKENIZER_STATE.TAG_NAME;
        }
        break;

      case HTML_TOKENIZER_STATE.TAG_NAME:
        if (html_is_whitespace(char)) {
          state = HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME;
        } else if (char === "/") {
          state = HTML_TOKENIZER_STATE.SELF_CLOSING_START_TAG;
        } else if (char === ">") {
          tokens.push(tag_token);
          state = HTML_TOKENIZER_STATE.DATA;
        } else {
          tag_token.tagName += char;
        }
        break;

      case HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME:
        if (!html_is_whitespace(char)) {
          if (char === ">") {
            tokens.push(tag_token);
            state = HTML_TOKENIZER_STATE.DATA;
          } else if (char === "/") {
            state = HTML_TOKENIZER_STATE.SELF_CLOSING_START_TAG;
          } else if (char !== "=") {
            buffer = char;
            state = HTML_TOKENIZER_STATE.ATTRIBUTE_NAME;
          }
        }
        break;

      case HTML_TOKENIZER_STATE.ATTRIBUTE_NAME:
        if (char === "=" || html_is_whitespace(char) || char === ">") {
          tag_token.attributes.push({ name: buffer, value: true });
          buffer = "";
          if (char === "=") state = HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_VALUE;
          else if (char === ">") {
            tokens.push(tag_token);
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
        else if (!html_is_whitespace(char)) {
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
          tag_token.attributes[tag_token.attributes.length - 1].value = buffer;
          buffer = "";
          state = HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME;
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.ATTRIBUTE_VALUE_UNQUOTED:
        if (html_is_whitespace(char) || char === ">") {
          tag_token.attributes[tag_token.attributes.length - 1].value = buffer;
          buffer = "";
          state =
            char === ">"
              ? HTML_TOKENIZER_STATE.DATA
              : HTML_TOKENIZER_STATE.BEFORE_ATTRIBUTE_NAME;
          if (char === ">") tokens.push(tag_token);
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.COMMENT:
        if (char === "-" && html.substring(i, i + 3) === "-->") {
          tokens.push({ type: "comment", content: buffer });
          buffer = "";
          i += 2;
          state = HTML_TOKENIZER_STATE.DATA;
        } else {
          buffer += char;
        }
        break;

      case HTML_TOKENIZER_STATE.SELF_CLOSING_START_TAG:
        if (char === ">") {
          tokens.push(tag_token);
          state = HTML_TOKENIZER_STATE.DATA;
        }
        break;
    }
    i++;
  }

  if (state === HTML_TOKENIZER_STATE.DATA && buffer) {
    tokens.push({ type: "text", content: buffer });
  }
  return tokens;
}

export function build_tree(tokens) {
  const root = { type: "root", children: [] };
  const stack = [root];

  for (const token of tokens) {
    const parent = stack[stack.length - 1];
    switch (token.type) {
      case "tagStart": {
        const node = {
          type: "element",
          tagName: token.tagName.toLowerCase(),
          attributes: token.attributes,
          children: [],
        };
        parent.children.push(node);
        if (!void_elements.has(node.tagName)) {
          stack.push(node);
        }
        break;
      }
      case "tagEnd": {
        const tag_name_lower = token.tagName.toLowerCase();
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tagName === tag_name_lower) {
            stack.length = i;
            break;
          }
        }
        break;
      }
      case "text":
        if (token.content.trim().length > 0) {
          parent.children.push({ type: "text", content: token.content });
        }
        break;
      case "comment":
        parent.children.push({ type: "comment", content: token.content });
        break;
    }
  }
  return root;
}

export function parse_html(html) {
  if (html_ast_cache.has(html)) {
    return html_ast_cache.get(html);
  }
  const tokens = tokenize_html(html);
  const ast = build_tree(tokens);
  html_ast_cache.set(html, ast);
  return ast;
}
