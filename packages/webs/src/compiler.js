import { parse_html, parse_js, tokenize_js } from "./parser";
import { Text, Fragment, Comment, camelize } from "./utils";
import * as Webs from "./renderer";

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
export function generate_render_fn(ast) {
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
          return `(${this.gen_expr(expr.left)}${expr.operator}${this.gen_expr(
            expr.right,
          )})`;
        case "UnaryExpression":
          return `${expr.operator}${this.gen_expr(expr.argument)}`;
        case "MemberExpression":
          return `${this.gen_expr(expr.object)}?.${expr.property.name}`;
        case "ComputedMemberExpression":
          return `${this.gen_expr(expr.object)}[${this.gen_expr(
            expr.property,
          )}]`;
        case "CallExpression":
          return `${this.gen_expr(expr.callee)}(${expr.arguments
            .map((a) => this.gen_expr(a))
            .join(",")})`;
        case "ConditionalExpression":
          return `(${this.gen_expr(expr.test)}?${this.gen_expr(
            expr.consequent,
          )}:${this.gen_expr(expr.alternate)})`;
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
            handler_body = `${expr_code}($event)`;
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
      const child_nodes = children
        .map((c) => this.gen_node(c))
        .filter((c) => c && c !== "null");
      return `[${child_nodes.join(",")}]`;
    },
    gen_node(node) {
      if (!node) return "null";
      switch (node.type) {
        case NODE_TYPES.ROOT: {
          if (node.children.length === 1) {
            return this.gen_node(node.children[0]);
          }
          return `_h(_Fragment, null, ${this.gen_children(node.children)})`;
        }
        case NODE_TYPES.FRAGMENT:
          return `_h(_Fragment, null, ${this.gen_children(node.children)})`;
        case NODE_TYPES.COMPONENT: {
          const slots = `{ default: () => ${this.gen_children(
            node.children,
          )} }`;
          return `_h(_ctx.${node.tag_name}, ${this.gen_props(
            node.properties,
          )}, ${slots})`;
        }
        case NODE_TYPES.ELEMENT:
          return `_h('${node.tag_name}', ${this.gen_props(
            node.properties,
          )}, ${this.gen_children(node.children)})`;
        case NODE_TYPES.TEXT:
          return `_h(_Text, null, ${JSON.stringify(node.value)})`;
        case NODE_TYPES.INTERPOLATION:
          return `_h(_Text, { 'w-dynamic': true }, String(${this.gen_expr(node.expression)}))`;
        case NODE_TYPES.COMMENT:
          return `_h(_Comment, null, ${JSON.stringify(node.value)})`;
        case NODE_TYPES.SLOT: {
          return `_h(_Fragment, null, _ctx.$slots.default ? _ctx.$slots.default() : ${this.gen_children(
            node.children,
          )})`;
        }
        case NODE_TYPES.IF: {
          const gen_branch = (branch) => {
            if (branch.condition) {
              return `(${this.gen_expr(
                branch.condition,
              )}) ? ${this.gen_node(branch.node)} : `;
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
          return `_h(_Fragment, null, (${this.gen_expr(
            source,
          )} || []).map(${params} => (${child_code})))`;
        }
      }
      return "null";
    },
  };

  const generated_code = ctx.gen_node(ast);
  const function_body = `
const { h: _h } = Webs;
const _Text = Webs.Text;
const _Fragment = Webs.Fragment;
const _Comment = Webs.Comment;
return ${generated_code || "null"};
`;
  try {
    const fn = new Function("Webs", "_ctx", function_body).bind(null, {
      ...Webs,
      Text,
      Fragment,
      Comment,
    });
    fn.toString = () => function_body;
    return fn;
  } catch (e) {
    console.error("Error compiling render function:", e);
    console.log("Generated code:\n", function_body);
    return () => Webs.h(Webs.Comment, null, "Render function compile error");
  }
}

/**
 * The main Compiler class that orchestrates the template compilation process.
 */
export class Compiler {
  constructor(component_def, options = null) {
    this.definition = component_def;
    this.components = component_def.components || {};
    this.component_tags = new Set(Object.keys(this.components));
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
      return parse_js(tokenize_js(clean_str));
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
    if (!text.includes("{{")) {
      return text.trim() ? { type: NODE_TYPES.TEXT, value: text } : null;
    }

    const mustache_regex = /\{\{([^}]+)\}\}/g;
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

          const if_node_clone = {
            ...child,
            attributes: child.attributes.filter((a) => a.name !== DIR_IF),
          };
          branches.push({
            condition: this._parse_expr(if_attr.value),
            node: this._transform_node(if_node_clone),
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
                const else_if_node_clone = {
                  ...next,
                  attributes: next.attributes.filter(
                    (a) => a.name !== DIR_ELSE_IF,
                  ),
                };
                branches.push({
                  condition: this._parse_expr(else_if_attr.value),
                  node: this._transform_node(else_if_node_clone),
                });
                i++;
              } else if (else_attr) {
                const else_node_clone = {
                  ...next,
                  attributes: next.attributes.filter(
                    (a) => a.name !== DIR_ELSE,
                  ),
                };
                branches.push({
                  condition: null,
                  node: this._transform_node(else_node_clone),
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

      const for_node_child = {
        ...el,
        attributes: el.attributes.filter((a) => a.name !== DIR_FOR),
      };

      return {
        type: NODE_TYPES.FOR,
        source: this._parse_expr(match[4]),
        value: match[1] || match[2],
        key: match[3],
        children: [this._transform_node(for_node_child)],
      };
    }
    return this._transform_native_element(el);
  }

  _transform_native_element(el) {
    if (el.tagName === "slot") {
      return {
        type: NODE_TYPES.SLOT,
        children: this._transform_children(el.children),
      };
    }

    const registered_comp_key = [...this.component_tags].find(
      (key) => key.toLowerCase() === el.tagName.toLowerCase(),
    );
    const is_component = !!registered_comp_key;

    const node = {
      type: is_component ? NODE_TYPES.COMPONENT : NODE_TYPES.ELEMENT,
      tag_name: is_component ? registered_comp_key : el.tagName,
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
  let template_string = component_def.template;

  if (!template_string && typeof template_string !== "string") {
    console.warn("Component is missing a valid template option.");
    return () => Webs.h(Webs.Comment, null, "Component missing template");
  }

  const final_component_def = { ...component_def, template: template_string };
  const compiler = new Compiler(final_component_def);
  return compiler.compile();
}
