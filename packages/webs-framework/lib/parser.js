import { voidElements } from './shared';

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
        /([:@]?[a-zA-Z0-9:.-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
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
