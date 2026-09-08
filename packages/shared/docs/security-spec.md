# Security Spec — Grainulation v1 Ecosystem

> Addresses blind spots r042/r059: no input sanitization spec for claim content rendered as HTML in UIs.

## Scope

This spec applies to all 7 retained tools: wheat, barn, mill, silo, harvest, orchard, grainulation. Every tool that renders claim content, SSE event data, or user input into HTML must follow these rules.

## 1. HTML Sanitization

### Rule: Never use innerHTML with raw claim text

Claim content is free-form text authored by humans and LLMs. It may contain characters that are valid HTML syntax. All tools must escape these characters before rendering into the DOM.

### Required escapes

| Character | Escape   | Why                                  |
| --------- | -------- | ------------------------------------ |
| `<`       | `&lt;`   | Prevents tag injection               |
| `>`       | `&gt;`   | Closes injected tags                 |
| `&`       | `&amp;`  | Prevents entity injection            |
| `"`       | `&quot;` | Prevents attribute breakout          |
| `'`       | `&#x27;` | Prevents attribute breakout (single) |

### Reference implementation

Every tool should use this pattern (or equivalent) when rendering claim content:

```javascript
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
```

### Safe rendering patterns

```javascript
// SAFE: textContent (auto-escapes)
el.textContent = claim.content;

// SAFE: escaped innerHTML (when markup structure is needed)
el.innerHTML = `<span class="claim-text">${escapeHTML(claim.content)}</span>`;

// UNSAFE: never do this
el.innerHTML = claim.content;
```

### Where this applies

- Claim content in list views, detail panes, and dashboards
- Claim IDs, tags, and topic names (could contain special characters)
- Error messages that include user-provided data
- SSE event payloads rendered into the DOM
- URL parameters reflected in the UI

## 2. SSE Event Data Sanitization

### How SSE data is constructed

All grainulation tools use `JSON.stringify()` to serialize SSE event data:

```javascript
res.write(`data: ${JSON.stringify(payload)}\n\n`);
```

`JSON.stringify` handles escaping of special characters within string values (quotes, backslashes, control characters). This is safe for the SSE transport layer.

### The rendering layer is where the risk lives

When the client parses SSE data with `JSON.parse()` and renders it, the HTML sanitization rules from Section 1 apply. The SSE layer is safe; the DOM insertion layer is not.

```javascript
eventSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  // SAFE: use textContent or escapeHTML
  el.textContent = data.content;
  // UNSAFE: never do this
  el.innerHTML = data.content;
};
```

## 3. CORS Policy

### Default: same-origin only

All grainulation tool servers default to same-origin. No `Access-Control-Allow-Origin` header is sent unless explicitly configured.

### Configurable via --cors flag

Tools that support cross-origin access (e.g., barn serving shared assets to other tool UIs) accept a `--cors` flag:

```bash
# Allow specific origin
npx @grainulation/barn serve --cors http://localhost:9092

# Allow all origins (development only)
npx @grainulation/barn serve --cors "*"
```

### Implementation pattern

```javascript
if (corsOrigin) {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
```

### v1 policy

For v1, all tools run on localhost on different ports. Cross-origin requests between tools (e.g., wheat UI loading barn assets) use the `--cors` flag. Production deployments should restrict origins explicitly.

## 4. Path Traversal Prevention

### Existing pattern (wheat/barn servers)

The servers already normalize paths and reject traversal attempts. The pattern:

```javascript
function safePath(base, requested) {
  const resolved = path.resolve(base, requested);
  if (!resolved.startsWith(path.resolve(base))) {
    return null; // traversal attempt
  }
  return resolved;
}
```

### Rules

- All file-serving endpoints must use `path.resolve()` and verify the result starts with the expected base directory.
- Reject any path containing `..` after normalization that escapes the base.
- Return 403 (not 404) for traversal attempts — do not reveal directory structure.
- Log traversal attempts if audit logging is enabled.

### Applies to

- Static file serving in all tool UIs
- Claim file loading (claims.json path)
- Export/import file paths in mill and silo
- Any endpoint that accepts a file path parameter

## 5. Authentication


### All other tools: local-only, no auth

Wheat, barn, mill, silo, harvest, orchard, and grainulation bind to `127.0.0.1` (localhost) by default. Since they only accept local connections, no authentication is needed for v1.

### When to add auth to other tools

Auth should be added to a tool if:

- It binds to `0.0.0.0` (network-accessible)
- It modifies state (writes files, changes configuration)
- It is deployed to a shared server

This is not needed for v1 (all local), but authentication must be designed for the specific service.

## 6. Rate Limiting

### v1: not needed

All tools run locally. Rate limiting local requests adds complexity without security benefit.

### When to add rate limiting

Add rate limiting when:

- A tool is exposed to the network (binds to `0.0.0.0`)
- A tool accepts POST requests that trigger expensive operations (compilation, export)
- A tool is deployed as a shared service

### Recommended pattern (for future use)

```javascript
const requestCounts = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

function rateLimit(ip) {
  const now = Date.now();
  const entry = requestCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW_MS) {
    entry.count = 1;
    entry.start = now;
  } else {
    entry.count++;
  }
  requestCounts.set(ip, entry);
  return entry.count <= MAX_REQUESTS;
}
```

## Changelog

| Date       | Change                             |
| ---------- | ---------------------------------- |
| 2026-03-15 | Initial spec (addresses r042/r059) |
