/**
 * @file Type definitions for the template parser.
 */

/**
 * @typedef {object} HtmlToken
 * @property {string} type - The type of the token.
 */

/** @typedef {HtmlToken & { content: string }} TextToken */
/** @typedef {HtmlToken & { content: string }} CommentToken */
/** @typedef {HtmlToken & { expression: string }} IfStartToken */
/** @typedef {HtmlToken & { expression: string, item: string, key: string | null }} EachStartToken */
/** @typedef {HtmlToken & { expression: string }} ElseIfToken */
/** @typedef {HtmlToken} ElseToken */
/** @typedef {HtmlToken} IfEndToken */
/** @typedef {HtmlToken} EachEndToken */
/** @typedef {HtmlToken & { tagName: string, attributes: AttributeToken[], selfClosing: boolean }} TagStartToken */
/** @typedef {HtmlToken & { tagName: string }} TagEndToken */
/** @typedef {{ name: string, value: string | true }} AttributeToken */

/** @typedef {TextToken | CommentToken | IfStartToken | EachStartToken | ElseIfToken | ElseToken | IfEndToken | EachEndToken | TagStartToken | TagEndToken} AnyHtmlToken */

/**
 * @typedef {object} HtmlAstNode
 * @property {string} type - The type of the AST node.
 * @property {HtmlAstNode[]} [children] - Child nodes.
 */

/** @typedef {HtmlAstNode & { children: HtmlAstNode[] }} RootNode */
/** @typedef {HtmlAstNode & { test: string, children: HtmlAstNode[] }} IfBlockNode */
/** @typedef {HtmlAstNode & { test: string, children: HtmlAstNode[] }} ElseIfBlockNode */
/** @typedef {HtmlAstNode & { children: HtmlAstNode[] }} ElseBlockNode */
/** @typedef {HtmlAstNode & { expression: string, item: string, key: string | null, children: HtmlAstNode[] }} EachBlockNode */
/** @typedef {HtmlAstNode & { tagName: string, attributes: AttributeToken[], children: HtmlAstNode[] }} ElementNode */
/** @typedef {HtmlAstNode & { content: string }} TextNode */
/** @typedef {HtmlAstNode & { content: string }} CommentNode */

/**
 * @file A high-performance, caching HTML parser designed specifically for the framework's custom template syntax, including directives and bindings.
 */

import { voidElements } from '../shared/utils.js';

/** @type {Map<string, RootNode>} */
const htmlAstCache = new Map();

