import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, "..", "public", "index.html");
const html = readFileSync(HTML_PATH, "utf-8");

// ─── Shared shell elements ───────────────────────────────────────────────────

describe("Barn UI shell elements", () => {
  it("has searchInput", () => {
    assert.ok(html.indexOf('id="searchInput"') !== -1);
  });

  it("has grainLogo canvas", () => {
    assert.ok(html.indexOf('id="grainLogo"') !== -1);
  });

  it("has main-content", () => {
    assert.ok(html.indexOf('id="main-content"') !== -1);
  });

  it("has sse-dot", () => {
    assert.ok(html.indexOf('id="sse-dot"') !== -1);
  });

  it("has reconnectBanner", () => {
    assert.ok(html.indexOf('id="reconnectBanner"') !== -1);
  });

  it("has toast-container", () => {
    assert.ok(html.indexOf('id="toast-container"') !== -1);
  });

  it('has class="app" main grid', () => {
    assert.ok(html.indexOf('class="app"') !== -1);
  });

  it('has mobile-nav with data-panel="content" and data-panel="sidebar"', () => {
    assert.ok(html.indexOf('class="mobile-nav"') !== -1);
    assert.ok(html.indexOf('data-panel="content"') !== -1);
    assert.ok(html.indexOf('data-panel="sidebar"') !== -1);
  });

  it('has role="listbox" on sidebar list', () => {
    assert.ok(html.indexOf('role="listbox"') !== -1);
  });
});

// ─── CSS tokens ──────────────────────────────────────────────────────────────

describe("Barn CSS tokens", () => {
  it("has --bg: #0a0e1a", () => {
    assert.ok(/--bg:\s*#0a0e1a/.test(html));
  });

  it("has --accent: #f43f5e (barn rose)", () => {
    assert.ok(/--accent:\s*#f43f5e/.test(html));
  });

  it("has --accent-light", () => {
    assert.ok(html.indexOf("--accent-light") !== -1);
  });

  it("has --accent-dim", () => {
    assert.ok(html.indexOf("--accent-dim") !== -1);
  });

  it("has --accent-border", () => {
    assert.ok(html.indexOf("--accent-border") !== -1);
  });
});

// ─── TOOL config ─────────────────────────────────────────────────────────────

describe("Barn TOOL config", () => {
  it("has name: 'Barn'", () => {
    assert.ok(html.indexOf("name: 'Barn'") !== -1);
  });

  it("has letter: 'B'", () => {
    assert.ok(html.indexOf("letter: 'B'") !== -1);
  });

  it("has color: '#f43f5e'", () => {
    assert.ok(html.indexOf("color: '#f43f5e'") !== -1);
  });
});

// ─── Self-contained rule ─────────────────────────────────────────────────────

describe("Barn self-contained (no external resources)", () => {
  it("has no <script src= tags", () => {
    assert.ok(/<script\s+src=/.test(html) === false);
  });

  it('has no <link rel="stylesheet" href= tags', () => {
    assert.ok(/<link\s[^>]*rel="stylesheet"\s[^>]*href=/.test(html) === false);
  });
});

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

describe("Barn keyboard shortcuts", () => {
  it("handles / key for search focus", () => {
    assert.ok(html.indexOf("key === '/'") !== -1);
  });

  it("handles Escape key", () => {
    assert.ok(
      html.indexOf("'Escape'") !== -1 || html.indexOf('"Escape"') !== -1,
    );
  });
});

// ─── Functions ───────────────────────────────────────────────────────────────

describe("Barn required functions", () => {
  it("has connectSSE function", () => {
    assert.ok(html.indexOf("connectSSE") !== -1);
  });

  it("has toast function", () => {
    assert.ok(html.indexOf("function toast") !== -1);
  });

  it("has switchMobilePanel function", () => {
    assert.ok(html.indexOf("switchMobilePanel") !== -1);
  });
});
