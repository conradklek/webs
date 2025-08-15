/**
 * Parses a Pug-like template string from a tagged template literal and converts it to HTML.
 * This parser handles basic nesting via indentation, attributes, IDs, classes, and text content.
 *
 * @param {Array<string>} strings - The string parts of the template literal.
 * @param  {...any} values - Interpolated values (not used in this basic version).
 * @returns {string} The resulting HTML string.
 */
export function pug(strings, ...values) {
  // --- Start of Fix ---
  // Handle both tagged template literal calls (which have a .raw property)
  // and direct string calls from tests (which are just a plain array).
  const pugStr = (strings.raw ? strings.raw[0] : strings[0]).trim();
  // --- End of Fix ---

  const lines = pugStr.split("\n");

  let html = "";
  const tagStack = [];
  let currentIndent = -1;

  /**
   * Parses a single line of Pug to extract its components.
   * @param {string} line - The line to parse.
   * @returns {object|null} An object containing the line's properties, or null for empty lines.
   */
  const parseLine = (line) => {
    const indentationMatch = line.match(/^\s*/);
    const indent = indentationMatch ? indentationMatch[0].length : 0;
    let trimmedLine = line.trim();

    if (!trimmedLine) {
      return null;
    }

    if (trimmedLine.startsWith("|")) {
      return { indent, text: trimmedLine.substring(1).trim(), isPiped: true };
    }

    const attrs = {};
    const attrsMatch = trimmedLine.match(/\(([^)]+)\)/);
    if (attrsMatch) {
      const attrString = attrsMatch[1];
      const attrRegex = /([a-zA-Z-]+)=["']([^"']+)["']/g;
      let match;
      while ((match = attrRegex.exec(attrString)) !== null) {
        attrs[match[1]] = match[2];
      }
      // Remove the attribute part from the line to not confuse it with text
      trimmedLine = trimmedLine.replace(attrsMatch[0], "").trim();
    }

    const [tagDef, ...textParts] = trimmedLine.split(" ");
    const text = textParts.join(" ");

    const tagMatch = tagDef.match(/^[a-zA-Z0-9-]+/);
    const tag = tagMatch ? tagMatch[0] : "div";

    const idMatch = tagDef.match(/#([a-zA-Z0-9-]+)/);
    const id = idMatch ? idMatch[1] : null;

    const classMatches = tagDef.match(/\.([a-zA-Z0-9-]+)/g) || [];
    const classes = classMatches.map((c) => c.substring(1)).join(" ");

    return { indent, tag, id, classes, attrs, text };
  };

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    if (parsed.isPiped) {
      // Correctly append piped text without an extra leading space if not needed.
      html += (html.endsWith(">") ? "" : " ") + parsed.text;
      continue;
    }

    while (
      tagStack.length > 0 &&
      parsed.indent <= tagStack[tagStack.length - 1].indent
    ) {
      html += tagStack.pop().tag;
    }

    let attrsString = "";
    if (parsed.id) attrsString += ` id="${parsed.id}"`;
    if (parsed.classes) attrsString += ` class="${parsed.classes}"`;
    for (const [key, value] of Object.entries(parsed.attrs)) {
      attrsString += ` ${key}="${value}"`;
    }

    html += `<${parsed.tag}${attrsString.trim() ? " " + attrsString.trim() : ""}>`;

    if (parsed.text) {
      html += parsed.text;
    }

    tagStack.push({ indent: parsed.indent, tag: `</${parsed.tag}>` });
  }

  while (tagStack.length > 0) {
    html += tagStack.pop().tag;
  }

  return html;
}

