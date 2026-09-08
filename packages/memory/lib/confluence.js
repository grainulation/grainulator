/**
 * confluence.js — Confluence backend adapter for silo
 *
 * Publishes wheat compilation briefs and claim collections to Confluence pages,
 * and pulls existing Confluence pages into silo claims. Uses Confluence REST API v2
 * via node:https (zero npm deps).
 *
 * Configuration:
 *   CONFLUENCE_BASE_URL  — e.g. https://myorg.atlassian.net/wiki
 *   CONFLUENCE_TOKEN     — API token (Atlassian account settings)
 *   CONFLUENCE_EMAIL     — User email for Basic auth
 *   CONFLUENCE_SPACE_KEY — Target space key (e.g. "ENG")
 */

import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

export class Confluence {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl    — Confluence base URL
   * @param {string} opts.token      — API token
   * @param {string} opts.email      — User email
   * @param {string} opts.spaceKey   — Default space key
   */
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl || "").replace(/\/+$/, "");
    this.token = opts.token || "";
    this.email = opts.email || "";
    this.spaceKey = opts.spaceKey || "";
  }

  /** Check if the adapter is configured with required credentials. */
  isConfigured() {
    return Boolean(this.baseUrl && this.token && this.email);
  }

  /**
   * Publish a set of claims as a Confluence page.
   *
   * @param {string} title - Page title
   * @param {object[]} claims - Array of wheat-canonical claims
   * @param {object} opts
   * @param {string} opts.spaceKey - Override default space key
   * @param {string} opts.parentId - Parent page ID (optional)
   * @param {string} opts.pageId   - Existing page ID to update (optional)
   * @returns {Promise<{id: string, url: string, title: string, version: number}>}
   */
  async publish(title, claims, opts = {}) {
    this._requireConfig();
    const spaceKey = opts.spaceKey || this.spaceKey;
    if (!spaceKey)
      throw new Error(
        "Confluence space key required (opts.spaceKey or CONFLUENCE_SPACE_KEY)",
      );

    const body = this._claimsToStorageFormat(title, claims);

    if (opts.pageId) {
      return this._updatePage(opts.pageId, title, body);
    }
    return this._createPage(spaceKey, title, body, opts.parentId);
  }

  /**
   * Pull claims from a Confluence page by ID or title search.
   *
   * @param {string} pageIdOrTitle - Page ID (numeric) or title to search
   * @param {object} opts
   * @param {string} opts.spaceKey - Space to search in
   * @returns {Promise<{title: string, claims: object[]}>}
   */
  async pull(pageIdOrTitle, opts = {}) {
    this._requireConfig();

    let pageId = pageIdOrTitle;
    if (!/^\d+$/.test(pageIdOrTitle)) {
      pageId = await this._findPageByTitle(
        pageIdOrTitle,
        opts.spaceKey || this.spaceKey,
      );
      if (!pageId)
        throw new Error(`Confluence page not found: "${pageIdOrTitle}"`);
    }

    const page = await this._getPage(pageId);
    const claims = this._parseStorageFormat(page.body?.storage?.value || "");

    return {
      title: page.title,
      pageId: page.id,
      claims,
    };
  }

  /**
   * List pages in a space that look like silo claim collections.
   *
   * @param {object} opts
   * @param {string} opts.spaceKey - Space key
   * @param {number} opts.limit - Max results
   * @returns {Promise<{pages: object[]}>}
   */
  async listPages(opts = {}) {
    this._requireConfig();
    const spaceKey = opts.spaceKey || this.spaceKey;
    if (!spaceKey) throw new Error("Space key required");

    const cql = encodeURIComponent(
      `space="${_cqlEscape(spaceKey)}" AND label="silo-claims" ORDER BY lastModified DESC`,
    );
    const data = await this._request(
      "GET",
      `/rest/api/content/search?cql=${cql}&limit=${opts.limit || 25}`,
    );

    return {
      pages: (data.results || []).map((p) => ({
        id: p.id,
        title: p.title,
        url: `${this.baseUrl}${p._links?.webui || ""}`,
        lastModified: p.version?.when,
      })),
    };
  }

  // ── HTML generation ──────────────────────────────────────────────────────

  _claimsToStorageFormat(title, claims) {
    const rows = claims.map((c) => {
      const evidence = c.evidence || c.tier || "stated";
      const source =
        typeof c.source === "object"
          ? c.source.artifact || c.source.origin || ""
          : c.source || "";
      return `<tr>
        <td>${_esc(c.id || "")}</td>
        <td>${_esc(c.type || "")}</td>
        <td>${_esc(c.topic || "")}</td>
        <td>${_esc(c.content || c.text || "")}</td>
        <td>${_esc(evidence)}</td>
        <td>${_esc(source)}</td>
        <td>${_esc((c.tags || []).join(", "))}</td>
      </tr>`;
    });

    return `<h2>Claims (${claims.length})</h2>
<table>
<thead><tr>
  <th>ID</th><th>Type</th><th>Topic</th><th>Content</th><th>Evidence</th><th>Source</th><th>Tags</th>
</tr></thead>
<tbody>${rows.join("\n")}</tbody>
</table>
<p><em>Published from silo on ${new Date().toISOString()}</em></p>
<!-- silo-meta: ${JSON.stringify({ claimCount: claims.length, exportedAt: new Date().toISOString() })} -->`;
  }

  _parseStorageFormat(html) {
    const claims = [];
    // Extract table rows: each <tr> in tbody represents a claim
    const rowRe =
      /<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gs;
    let match;
    while ((match = rowRe.exec(html)) !== null) {
      const [, id, type, topic, content, evidence, source, tagsStr] = match;
      claims.push({
        id: _unesc(id),
        type: _unesc(type) || "factual",
        topic: _unesc(topic),
        content: _unesc(content),
        evidence: _unesc(evidence) || "stated",
        status: "active",
        phase_added: "import",
        timestamp: new Date().toISOString(),
        source: {
          origin: "confluence",
          artifact: _unesc(source) || null,
          connector: null,
        },
        conflicts_with: [],
        resolved_by: null,
        tags: tagsStr
          ? _unesc(tagsStr)
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      });
    }
    return claims;
  }

  // ── HTTP helpers ─────────────────────────────────────────────────────────

  _requireConfig() {
    if (!this.isConfigured()) {
      throw new Error(
        "Confluence not configured. Set CONFLUENCE_BASE_URL, CONFLUENCE_TOKEN, and CONFLUENCE_EMAIL.",
      );
    }
  }

  async _createPage(spaceKey, title, body, parentId) {
    const payload = {
      type: "page",
      title,
      space: { key: spaceKey },
      body: { storage: { value: body, representation: "storage" } },
      metadata: { labels: [{ name: "silo-claims" }] },
    };
    if (parentId) {
      payload.ancestors = [{ id: parentId }];
    }
    const data = await this._request("POST", "/rest/api/content", payload);
    return {
      id: data.id,
      title: data.title,
      url: `${this.baseUrl}${data._links?.webui || ""}`,
      version: data.version?.number || 1,
    };
  }

  async _updatePage(pageId, title, body) {
    const existing = await this._request(
      "GET",
      `/rest/api/content/${pageId}?expand=version`,
    );
    const payload = {
      type: "page",
      title,
      body: { storage: { value: body, representation: "storage" } },
      version: { number: (existing.version?.number || 0) + 1 },
    };
    const data = await this._request(
      "PUT",
      `/rest/api/content/${pageId}`,
      payload,
    );
    return {
      id: data.id,
      title: data.title,
      url: `${this.baseUrl}${data._links?.webui || ""}`,
      version: data.version?.number,
    };
  }

  async _getPage(pageId) {
    return this._request(
      "GET",
      `/rest/api/content/${pageId}?expand=body.storage,version`,
    );
  }

  async _findPageByTitle(title, spaceKey) {
    const cql = encodeURIComponent(
      `space="${_cqlEscape(spaceKey)}" AND title="${_cqlEscape(title)}"`,
    );
    const data = await this._request(
      "GET",
      `/rest/api/content/search?cql=${cql}&limit=1`,
    );
    return data.results?.[0]?.id || null;
  }

  _request(method, apiPath, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(apiPath, this.baseUrl);
      const mod = url.protocol === "https:" ? https : http;
      const auth = Buffer.from(`${this.email}:${this.token}`).toString(
        "base64",
      );
      const payload = body ? JSON.stringify(body) : null;

      const req = mod.request(
        url,
        {
          method,
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
            ...(payload
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(payload),
                }
              : {}),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            if (res.statusCode >= 400) {
              reject(
                new Error(
                  `Confluence API ${res.statusCode}: ${data.slice(0, 200)}`,
                ),
              );
              return;
            }
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ raw: data });
            }
          });
        },
      );

      req.on("error", reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error("Confluence request timeout"));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }
}

// ── CQL escaping ─────────────────────────────────────────────────────────────
// Confluence CQL string literals are double-quoted. To safely interpolate a
// user-supplied value we escape backslashes first, then double quotes. A
// space key or title containing `"` or `\` can no longer break out of the
// literal and append an arbitrary CQL clause.
function _cqlEscape(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── HTML escaping helpers ────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _unesc(str) {
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
