export const css_is_whitespace = (char) => /\s/.test(char);
export const css_is_ident_start = (char) => /[a-zA-Z]/.test(char);
export const css_is_ident_part = (char) => /[a-zA-Z0-9-_]/.test(char);

/**
 * Tokenizes a CSS string into an array of tokens.
 * @param {string} css - The CSS string to tokenize.
 * @returns {Array<object>} An array of token objects.
 */
export function tokenize_css(css) {
  const tokens = [];
  let i = 0;
  while (i < css.length) {
    let char = css[i];
    if (css_is_whitespace(char)) {
      i++;
      while (i < css.length && css_is_whitespace(css[i])) {
        i++;
      }
      tokens.push({ type: "WHITESPACE", value: " " });
      continue;
    }
    if (i + 1 < css.length && char === "/" && css[i + 1] === "*") {
      const comment_end = css.indexOf("*/", i + 2);
      if (comment_end === -1) {
        i = css.length;
      } else {
        i = comment_end + 2;
      }
      continue;
    }
    if (
      /[0-9]/.test(char) ||
      (char === "." && i + 1 < css.length && /[0-9]/.test(css[i + 1])) ||
      (char === "-" &&
        i + 1 < css.length &&
        (/[0-9]/.test(css[i + 1]) ||
          (css[i + 1] === "." &&
            i + 2 < css.length &&
            /[0-9]/.test(css[i + 2]))))
    ) {
      let value = char;
      i++;
      while (i < css.length && /[0-9.]/.test(css[i])) {
        value += css[i++];
      }
      let unit = "";
      if (i < css.length && css[i] === "%") {
        unit += css[i++];
      } else {
        while (i < css.length && css_is_ident_start(css[i])) {
          unit += css[i++];
        }
      }
      tokens.push({ type: "VALUE", value: value + unit });
      continue;
    }
    if ("{}:;,.#[]=>!+~".includes(char)) {
      const type = {
        "{": "LBRACE",
        "}": "RBRACE",
        ":": "COLON",
        ";": "SEMICOLON",
        ",": "COMMA",
        ".": "DOT",
        "#": "HASH",
        ">": "COMBINATOR",
        "+": "COMBINATOR",
        "~": "COMBINATOR",
        "[": "LBRACKET",
        "]": "RBRACKET",
        "=": "EQUALS",
        "!": "BANG",
      }[char];
      tokens.push({ type, value: char });
      i++;
      continue;
    }
    if (
      css_is_ident_start(char) ||
      (char === "-" && i + 1 < css.length && css_is_ident_start(css[i + 1]))
    ) {
      let value = char;
      while (++i < css.length && css_is_ident_part(css[i])) {
        value += css[i];
      }
      tokens.push({ type: "IDENT", value });
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      let value = "";
      i++;
      while (i < css.length && css[i] !== quote) {
        value += css[i++];
      }
      i++;
      tokens.push({ type: "STRING", value });
      continue;
    }
    throw new Error(
      `Tokenizer Error: Unrecognized character '${char}' at position ${i}`,
    );
  }
  return tokens;
}

/**
 * Parses an array of CSS tokens into a stylesheet AST.
 * @param {Array<object>} tokens - The array of tokens from `tokenize_css`.
 * @returns {object} A stylesheet AST object.
 */
export function parse_css(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const consume = () => tokens[i++];
  const eof = () => i >= tokens.length;
  const consume_whitespace = () => {
    while (peek()?.type === "WHITESPACE") consume();
  };
  const parse_declarations = () => {
    const declarations = [];
    consume();
    while (!eof() && peek().type !== "RBRACE") {
      consume_whitespace();
      if (eof() || peek().type === "RBRACE") break;
      if (peek().type === "SEMICOLON") {
        consume();
        continue;
      }
      const prop_token = consume();
      if (prop_token.type !== "IDENT")
        throw new Error(`Expected property name, but got ${prop_token.type}`);
      consume_whitespace();
      if (peek()?.type !== "COLON")
        throw new Error("Expected ':' after property name.");
      consume();
      consume_whitespace();
      const value_tokens = [];
      while (
        !eof() &&
        peek().type !== "SEMICOLON" &&
        peek().type !== "RBRACE" &&
        peek().type !== "BANG"
      ) {
        value_tokens.push(consume());
      }
      let value = value_tokens
        .filter((t) => t.type !== "WHITESPACE")
        .map((t) => t.value)
        .join(" ");
      const declaration = {
        type: "declaration",
        property: prop_token.value,
        value,
      };
      consume_whitespace();
      if (peek()?.type === "BANG") {
        consume();
        consume_whitespace();
        const important_token = peek();
        if (
          important_token?.type === "IDENT" &&
          important_token?.value === "important"
        ) {
          consume();
          declaration.important = true;
        }
      }
      declarations.push(declaration);
    }
    consume();
    return declarations;
  };
  const build_selector_string = (tokens) => {
    if (!tokens || tokens.length === 0) return "";
    return tokens
      .map((t) => {
        if (t.type === "STRING") return `"${t.value}"`;
        return t.value;
      })
      .join("")
      .trim();
  };
  const parse_rule = () => {
    const selector_tokens = [];
    while (!eof() && peek().type !== "LBRACE") {
      selector_tokens.push(consume());
    }
    const selectors = [];
    let current_group = [];
    for (const token of selector_tokens) {
      if (token.type === "COMMA") {
        selectors.push(build_selector_string(current_group));
        current_group = [];
      } else {
        if (token.type === "WHITESPACE" && current_group.length === 0) continue;
        current_group.push(token);
      }
    }
    selectors.push(build_selector_string(current_group));
    return {
      type: "rule",
      selectors: selectors.filter((s) => s.length > 0),
      declarations: parse_declarations(),
    };
  };
  const rules = [];
  consume_whitespace();
  while (!eof()) {
    rules.push(parse_rule());
    consume_whitespace();
  }
  return { type: "stylesheet", rules };
}
