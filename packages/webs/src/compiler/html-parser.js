import { void_elements } from "../utils";

const html_is_whitespace = (c) =>
  c === " " || c === "\n" || c === "\t" || c === "\r";

export const html_ast_cache = new Map();

const State = {
  DATA: 1,
  TAG_OPEN: 2,
  TAG_NAME: 3,
  BEFORE_ATTR: 4,
  ATTR_NAME: 5,
  BEFORE_ATTR_VALUE: 6,
  ATTR_VALUE_D_QUOTED: 7,
  ATTR_VALUE_S_QUOTED: 8,
  ATTR_VALUE_UNQUOTED: 9,
  COMMENT: 10,
  SELF_CLOSING: 11,
};

/**
 * Tokenizes an HTML string.
 * @param {string} html - The HTML string to tokenize.
 * @returns {Array<object>} An array of token objects.
 */
export function tokenize_html(html) {
  let state = State.DATA;
  let i = 0;
  const tokens = [];
  let buffer = "";
  let tag_token = null;
  while (i < html.length) {
    const char = html[i];
    switch (state) {
      case State.DATA:
        if (char === "<") {
          if (buffer) tokens.push({ type: "text", content: buffer });
          buffer = "";
          state = State.TAG_OPEN;
        } else {
          buffer += char;
        }
        break;
      case State.TAG_OPEN:
        if (char === "!") {
          if (html.substring(i, i + 3) === "!--") {
            state = State.COMMENT;
            i += 2;
          }
        } else if (char === "/") {
          tag_token = { type: "tagEnd", tagName: "" };
          state = State.TAG_NAME;
        } else if (/[a-zA-Z]/.test(char)) {
          tag_token = { type: "tagStart", tagName: char, attributes: [] };
          state = State.TAG_NAME;
        }
        break;
      case State.TAG_NAME:
        if (html_is_whitespace(char)) {
          state = State.BEFORE_ATTR;
        } else if (char === "/") {
          state = State.SELF_CLOSING;
        } else if (char === ">") {
          tokens.push(tag_token);
          state = State.DATA;
        } else {
          tag_token.tagName += char;
        }
        break;
      case State.BEFORE_ATTR:
        if (!html_is_whitespace(char)) {
          if (char === ">") {
            tokens.push(tag_token);
            state = State.DATA;
          } else if (char === "/") {
            state = State.SELF_CLOSING;
          } else if (char !== "=") {
            buffer = char;
            state = State.ATTR_NAME;
          }
        }
        break;
      case State.ATTR_NAME:
        if (char === "=" || html_is_whitespace(char) || char === ">") {
          tag_token.attributes.push({ name: buffer, value: true });
          buffer = "";
          if (char === "=") state = State.BEFORE_ATTR_VALUE;
          else if (char === ">") {
            tokens.push(tag_token);
            state = State.DATA;
          } else state = State.BEFORE_ATTR;
        } else {
          buffer += char;
        }
        break;
      case State.BEFORE_ATTR_VALUE:
        if (char === '"') state = State.ATTR_VALUE_D_QUOTED;
        else if (char === "'") state = State.ATTR_VALUE_S_QUOTED;
        else if (!html_is_whitespace(char)) {
          buffer = char;
          state = State.ATTR_VALUE_UNQUOTED;
        }
        break;
      case State.ATTR_VALUE_D_QUOTED:
      case State.ATTR_VALUE_S_QUOTED:
        const quote = state === State.ATTR_VALUE_D_QUOTED ? '"' : "'";
        if (char === quote) {
          tag_token.attributes[tag_token.attributes.length - 1].value = buffer;
          buffer = "";
          state = State.BEFORE_ATTR;
        } else {
          buffer += char;
        }
        break;
      case State.ATTR_VALUE_UNQUOTED:
        if (html_is_whitespace(char) || char === ">") {
          tag_token.attributes[tag_token.attributes.length - 1].value = buffer;
          buffer = "";
          state = char === ">" ? State.DATA : State.BEFORE_ATTR;
          if (char === ">") tokens.push(tag_token);
        } else {
          buffer += char;
        }
        break;
      case State.COMMENT:
        if (char === "-" && html.substring(i, i + 3) === "-->") {
          tokens.push({ type: "comment", content: buffer });
          buffer = "";
          i += 2;
          state = State.DATA;
        } else {
          buffer += char;
        }
        break;
      case State.SELF_CLOSING:
        if (char === ">") {
          tokens.push(tag_token);
          state = State.DATA;
        }
        break;
    }
    i++;
  }
  if (state === State.DATA && buffer) {
    tokens.push({ type: "text", content: buffer });
  }
  return tokens;
}

/**
 * Builds a parse tree from an array of HTML tokens.
 * @param {Array<object>} tokens - The array of tokens from `tokenize_html`.
 * @returns {object} A root node of the parsed tree.
 */
export function build_tree(tokens) {
  const root = { type: "root", children: [] };
  const stack = [root];
  for (const token of tokens) {
    const parent = stack[stack.length - 1];
    if (token.type === "tagStart") {
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
    } else if (token.type === "tagEnd") {
      const tag_name_lower = token.tagName.toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName === tag_name_lower) {
          stack.length = i;
          break;
        }
      }
    } else if (token.type === "text") {
      if (token.content.trim().length === 0) {
        continue;
      }
      parent.children.push({ type: "text", content: token.content });
    } else if (token.type === "comment") {
      parent.children.push({ type: "comment", content: token.content });
    }
  }
  return root;
}

/**
 * Parses an HTML string into a simplified AST. Caches the result.
 * @param {string} html - The HTML string to parse.
 * @returns {object} The root of the HTML AST.
 */
export function parse_html(html) {
  if (html_ast_cache.has(html)) {
    return html_ast_cache.get(html);
  }
  const tokens = tokenize_html(html);
  const ast = build_tree(tokens);
  html_ast_cache.set(html, ast);
  return ast;
}
