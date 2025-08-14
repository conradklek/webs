/**
 * Parses a Markdown string and converts it to HTML.
 *
 * @param {string} md_str The Markdown string to parse.
 * @returns {string} The resulting HTML string.
 */
export function parse_markdown(md_str) {
  const ctx = {
    footnotes: {},
    footnote_order: [],
  };

  const _parse_inline = (txt, ctx) => {
    const code_blocks = [];
    let proc_txt = txt.replace(/`(.*?)`/g, (_, code_content) => {
      const placeholder = `%%CODE_PLACEHOLDER_${code_blocks.length}%%`;
      code_blocks.push(code_content);
      return placeholder;
    });

    proc_txt = proc_txt.replace(/\[\^(.*?)\]/g, (_, ref) => {
      if (ctx.footnotes[ref]) {
        if (!ctx.footnote_order.includes(ref)) {
          ctx.footnote_order.push(ref);
        }
        const idx = ctx.footnote_order.indexOf(ref) + 1;
        return `<sup><a href="#fn-${ref}" id="fnref-${ref}">${idx}</a></sup>`;
      }
      return `[\\^${ref}]`;
    });

    const inline_rules = [
      {
        regex: /!\[(.*?)\]\((.*?)\)/g,
        replacer: (alt, src) => `<img src="${src}" alt="${alt}">`,
      },
      {
        regex: /\[(.*?)\]\((.*?)\)/g,
        replacer: (text, href) => `<a href="${href}">${text}</a>`,
      },
      {
        regex: /\*{3}(.*?)\*{3}|_{3}(.*?)_{3}/g,
        replacer: (m1, m2) => `<strong><em>${m1 || m2}</em></strong>`,
      },
      {
        regex: /\*{2}(.*?)\*{2}|_{2}(.*?)_{2}/g,
        replacer: (m1, m2) => `<strong>${m1 || m2}</strong>`,
      },
      {
        regex:
          /(?<![a-zA-Z0-9])\*(.*?)\*(?![a-zA-Z0-9])|(?<![a-zA-Z0-9])_(.*?)_(?![a-zA-Z0-9])/g,
        replacer: (m1, m2) => `<em>${m1 || m2}</em>`,
      },
      { regex: /~~(.*?)~~/g, replacer: (text) => `<del>${text}</del>` },
    ];

    for (const rule of inline_rules) {
      proc_txt = proc_txt.replace(rule.regex, (_, ...args) =>
        rule.replacer(...args.slice(0, rule.replacer.length)),
      );
    }

    proc_txt = proc_txt.replace(/%%CODE_PLACEHOLDER_(\d+)%%/g, (_, idx) => {
      return `<code>${code_blocks[parseInt(idx, 10)]}</code>`;
    });

    return proc_txt;
  };

  const _parse_fenced_code = (lns) => {
    if (!lns[0].startsWith("```")) return null;
    const lang = lns[0].substring(3).trim();
    const code_lns = [];
    let i = 1;
    while (i < lns.length && !lns[i].startsWith("```")) {
      code_lns.push(lns[i]);
      i++;
    }
    const code = code_lns
      .join("\n")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const lang_class = lang ? ` class="language-${lang}"` : "";
    return {
      html: `<pre><code${lang_class}>${code}</code></pre>`,
      consumed: i + 1,
    };
  };

  const _parse_heading = (lns, ctx) => {
    const match = lns[0].match(/^(#{1,6})\s+(.*)/);
    if (!match) return null;
    const level = match[1].length;
    const content = _parse_inline(match[2].trim(), ctx);
    return { html: `<h${level}>${content}</h${level}>`, consumed: 1 };
  };

  const _parse_table = (lns, ctx) => {
    if (
      lns.length < 2 ||
      !lns[0].includes("|") ||
      !/^\s*\|?.*:?-+.*\|?\s*$/.test(lns[1])
    )
      return null;
    const headers = lns[0]
      .split("|")
      .map((h) => h.trim())
      .filter(Boolean);
    const aligns = lns[1]
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        if (s.startsWith(":") && s.endsWith(":")) return "center";
        if (s.startsWith(":")) return "left";
        if (s.endsWith(":")) return "right";
        return "";
      });

    let html = "<table><thead><tr>";
    headers.forEach((header, i) => {
      const align = aligns[i] ? ` style="text-align:${aligns[i]}"` : "";
      html += `<th${align}>${_parse_inline(header, ctx)}</th>`;
    });
    html += "</tr></thead><tbody>";

    let row_count = 0;
    for (let i = 2; i < lns.length; i++) {
      if (!lns[i].includes("|")) break;
      const cells = lns[i]
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length !== headers.length) continue;
      html += "<tr>";
      cells.forEach((cell, j) => {
        const align = aligns[j] ? ` style="text-align:${aligns[j]}"` : "";
        html += `<td${align}>${_parse_inline(cell, ctx)}</td>`;
      });
      html += "</tr>";
      row_count++;
    }
    html += "</tbody></table>";
    return { html, consumed: 2 + row_count };
  };

  const _parse_blockquote = (lns, ctx) => {
    if (!lns[0].startsWith(">")) return null;
    const quote_lns = [];
    let i = 0;
    while (i < lns.length && lns[i].startsWith(">")) {
      quote_lns.push(lns[i].substring(1).trim());
      i++;
    }
    const content = _parse_blocks(quote_lns, ctx);
    return { html: `<blockquote>${content}</blockquote>`, consumed: i };
  };

  const _parse_list = (lns, ctx) => {
    const first_ln = lns[0].trim();
    const ul_match = first_ln.match(/^([*+-])\s+(.*)/);
    const ol_match = first_ln.match(/^(\d+)\.\s+(.*)/);
    if (!ul_match && !ol_match) return null;

    const is_ol = !!ol_match;
    const tag = is_ol ? "ol" : "ul";
    const start = is_ol ? ` start="${parseInt(ol_match[1], 10)}"` : "";
    let items = [];
    let i = 0;
    while (i < lns.length) {
      const ln = lns[i];
      const item_match = ln.match(/^(?:\s*([*+-]|\d+\.)\s+)(.*)/);
      if (!item_match) break;
      const content_lns = [item_match[2]];
      let j = i + 1;
      const indent = ln.match(/^\s*/)[0].length;
      while (j < lns.length && lns[j].match(/^\s*/)[0].length > indent) {
        content_lns.push(lns[j].substring(indent + 2));
        j++;
      }
      const task_match = content_lns[0].match(/^\[([x ])\]\s+(.*)/);
      let li_content;
      if (task_match) {
        const checkbox = `<input type="checkbox" ${
          task_match[1] === "x" ? "checked" : ""
        } disabled> `;
        const text_to_parse = content_lns
          .join("\n")
          .substring(content_lns[0].indexOf(task_match[2]));
        li_content =
          checkbox +
          _parse_blocks(text_to_parse.split("\n"), ctx).replace(
            /^<p>|<\/p>$/g,
            "",
          );
      } else {
        li_content = _parse_inline(content_lns[0], ctx);
        if (content_lns.length > 1) {
          li_content += "\n" + _parse_blocks(content_lns.slice(1), ctx);
        }
      }
      items.push(`<li>${li_content}</li>`);
      i = j;
    }
    return {
      html: `<${tag}${start}>${items.join("\n")}</${tag}>`,
      consumed: i,
    };
  };

  const _parse_hr = (lns) => {
    return /^(---|___|\*\*\*)\s*$/.test(lns[0])
      ? { html: "<hr>", consumed: 1 }
      : null;
  };

  const _parse_footnote_def = (lns, ctx) => {
    const match = lns[0].match(/^\[\^(.*?)\]:\s?(.*)/);
    if (!match) return null;
    const ref = match[1];
    const content_lns = [match[2]];
    let i = 1;
    while (i < lns.length && /^\s+/.test(lns[i])) {
      content_lns.push(lns[i].trim());
      i++;
    }
    ctx.footnotes[ref] = content_lns.join("\n");
    return { html: "", consumed: i };
  };

  const _parse_paragraph = (lns, ctx) => {
    const para_lns = [];
    let i = 0;
    while (i < lns.length && lns[i].trim() !== "") {
      if (/^(#|>|---|```|`)/.test(lns[i].trim())) break;
      if (/^(\*|\+|-|\d+\.)\s/.test(lns[i].trim())) break;
      if (
        lns[i].includes("|") &&
        i + 1 < lns.length &&
        lns[i + 1].includes("---")
      )
        break;
      if (/^\[\^(.*?)\]:/.test(lns[i].trim())) break;
      para_lns.push(lns[i].trim());
      i++;
    }
    if (para_lns.length === 0) return null;
    const content = _parse_inline(para_lns.join(" "), ctx);
    return { html: `<p>${content}</p>`, consumed: i };
  };

  const block_parsers = [
    _parse_fenced_code,
    _parse_heading,
    _parse_table,
    _parse_blockquote,
    _parse_list,
    _parse_hr,
    _parse_paragraph,
  ];

  const _parse_blocks = (lns, ctx) => {
    const html_blocks = [];
    for (let i = 0; i < lns.length; ) {
      if (lns[i].trim() === "") {
        i++;
        continue;
      }
      let block_parsed = false;
      for (const parser of block_parsers) {
        const result = parser(lns.slice(i), ctx);
        if (result) {
          if (result.html) html_blocks.push(result.html);
          i += result.consumed;
          block_parsed = true;
          break;
        }
      }
      if (!block_parsed) i++;
    }
    return html_blocks.join("\n");
  };

  let lines = md_str.replace(/\r\n?/g, "\n").split("\n");
  const remaining_lines = [];
  for (let i = 0; i < lines.length; ) {
    const result = _parse_footnote_def(lines.slice(i), ctx);
    if (result) {
      i += result.consumed;
    } else {
      remaining_lines.push(lines[i]);
      i++;
    }
  }

  let final_html = _parse_blocks(remaining_lines, ctx);

  if (ctx.footnote_order.length > 0) {
    let footnote_html = '\n<hr>\n<ol class="footnotes-list">\n';
    ctx.footnote_order.forEach((ref) => {
      const content = ctx.footnotes[ref];
      const back_ref = ` <a href="#fnref-${ref}" class="footnote-backref">&#8617;</a>`;
      const parsed_content = _parse_blocks(content.split("\n"), ctx).replace(
        /<\/?p>/g,
        "",
      );
      footnote_html += `<li id="fn-${ref}">${parsed_content}${back_ref}</li>\n`;
    });
    footnote_html += "</ol>";
    final_html += footnote_html;
  }

  return final_html;
}