const directiveRegex =
  /{#if\s+(.+?)}|{#each\s+(.+?)\s+as\s+(.+?)(?:\s*\((.+?)\))?}|{:else if\s+(.+?)}|{:else}|{\/if}|{\/each}/g;

/**
 * @internal
 * Tokenizes an HTML string, separating template directives from HTML content.
 * @param {string} html - The HTML string to tokenize.
 * @returns {AnyHtmlToken[]} An array of tokens.
 */
function tokenizeHtml(html) {
  /** @type {AnyHtmlToken[]} */
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

  /** @type {AnyHtmlToken[]} */
  const finalTokens = [];
  for (const token of tokens) {
    if (token.type === 'text') {
      finalTokens.push(
        ...tokenizeHtmlContent(/** @type {TextToken} */ (token).content),
      );
    } else {
      finalTokens.push(token);
    }
  }

  return finalTokens;
}

/**
 * @internal
 * Tokenizes the content part of an HTML string (tags, text, comments).
 * @param {string} html - The HTML content string.
 * @returns {Array<TextToken | CommentToken | TagStartToken | TagEndToken>} An array of content tokens.
 */
function tokenizeHtmlContent(html) {
  /** @type {Array<TextToken | CommentToken | TagStartToken | TagEndToken>} */
  const tokens = [];
  const tagRegex = /<\/?([a-zA-Z0-9:-]+)\s*([^>]*)>|<!--([\s\S]*?)-->/g;
  let lastIndex = 0;

  html.replace(tagRegex, (match, tagName, attrs, comment, offset) => {
    if (offset > lastIndex) {
      const textContent = html.substring(lastIndex, offset);
      if (textContent) {
        tokens.push({
          type: 'text',
          content: textContent,
        });
      }
    }

    if (comment !== undefined) {
      tokens.push({ type: 'comment', content: comment || '' });
    } else if (match.startsWith('</')) {
      tokens.push({ type: 'tagEnd', tagName });
    } else {
      /** @type {AttributeToken[]} */
      const attributes = [];
      const attrRegex =
        /([:@#]?[a-zA-Z0-9:.-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrs))) {
        const name = attrMatch[1];
        if (name) {
          attributes.push({
            name: name,
            value: attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? true,
          });
        }
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
    const textContent = html.substring(lastIndex);
    if (textContent) {
      tokens.push({ type: 'text', content: textContent });
    }
  }
  return tokens;
}

/**
 * @internal
 * Builds an Abstract Syntax Tree (AST) from an array of tokens.
 * @param {AnyHtmlToken[]} tokens - The flat array of tokens.
 * @returns {RootNode} The root of the AST.
 */
function buildTree(tokens) {
  /** @type {RootNode} */
  const root = { type: 'root', children: [] };
  /** @type {(RootNode | ElementNode | IfBlockNode | ElseIfBlockNode | ElseBlockNode | EachBlockNode)[]} */
  const stack = [root];

  for (const token of tokens) {
    let parent = stack[stack.length - 1];
    if (!parent) continue;

    switch (token.type) {
      case 'ifStart': {
        const node = /** @type {IfBlockNode} */ ({
          type: 'ifBlock',
          test: /** @type {IfStartToken} */ (token).expression,
          children: [],
        });
        parent.children?.push(node);
        stack.push(node);
        break;
      }
      case 'elseIf': {
        stack.pop();
        parent = stack[stack.length - 1];
        if (!parent) continue;
        const node = /** @type {ElseIfBlockNode} */ ({
          type: 'elseIfBlock',
          test: /** @type {ElseIfToken} */ (token).expression,
          children: [],
        });
        parent.children?.push(node);
        stack.push(node);
        break;
      }
      case 'else': {
        stack.pop();
        parent = stack[stack.length - 1];
        if (!parent) continue;
        const node = /** @type {ElseBlockNode} */ ({
          type: 'elseBlock',
          children: [],
        });
        parent.children?.push(node);
        stack.push(node);
        break;
      }
      case 'eachStart': {
        const eachToken = /** @type {EachStartToken} */ (token);
        const node = /** @type {EachBlockNode} */ ({
          type: 'eachBlock',
          expression: eachToken.expression,
          item: eachToken.item,
          key: eachToken.key,
          children: [],
        });
        parent.children?.push(node);
        stack.push(node);
        break;
      }
      case 'ifEnd':
      case 'eachEnd': {
        stack.pop();
        break;
      }
      case 'tagStart': {
        const tagToken = /** @type {TagStartToken} */ (token);
        const node = /** @type {ElementNode} */ ({
          type: 'element',
          tagName: tagToken.tagName.toLowerCase(),
          attributes: tagToken.attributes,
          children: [],
        });
        parent.children?.push(node);
        if (!tagToken.selfClosing && !voidElements.has(node.tagName)) {
          stack.push(node);
        }
        break;
      }
      case 'tagEnd': {
        if (
          stack.length > 1 &&
          /** @type {ElementNode} */ (parent).tagName ===
            /** @type {TagEndToken} */ (token).tagName.toLowerCase()
        ) {
          stack.pop();
        }
        break;
      }
      case 'text': {
        const content = /** @type {TextToken} */ (token).content;
        if (content.trim().length > 0) {
          parent.children?.push(
            /** @type {TextNode} */ ({ type: 'text', content: content }),
          );
        }
        break;
      }
      case 'comment': {
        parent.children?.push(
          /** @type {CommentNode} */ ({
            type: 'comment',
            content: /** @type {CommentToken} */ (token).content,
          }),
        );
        break;
      }
    }
  }
  return root;
}

/**
 * Parses an HTML string into an Abstract Syntax Tree (AST).
 * This function handles standard HTML, comments, and custom templating directives
 * like `{#if}` and `{#each}`. The result is cached.
 * @param {string} html - The HTML template string to parse.
 * @returns {RootNode} The root node of the generated AST.
 */
export function parseHtml(html) {
  const cached = htmlAstCache.get(html);
  if (cached) {
    return cached;
  }
  const tokens = tokenizeHtml(html);
  const ast = buildTree(tokens);
  htmlAstCache.set(html, ast);
  return ast;
}
