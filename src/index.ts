import { Database } from "bun:sqlite";

// Session store: token -> username
const sessions = new Map<string, string>();

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get("Cookie") || "";
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) result[k] = v.join("=");
  }
  return result;
}

function getSessionUser(req: Request): string | null {
  const token = parseCookies(req)["session"];
  if (!token || !sessions.has(token)) return null;
  return sessions.get(token)!;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function homeHtml(loggedIn = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>strings</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      margin: 0;
      padding: 2rem;
      min-height: 100vh;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 0.5rem; }
    .subtitle { color: #8b949e; margin-bottom: 2rem; }
    pre {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
    }
    code { color: #79c0ff; }
    .endpoint { color: #7ee787; }
    .comment { color: #8b949e; }
    a { color: #58a6ff; }
    .actions { display: flex; gap: 0.75rem; margin-bottom: 2rem; align-items: center; }
    .btn {
      display: inline-block;
      background: #238636;
      color: #fff;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      text-decoration: none;
    }
    .btn:hover { background: #2ea043; }
    .btn-secondary {
      display: inline-block;
      background: #21262d;
      color: #c9d1d9;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      text-decoration: none;
      border: 1px solid #30363d;
    }
    .btn-secondary:hover { background: #30363d; }
  </style>
</head>
<body>
  <div class="container">
    <h1>strings</h1>
    <p class="subtitle">minimal pastebin</p>

    <div class="actions">
      <a href="/new" class="btn">+ New Paste</a>
      ${loggedIn
        ? `<a href="/admin" class="btn-secondary">All Pastes</a><a href="/logout" class="btn-secondary">Sign out</a>`
        : `<a href="/login" class="btn-secondary">Sign in</a>`
      }
    </div>

    <h2>API</h2>
    <pre><code><span class="comment"># Create a paste (basic auth required)</span>
curl -u user:pass -X POST <span class="endpoint">https://strings.witcc.dev/api/paste</span> \\
  -H "Content-Type: text/plain" \\
  -H "X-Filename: example.py" \\
  -d 'print("hello world")'

<span class="comment"># With custom slug</span>
curl -u user:pass -X POST <span class="endpoint">https://strings.witcc.dev/api/paste</span> \\
  -H "Content-Type: application/json" \\
  -d '{"content": "print(1)", "filename": "test.py", "slug": "my-snippet"}'

<span class="comment"># Pipe a file</span>
cat myfile.rs | curl -u user:pass -X POST <span class="endpoint">https://strings.witcc.dev/api/paste</span> \\
  -H "X-Filename: myfile.rs" \\
  --data-binary @-</code></pre>
  </div>
</body>
</html>`;
}

function loginHtml(error?: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in - strings</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 2rem;
      width: 100%;
      max-width: 360px;
    }
    h1 { color: #58a6ff; margin: 0 0 0.25rem; font-size: 1.5rem; }
    .subtitle { color: #8b949e; margin: 0 0 1.5rem; font-size: 0.875rem; }
    .error {
      background: #3d1f1f;
      border: 1px solid #f85149;
      color: #f85149;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    form { display: flex; flex-direction: column; gap: 1rem; }
    label { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.875rem; color: #8b949e; }
    input {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 0.65rem 0.75rem;
      color: #c9d1d9;
      font-size: 1rem;
    }
    input:focus { outline: none; border-color: #58a6ff; }
    button {
      background: #238636;
      color: #fff;
      border: none;
      padding: 0.75rem;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
      margin-top: 0.25rem;
    }
    button:hover { background: #2ea043; }
    .back { text-align: center; margin-top: 1rem; font-size: 0.875rem; }
    .back a { color: #58a6ff; }
  </style>
</head>
<body>
  <div class="card">
    <h1>strings</h1>
    <p class="subtitle">Sign in to manage your pastes</p>
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    <form method="POST" action="/login">
      <label>
        Username
        <input type="text" name="username" autocomplete="username" autofocus required>
      </label>
      <label>
        Password
        <input type="password" name="password" autocomplete="current-password" required>
      </label>
      <button type="submit">Sign in</button>
    </form>
    <div class="back"><a href="/">← back</a></div>
  </div>
</body>
</html>`;
}

function adminHtml(pastes: Paste[]) {
  const rows = pastes.map((p) => {
    const name = p.filename ? escapeHtml(p.filename) : p.id;
    const lang = p.language ? escapeHtml(p.language) : "—";
    const date = new Date(p.created_at * 1000).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const preview = escapeHtml(p.content.slice(0, 80)).replace(/\n/g, " ");
    return `
    <tr>
      <td><a href="/${p.id}">${escapeHtml(p.id)}</a></td>
      <td>${name}</td>
      <td><span class="badge">${lang}</span></td>
      <td class="preview">${preview}${p.content.length > 80 ? "…" : ""}</td>
      <td>${date}</td>
      <td>
        <a href="/${p.id}/raw" class="action">raw</a>
        <button class="action danger" onclick="deletePaste('${escapeHtml(p.id)}', this)">delete</button>
      </td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All Pastes - strings</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
    }
    .header {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header a { color: #58a6ff; text-decoration: none; }
    .header-right { display: flex; gap: 1rem; align-items: center; }
    .header-right a { color: #8b949e; font-size: 0.875rem; }
    .header-right a:hover { color: #c9d1d9; }
    .btn {
      display: inline-block;
      background: #238636;
      color: #fff !important;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.875rem;
    }
    .btn:hover { background: #2ea043; }
    .main { padding: 2rem; }
    h2 { margin-bottom: 1rem; font-size: 1.25rem; }
    .count { color: #8b949e; font-size: 0.875rem; font-weight: normal; margin-left: 0.5rem; }
    .empty { color: #8b949e; text-align: center; padding: 3rem; }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #30363d;
    }
    td {
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid #21262d;
      font-size: 0.875rem;
      vertical-align: middle;
    }
    tr:hover td { background: #161b22; }
    td a { color: #58a6ff; text-decoration: none; }
    td a:hover { text-decoration: underline; }
    .badge {
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 4px;
      padding: 0.15rem 0.5rem;
      font-size: 0.75rem;
      font-family: monospace;
      color: #8b949e;
    }
    .preview { color: #8b949e; font-family: monospace; font-size: 0.8rem; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .action {
      background: none;
      border: 1px solid #30363d;
      color: #8b949e;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      text-decoration: none;
      margin-left: 0.25rem;
    }
    .action:hover { color: #c9d1d9; border-color: #8b949e; }
    .action.danger:hover { color: #f85149; border-color: #f85149; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <a href="/">strings</a>
      <span style="color:#8b949e"> / all pastes</span>
    </div>
    <div class="header-right">
      <a href="/new" class="btn">+ New Paste</a>
      <a href="/logout">Sign out</a>
    </div>
  </div>
  <div class="main">
    <h2>All Pastes <span class="count">${pastes.length} total</span></h2>
    ${pastes.length === 0
      ? `<p class="empty">No pastes yet. <a href="/new">Create one</a>.</p>`
      : `<table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Filename</th>
          <th>Language</th>
          <th>Preview</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
    }
  </div>
  <script>
    async function deletePaste(id, btn) {
      if (!confirm('Delete paste ' + id + '?')) return;
      const res = await fetch('/' + id, { method: 'DELETE' });
      if (res.ok) {
        btn.closest('tr').remove();
        const count = document.querySelector('.count');
        const n = parseInt(count.textContent) - 1;
        count.textContent = n + ' total';
      } else {
        alert('Delete failed');
      }
    }
  </script>
</body>
</html>`;
}

function errorPage(message: string) {
  const escaped = escapeHtml(message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - strings</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .error {
      text-align: center;
    }
    h1 { color: #f85149; margin-bottom: 1rem; }
    a { color: #58a6ff; }
  </style>
</head>
<body>
  <div class="error">
    <h1>${escaped}</h1>
    <a href="/">← back home</a>
  </div>
</body>
</html>`;
}

function renderPaste(paste: Paste) {
  const lang = paste.language || "plaintext";
  const filename = paste.filename ? escapeHtml(paste.filename) : paste.id;
  const title = `${filename} - strings`;
  const content = escapeHtml(paste.content);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
    }
    .header {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header a { color: #58a6ff; text-decoration: none; }
    .header a:hover { text-decoration: underline; }
    .filename { font-weight: 600; color: #c9d1d9; }
    .meta { color: #8b949e; font-size: 0.875rem; }
    .actions a {
      color: #8b949e;
      margin-left: 1rem;
      font-size: 0.875rem;
    }
    .code-wrapper {
      margin: 1rem;
      border: 1px solid #30363d;
      border-radius: 6px;
      overflow: hidden;
    }
    pre {
      margin: 0;
      padding: 1rem;
      overflow-x: auto;
      background: #0d1117 !important;
    }
    code {
      font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .hljs { background: #0d1117 !important; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <a href="/">strings</a>
      <span class="filename"> / ${filename}</span>
      <span class="meta"> · ${lang}</span>
    </div>
    <div class="actions">
      <a href="/${paste.id}/raw">raw</a>
      <a href="/new">+ new</a>
    </div>
  </div>
  <div class="code-wrapper">
    <pre><code class="language-${lang}">${content}</code></pre>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script>hljs.highlightAll();</script>
</body>
</html>`;
}

function newPastePage(error?: string) {
  const errorHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Paste - strings</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/material-darker.min.css">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      margin: 0;
      padding: 2rem;
      min-height: 100vh;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 1.5rem; }
    h1 a { color: inherit; text-decoration: none; }
    .error {
      background: #3d1f1f;
      border: 1px solid #f85149;
      color: #f85149;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
    }
    form { display: flex; flex-direction: column; gap: 1rem; }
    label {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      color: #8b949e;
      font-size: 0.875rem;
    }
    input, select {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 0.75rem;
      color: #c9d1d9;
      font-family: inherit;
      font-size: 1rem;
    }
    input:focus, select:focus {
      outline: none;
      border-color: #58a6ff;
    }
    .row { display: flex; gap: 1rem; }
    .row > label { flex: 1; }
    button {
      background: #238636;
      color: #fff;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
      align-self: flex-start;
    }
    button:hover { background: #2ea043; }
    .hint { font-size: 0.75rem; color: #6e7681; margin-top: 0.25rem; }
    .editor-wrapper {
      border: 1px solid #30363d;
      border-radius: 6px;
      overflow: hidden;
    }
    .CodeMirror {
      height: 400px;
      font-size: 14px;
      font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
    }
    .CodeMirror-gutters {
      background: #161b22;
      border-right: 1px solid #30363d;
    }
    #editor {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1><a href="/">strings</a> / new</h1>
    ${errorHtml}
    <form method="POST" action="/new">
      <label>
        Content
        <div class="editor-wrapper">
          <textarea name="content" id="editor"></textarea>
        </div>
      </label>
      <div class="row">
        <label>
          Filename
          <input type="text" name="filename" id="filename" placeholder="example.py">
          <span class="hint">Used to detect language for syntax highlighting</span>
        </label>
        <label>
          Custom slug (optional)
          <input type="text" name="slug" placeholder="my-snippet" pattern="[a-zA-Z0-9_-]{1,64}">
          <span class="hint">Leave empty for random ID</span>
        </label>
      </div>
      <label>
        Language
        <select name="language" id="language">
          <option value="">Auto-detect from filename</option>
          <option value="plaintext">Plain Text</option>
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="ruby">Ruby</option>
          <option value="rust">Rust</option>
          <option value="go">Go</option>
          <option value="java">Java</option>
          <option value="c">C</option>
          <option value="cpp">C++</option>
          <option value="csharp">C#</option>
          <option value="php">PHP</option>
          <option value="swift">Swift</option>
          <option value="kotlin">Kotlin</option>
          <option value="bash">Bash / Shell</option>
          <option value="sql">SQL</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="json">JSON</option>
          <option value="yaml">YAML</option>
          <option value="toml">TOML</option>
          <option value="xml">XML</option>
          <option value="markdown">Markdown</option>
          <option value="nix">Nix</option>
          <option value="dockerfile">Dockerfile</option>
          <option value="elixir">Elixir</option>
          <option value="haskell">Haskell</option>
          <option value="lua">Lua</option>
        </select>
      </label>
      <button type="submit">Create Paste</button>
    </form>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/ruby/ruby.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/rust/rust.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/go/go.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/php/php.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/swift/swift.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/shell/shell.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/sql/sql.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/yaml/yaml.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/toml/toml.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/markdown/markdown.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/nix/nix.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/dockerfile/dockerfile.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/haskell/haskell.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/lua/lua.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/mllike/mllike.min.js"></script>
  <script>
    const langToMode = {
      javascript: 'javascript',
      typescript: 'text/typescript',
      python: 'python',
      ruby: 'ruby',
      rust: 'rust',
      go: 'go',
      java: 'text/x-java',
      c: 'text/x-csrc',
      cpp: 'text/x-c++src',
      csharp: 'text/x-csharp',
      php: 'php',
      swift: 'swift',
      kotlin: 'text/x-kotlin',
      bash: 'shell',
      sql: 'sql',
      html: 'htmlmixed',
      css: 'css',
      json: 'application/json',
      yaml: 'yaml',
      toml: 'toml',
      xml: 'xml',
      markdown: 'markdown',
      nix: 'nix',
      dockerfile: 'dockerfile',
      elixir: 'mllike',
      haskell: 'haskell',
      lua: 'lua',
      plaintext: 'text/plain',
    };

    const extToLang = {
      js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
      py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
      c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
      php: 'php', swift: 'swift', kt: 'kotlin',
      sh: 'bash', bash: 'bash', zsh: 'bash',
      sql: 'sql', html: 'html', css: 'css', json: 'json',
      yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
      md: 'markdown', nix: 'nix', ex: 'elixir', exs: 'elixir',
      hs: 'haskell', lua: 'lua',
    };

    const editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
      theme: 'material-darker',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      lineWrapping: true,
      autofocus: true,
    });

    function updateMode() {
      const lang = document.getElementById('language').value;
      const filename = document.getElementById('filename').value;

      let mode = 'text/plain';

      if (lang && langToMode[lang]) {
        mode = langToMode[lang];
      } else if (filename) {
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext && extToLang[ext]) {
          mode = langToMode[extToLang[ext]] || 'text/plain';
        }
      }

      editor.setOption('mode', mode);
    }

    document.getElementById('language').addEventListener('change', updateMode);
    document.getElementById('filename').addEventListener('input', updateMode);
  </script>
</body>
</html>`;
}

type Paste = {
  id: string;
  content: string;
  filename: string | null;
  language: string | null;
  created_at: number;
};

// Config from environment
const PORT = parseInt(process.env.PORT || "3000");
const DB_PATH = process.env.DB_PATH || "./strings.db";
const USERNAME = process.env.AUTH_USERNAME || "admin";

// Load auth password from file or env
async function loadPassword(): Promise<string> {
  if (process.env.AUTH_PASSWORD_FILE) {
    try {
      const file = Bun.file(process.env.AUTH_PASSWORD_FILE);
      return (await file.text()).trim();
    } catch (e) {
      console.error("Failed to read AUTH_PASSWORD_FILE:", e);
      process.exit(1);
    }
  }
  return process.env.AUTH_PASSWORD || "changeme";
}

const PASSWORD = await loadPassword();

// Initialize database
const db = new Database(DB_PATH);
db.run(`
  CREATE TABLE IF NOT EXISTS pastes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    filename TEXT,
    language TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )
`);

// Generate random ID (lowercase only for easy typing)
function generateId(length = 6): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// Validate custom slug
function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(slug);
}

// Check if ID exists (case-insensitive)
function idExists(id: string): boolean {
  const row = db.query("SELECT 1 FROM pastes WHERE LOWER(id) = LOWER(?)").get(id);
  return row !== null;
}

// Infer language from filename
function inferLanguage(filename?: string): string | undefined {
  if (!filename) return undefined;
  const ext = filename.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    sql: "sql",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    md: "markdown",
    markdown: "markdown",
    nix: "nix",
    dockerfile: "dockerfile",
    makefile: "makefile",
    cmake: "cmake",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    lua: "lua",
    r: "r",
    jl: "julia",
    vim: "vim",
    tf: "hcl",
  };
  return ext ? langMap[ext] : undefined;
}

// Basic auth helper
function checkAuth(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const base64Credentials = authHeader.slice(6);
  const credentials = atob(base64Credentials);
  const [username, password] = credentials.split(":");

  return username === USERNAME && password === PASSWORD;
}

function unauthorizedResponse(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area"',
    },
  });
}

function getOrCreateId(customSlug?: string): string {
  if (customSlug) {
    if (!isValidSlug(customSlug)) {
      throw new Error("Invalid slug. Use 1-64 alphanumeric characters, hyphens, or underscores.");
    }
    if (idExists(customSlug)) {
      throw new Error("Slug already taken");
    }
    return customSlug;
  }

  let id: string;
  do {
    id = generateId();
  } while (idExists(id));
  return id;
}

// Router
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Login page
  if (method === "GET" && path === "/login") {
    if (getSessionUser(req)) return Response.redirect(`${url.origin}/admin`, 302);
    return new Response(loginHtml(), { headers: { "Content-Type": "text/html" } });
  }

  // Login form submit
  if (method === "POST" && path === "/login") {
    const form = await req.formData();
    const user = form.get("username") as string;
    const pass = form.get("password") as string;

    if (user !== USERNAME || pass !== PASSWORD) {
      return new Response(loginHtml("Invalid username or password"), {
        status: 401,
        headers: { "Content-Type": "text/html" },
      });
    }

    const token = crypto.randomUUID();
    sessions.set(token, user);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/admin`,
        "Set-Cookie": `session=${token}; HttpOnly; Path=/`,
      },
    });
  }

  // Logout
  if (method === "GET" && path === "/logout") {
    const token = parseCookies(req)["session"];
    if (token) sessions.delete(token);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/login`,
        "Set-Cookie": "session=; HttpOnly; Path=/; Max-Age=0",
      },
    });
  }

  // Admin: list all pastes
  if (method === "GET" && path === "/admin") {
    if (!getSessionUser(req)) return Response.redirect(`${url.origin}/login`, 302);
    const pastes = db.query("SELECT * FROM pastes ORDER BY created_at DESC").all() as Paste[];
    return new Response(adminHtml(pastes), { headers: { "Content-Type": "text/html" } });
  }

  // Create paste - API
  if (method === "POST" && path === "/api/paste") {
    if (!checkAuth(req)) return unauthorizedResponse();

    const contentType = req.headers.get("Content-Type") || "";

    let content: string;
    let filename: string | undefined;
    let language: string | undefined;
    let customSlug: string | undefined;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      content = body.content;
      filename = body.filename;
      language = body.language;
      customSlug = body.slug;
    } else {
      content = await req.text();
      filename = req.headers.get("X-Filename") || undefined;
      language = req.headers.get("X-Language") || undefined;
      customSlug = req.headers.get("X-Slug") || undefined;
    }

    if (!content) {
      return Response.json({ error: "Content is required" }, { status: 400 });
    }

    let id: string;
    try {
      id = getOrCreateId(customSlug);
    } catch (e: any) {
      const status = e.message.includes("taken") ? 409 : 400;
      return Response.json({ error: e.message }, { status });
    }

    if (!language && filename) {
      language = inferLanguage(filename);
    }

    db.run(
      "INSERT INTO pastes (id, content, filename, language) VALUES (?, ?, ?, ?)",
      [id, content, filename || null, language || null]
    );

    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

    return Response.json({
      id,
      url: `${baseUrl}/${id}`,
      raw: `${baseUrl}/${id}/raw`,
    });
  }

  // Create paste - Form submission
  if (method === "POST" && path === "/new") {
    if (!checkAuth(req)) return unauthorizedResponse();

    const form = await req.formData();
    const content = form.get("content") as string;
    const filename = (form.get("filename") as string) || undefined;
    const language = (form.get("language") as string) || undefined;
    const customSlug = (form.get("slug") as string) || undefined;

    if (!content) {
      return new Response(newPastePage("Content is required"), {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    let id: string;
    try {
      id = getOrCreateId(customSlug);
    } catch (e: any) {
      const status = e.message.includes("taken") ? 409 : 400;
      return new Response(newPastePage(e.message), {
        status,
        headers: { "Content-Type": "text/html" },
      });
    }

    const inferredLang = language || inferLanguage(filename || undefined);

    db.run(
      "INSERT INTO pastes (id, content, filename, language) VALUES (?, ?, ?, ?)",
      [id, content, filename || null, inferredLang || null]
    );

    return Response.redirect(`${url.origin}/${id}`, 302);
  }

  // New paste form
  if (method === "GET" && path === "/new") {
    if (!checkAuth(req)) return unauthorizedResponse();

    return new Response(newPastePage(), {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Delete paste (accepts session cookie or basic auth)
  if (method === "DELETE" && path.match(/^\/[^/]+$/)) {
    if (!getSessionUser(req) && !checkAuth(req)) return unauthorizedResponse();

    const id = path.slice(1).toLowerCase();
    const result = db.run("DELETE FROM pastes WHERE LOWER(id) = ?", [id]);

    if (result.changes === 0) {
      return Response.json({ error: "Paste not found" }, { status: 404 });
    }

    return Response.json({ deleted: true });
  }

  // Get raw paste
  if (method === "GET" && path.match(/^\/[^/]+\/raw$/)) {
    const id = path.slice(1, -4).toLowerCase();
    const paste = db.query("SELECT * FROM pastes WHERE LOWER(id) = ?").get(id) as Paste | null;

    if (!paste) {
      return new Response("Paste not found", { status: 404 });
    }

    return new Response(paste.content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Get paste (HTML view)
  if (method === "GET" && path.match(/^\/[^/]+$/)) {
    const id = path.slice(1).toLowerCase();

    if (["new", "api", "login", "logout", "admin"].includes(id)) {
      return new Response(errorPage("Not found"), {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }

    const paste = db.query("SELECT * FROM pastes WHERE LOWER(id) = ?").get(id) as Paste | null;

    if (!paste) {
      return new Response(errorPage("Paste not found"), {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response(renderPaste(paste), {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Home page
  if (method === "GET" && path === "/") {
    return new Response(homeHtml(!!getSessionUser(req)), {
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response(errorPage("Not found"), {
    status: 404,
    headers: { "Content-Type": "text/html" },
  });
}

console.log(`strings running on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: handleRequest,
};
