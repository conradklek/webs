import { h, Text, Fragment, Comment, Teleport } from "./renderer.js";
import { void_elements } from "./utils.js";

const cache_string_function = (fn) => {
  const cache = Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};

const camelize = cache_string_function((str) => {
  return str.replace(/-(\w)/g, (_, c) => (c ? c.toUpperCase() : ""));
});

// Enum for different types of nodes in the transformed AST.
const NODE_TYPES = {
  ROOT: 0,
  ELEMENT: 1,
  COMPONENT: 2,
  TEXT: 3,
  INTERPOLATION: 4,
  COMMENT: 5,
  FRAGMENT: 6,
  IF: 7,
  FOR: 8,
};

// Enum for different types of attributes on an element.
const ATTR_TYPES = {
  STATIC: 10,
  DIRECTIVE: 11,
  EVENT_HANDLER: 12,
};

// Constant strings for directive names.
const DIR_IF = "w-if";
const DIR_ELSE_IF = "w-else-if";
const DIR_ELSE = "w-else";
const DIR_FOR = "w-for";
const DIR_MODEL = "w-model";

/**
 * Generates a render function from a transformed Abstract Syntax Tree (AST).
 * @param {object} ast - The transformed AST of the component template.
 * @returns {Function} A render function that takes the component context and returns a VNode tree.
 */
function generate_render_fn(ast) {
  const ctx = {
    scope: new Set(),
    gen_expr(expr) {
      if (!expr) return "null";
      switch (expr.type) {
        case "Identifier":
          return this.scope.has(expr.name) ? expr.name : `_ctx.${expr.name}`;
        case "Literal":
          return JSON.stringify(expr.value);
        case "BinaryExpression":
          return `(${this.gen_expr(expr.left)}${expr.operator}${this.gen_expr(expr.right)})`;
        case "UnaryExpression":
          return `${expr.operator}${this.gen_expr(expr.argument)}`;
        case "MemberExpression":
          return `${this.gen_expr(expr.object)}?.${expr.property.name}`;
        case "ComputedMemberExpression":
          return `${this.gen_expr(expr.object)}[${this.gen_expr(expr.property)}]`;
        case "CallExpression":
          return `${this.gen_expr(expr.callee)}(${expr.arguments.map((a) => this.gen_expr(a)).join(",")})`;
        case "ConditionalExpression":
          return `(${this.gen_expr(expr.test)}?${this.gen_expr(expr.consequent)}:${this.gen_expr(expr.alternate)})`;
        case "AssignmentExpression":
          return `(${this.gen_expr(expr.left)}=${this.gen_expr(expr.right)})`;
        default:
          return "null";
      }
    },
    gen_props(props) {
      const gen_prop = (p) => {
        if (p.type === ATTR_TYPES.STATIC) {
          return `'${p.name}':${JSON.stringify(p.value)}`;
        }
        if (p.type === ATTR_TYPES.DIRECTIVE)
          return `'${p.name}':${this.gen_expr(p.expression)}`;
        if (p.type === ATTR_TYPES.EVENT_HANDLER) {
          const expr_code = this.gen_expr(p.expression);
          let handler_body = expr_code;
          if (p.expression && p.expression.type === "Identifier") {
            handler_body = `${expr_code}()`;
          }
          if (p.modifiers && p.modifiers.size > 0) {
            const statements = [];
            if (p.modifiers.has("prevent")) {
              statements.push("$event.preventDefault();");
            }
            if (p.modifiers.has("stop")) {
              statements.push("$event.stopPropagation();");
            }
            statements.push(handler_body);
            return `'${p.name}': ($event) => { ${statements.join(" ")} }`;
          } else {
            return `'${p.name}': ($event) => (${handler_body})`;
          }
        }
      };
      return `{${props
        .map((p) => p && gen_prop(p))
        .filter(Boolean)
        .join(",")}}`;
    },
    gen_children(children) {
      return `[${children
        .map((c) => this.gen_node(c))
        .filter(Boolean)
        .join(",")}]`;
    },
    gen_node(node) {
      if (!node) return "null";
      switch (node.type) {
        case NODE_TYPES.ROOT:
        case NODE_TYPES.FRAGMENT:
          return `_h(_Fragment,null,${this.gen_children(node.children)})`;
        case NODE_TYPES.COMPONENT:
          return `_h(_ctx.${node.tag_name},${this.gen_props(node.properties)},${this.gen_children(node.children)})`;
        case NODE_TYPES.ELEMENT:
          return `_h('${node.tag_name}',${this.gen_props(node.properties)},${this.gen_children(node.children)})`;
        case NODE_TYPES.TEXT:
          return `_h(_Text,null,${JSON.stringify(node.value)})`;
        case NODE_TYPES.INTERPOLATION:
          return `_h(_Text,null,String(${this.gen_expr(node.expression)}))`;
        case NODE_TYPES.COMMENT:
          return `_h(_Comment,null,${JSON.stringify(node.value)})`;
        case NODE_TYPES.IF: {
          const gen_branch = (branch) => {
            if (branch.condition) {
              return `(${this.gen_expr(branch.condition)}) ? ${this.gen_node(branch.node)} : `;
            }
            return this.gen_node(branch.node);
          };
          const has_else =
            node.branches[node.branches.length - 1].condition === null;
          let code = node.branches.map(gen_branch).join("");
          if (!has_else) {
            code += `_h(_Comment, null, 'w-if-fallback')`;
          }
          return `(${code})`;
        }
        case NODE_TYPES.FOR: {
          const { source, value, key } = node;
          const params = key ? `(${value}, ${key})` : value;
          this.scope.add(value);
          if (key) this.scope.add(key);
          const child_code = this.gen_node(node.children[0]);
          this.scope.delete(value);
          if (key) this.scope.delete(key);
          return `_h(_Fragment, null, (${this.gen_expr(source)} || []).map(${params} => (${child_code})))`;
        }
      }
      return "null";
    },
  };
  const root_node =
    ast.type === NODE_TYPES.ROOT && ast.children.length === 1
      ? ast.children[0]
      : ast;
  const generated_code = ctx.gen_node(root_node);
  const function_body = `
const { h: _h, Text: _Text, Fragment: _Fragment, Comment: _Comment } = Webs;
return ${generated_code || "null"};
`;
  try {
    return new Function("Webs", "_ctx", function_body).bind(null, {
      h,
      Text,
      Fragment,
      Comment,
      Teleport,
    });
  } catch (e) {
    console.error("Error compiling render function:", e);
    console.log("Generated code:\n", function_body);
    return () => h(Comment, null, "Render function compile error");
  }
}

