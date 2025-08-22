import { basename } from "path";

export function renderHtmlShell({ appHtml, websState, manifest, title }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${manifest.css
      ? `<link rel="stylesheet" href="/${basename(manifest.css)}">`
      : ""
    }
</head>
<body>
    <div id="root" style="display: contents">${appHtml}</div>
    <script>window.__WEBS_STATE__ = ${serializeState(websState)};</script>
    <script type="module" src="/${basename(manifest.js)}"></script>
</body>
</html>`;
}

export function serializeState(state) {
  return JSON.stringify(state, (_, value) => {
    if (value instanceof Set) return { __type: "Set", values: [...value] };
    if (value instanceof Map)
      return { __type: "Map", entries: [...value.entries()] };
    return value;
  });
}