/**
 * The main Compiler class that orchestrates the template compilation process.
 */
class Compiler {
  constructor(component_def, options = null) {
    this.definition = component_def;
    this.component_tags = new Set(Object.keys(component_def.components || {}));
    this.options = options;
  }

  /**
   * Compiles the component's template into a render function.
   * @returns {Function} The generated render function.
   */
  compile() {
    const raw_ast = parse_html(this.definition.template);
    const transformed_ast = this._transform_node(raw_ast);
    return generate_render_fn(transformed_ast);
  }

  _parse_expr(str) {
    if (!str) return null;
    const clean_str = str.replace(/\n/g, " ").trim();
    try {
      return parse_expression(tokenize_expression(clean_str));
    } catch (e) {
      console.warn(`Expression parse error: "${str}"`, e);
      return null;
    }
  }

  _transform_node(node) {
    switch (node.type) {
      case "root":
        return {
          type: NODE_TYPES.ROOT,
          children: this._transform_children(node.children),
        };
      case "element":
        return this._transform_element(node);
      case "text":
        return this._transform_text(node);
      case "comment":
        return { type: NODE_TYPES.COMMENT, value: node.content };
      default:
        return null;
    }
  }

  _transform_text(node) {
    const unescape = (str) => {
      return str.replace(
        /&amp;|&lt;|&gt;|&quot;|&#039;|&larr;|&rarr;|&uarr;|&darr;|&harr;|&crarr;|&nbsp;/g,
        (tag) => {
          const replacements = {
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&#039;": "'",
            "&larr;": "←",
            "&rarr;": "→",
            "&uarr;": "↑",
            "&darr;": "↓",
            "&harr;": "↔",
            "&crarr;": "↵",
            "&nbsp;": " ",
          };
          return replacements[tag] || tag;
        },
      );
    };
    const text = unescape(node.content);
    const mustache_regex = /\{\{([^}]+)\}\}/g;
    if (!mustache_regex.test(text)) {
      return text.trim() ? { type: NODE_TYPES.TEXT, value: text } : null;
    }
    const tokens = [];
    let last_index = 0;
    let match;
    mustache_regex.lastIndex = 0;
    while ((match = mustache_regex.exec(text))) {
      if (match.index > last_index) {
        const text_content = text.substring(last_index, match.index);
        if (text_content.trim()) {
          tokens.push({ type: NODE_TYPES.TEXT, value: text_content });
        }
      }
      tokens.push({
        type: NODE_TYPES.INTERPOLATION,
        expression: this._parse_expr(match[1].trim()),
      });
      last_index = match.index + match[0].length;
    }
    if (last_index < text.length) {
      const text_content = text.substring(last_index);
      if (text_content.trim()) {
        tokens.push({ type: NODE_TYPES.TEXT, value: text_content });
      }
    }
    if (tokens.length === 0) return null;
    return tokens.length === 1
      ? tokens[0]
      : { type: NODE_TYPES.FRAGMENT, children: tokens };
  }

  _transform_children(children) {
    const transformed = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === "element") {
        const if_attr = child.attributes.find((a) => a.name === DIR_IF);
        if (if_attr) {
          const branches = [];
          child.attributes = child.attributes.filter((a) => a.name !== DIR_IF);
          branches.push({
            condition: this._parse_expr(if_attr.value),
            node: this._transform_node(child),
          });
          let j = i + 1;
          while (j < children.length) {
            const next = children[j];
            const is_text_node = next.type === "text" && !next.content.trim();
            if (next.type === "element") {
              const else_if_attr = next.attributes.find(
                (a) => a.name === DIR_ELSE_IF,
              );
              const else_attr = next.attributes.find(
                (a) => a.name === DIR_ELSE,
              );
              if (else_if_attr) {
                next.attributes = next.attributes.filter(
                  (a) => a.name !== DIR_ELSE_IF,
                );
                branches.push({
                  condition: this._parse_expr(else_if_attr.value),
                  node: this._transform_node(next),
                });
                i++;
              } else if (else_attr) {
                next.attributes = next.attributes.filter(
                  (a) => a.name !== DIR_ELSE,
                );
                branches.push({
                  condition: null,
                  node: this._transform_node(next),
                });
                i++;
                break;
              } else {
                break;
              }
            } else if (!is_text_node) {
              break;
            }
            j++;
          }
          transformed.push({ type: NODE_TYPES.IF, branches });
          continue;
        }
      }
      const transformed_node = this._transform_node(child);
      if (transformed_node) {
        transformed.push(transformed_node);
      }
    }
    return transformed;
  }

  _transform_element(el) {
    const for_attr = el.attributes.find((a) => a.name === DIR_FOR);
    if (for_attr) {
      const match = String(for_attr.value).match(
        /^\s*(?:(\w+)|(?:\((\w+)\s*,\s*(\w+)\)))\s+in\s+(.+)$/,
      );
      if (!match) {
        console.warn(`Invalid w-for expression: ${for_attr.value}`);
        return this._transform_native_element(el);
      }
      el.attributes = el.attributes.filter((a) => a.name !== DIR_FOR);
      return {
        type: NODE_TYPES.FOR,
        source: this._parse_expr(match[4]),
        value: match[1] || match[2],
        key: match[3],
        children: [this._transform_node(el)],
      };
    }
    return this._transform_native_element(el);
  }

  _transform_native_element(el) {
    const registered_comp_name = [...this.component_tags].find(
      (c) => c.toLowerCase() === el.tagName.toLowerCase(),
    );
    const is_component = !!registered_comp_name;
    const node = {
      type: is_component ? NODE_TYPES.COMPONENT : NODE_TYPES.ELEMENT,
      tag_name: is_component ? registered_comp_name : el.tagName,
      properties: this._process_attributes(el.attributes),
      children: this._transform_children(el.children),
    };
    return node;
  }

  _process_attributes(attrs) {
    const properties = [];
    for (const attr of attrs) {
      const name = attr.name;
      if (name.startsWith("@")) {
        const [eventName, ...modifiers] = name.slice(1).split(".");
        const pascal_event_name =
          eventName.charAt(0).toUpperCase() + eventName.slice(1);
        properties.push({
          type: ATTR_TYPES.EVENT_HANDLER,
          name: `on${pascal_event_name}`,
          expression: this._parse_expr(attr.value),
          modifiers: new Set(modifiers),
        });
      } else if (name.startsWith(":")) {
        properties.push({
          type: ATTR_TYPES.DIRECTIVE,
          name: camelize(name.substring(1)),
          expression: this._parse_expr(attr.value),
        });
      } else if (name === DIR_MODEL) {
        const model_expr = this._parse_expr(attr.value);
        properties.push({
          type: ATTR_TYPES.DIRECTIVE,
          name: "value",
          expression: model_expr,
        });
        properties.push({
          type: ATTR_TYPES.EVENT_HANDLER,
          name: "oninput",
          expression: this._parse_expr(`${attr.value} = $event.target.value`),
        });
      } else if (!name.startsWith("w-")) {
        properties.push({ type: ATTR_TYPES.STATIC, name, value: attr.value });
      }
    }
    return properties;
  }
}

/**
 * Compiles a component definition object into a render function.
 * This is the main entry point for the compiler.
 * @param {object} component_def - The component definition object, which must include a `template` string.
 * @returns {Function} A render function.
 */
export function compile(component_def) {
  if (!component_def.template) {
    console.warn("Component is missing a template option.");
    return () => h(Comment, null, "Component missing template");
  }
  const compiler = new Compiler(component_def);
  return compiler.compile();
}

// --- CSS Parser ---

const css_is_whitespace = (char) => /\s/.test(char);
const css_is_ident_start = (char) => /[a-zA-Z]/.test(char);
const css_is_ident_part = (char) => /[a-zA-Z0-9-_]/.test(char);

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
        .map((t) => t.value)
        .join("")
        .replace(/# /g, "#")
        .trim();
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

// --- HTML Parser ---

const html_is_whitespace = (c) =>
  c === " " || c === "\n" || c === "\t" || c === "\r";

const html_ast_cache = new Map();

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
function build_tree(tokens) {
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

// --- JavaScript Expression Parser ---

const js_is_whitespace = (c) =>
  c === " " || c === "\n" || c === "\t" || c === "\r";

const is_digit = (c) => c >= "0" && c <= "9";

const is_ident_start = (c) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "$" || c === "_";

const is_ident_part = (c) => is_ident_start(c) || is_digit(c);

const js_token_cache = new Map();

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
