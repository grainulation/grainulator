#!/usr/bin/env node
/**
 * llms-txt-lint — cross-link linter for grainulation ecosystem llms.txt files.
 *
 * Why:
 *   The grainulation umbrella site plus seven sibling packages each ship a
 *   `site/llms.txt` that cross-links the others (per llmstxt.org spec: H1,
 *   blockquote one-liner, documentation list, sibling list). If a sibling
 *   renames, re-describes itself, or drops a cross-link, the whole graph
 *   goes stale silently. Phase 3 flagged this as a blindspot.
 *
 *   This tool reads each site's `site/llms.txt`, parses the markdown
 *   structure, and emits a report flagging:
 *     - missing-sibling   : site A's ecosystem list omits sibling B
 *     - h1-drift          : H1 slug disagrees with package.json "name"
 *     - description-drift : same sibling is described differently across
 *                           the 8 concrete llms.txt files
 *     - unfilled          : a `{{…}}` placeholder is still present
 *                           (template bleed-through)
 *
 *   Report-only: never edits any llms.txt file.
 *
 * Usage:
 *   # From barn repo root, auto-discover siblings at ../<repo>/site/llms.txt:
 *   node tools/seo/llms-txt-lint.js
 *
 *   # Or as a subcommand via the barn CLI:
 *   npx @grainulation/barn llms-txt-lint
 *
 *   # Explicit repo roots (one per --root flag):
 *   node tools/seo/llms-txt-lint.js --root ../barn --root ../wheat ...
 *
 *   # Machine-readable:
 *   node tools/seo/llms-txt-lint.js --json
 *
 * Exit codes:
 *   0   no issues
 *   1   one or more issues found
 *   2   invocation error
 *
 * Zero runtime dependencies. Node built-ins only.
 */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Expected ecosystem packages. Order is display-only; discovery is by path.
const EXPECTED_SIBLINGS = [
  "barn",
  "grainulation",
  "harvest",
  "mill",
  "orchard",
  "silo",
  "wheat",
];

// ── Argv parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { roots: [], json: false, quiet: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") out.roots.push(argv[++i]);
    else if (a === "--json") out.json = true;
    else if (a === "--quiet" || a === "-q") out.quiet = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else {
      process.stderr.write(`llms-txt-lint: unknown argument '${a}'\n`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: barn llms-txt-lint [options]",
      "",
      "Cross-link linter for grainulation ecosystem llms.txt files.",
      "",
      "Options:",
      "  --root <dir>   Explicit repo root. Repeatable. If omitted, siblings",
      "                 are auto-discovered at ../<repo>/site/llms.txt.",
      "  --json         Emit a JSON report instead of markdown.",
      "  --quiet, -q    Suppress per-site detail; show summary only.",
      "  -h, --help     Show this help.",
      "",
    ].join("\n"),
  );
}

// ── Discovery ────────────────────────────────────────────────────────────────
function discoverSiblings() {
  // Walk up from this file until we find a sibling directory of barn that
  // contains one of the expected packages. We assume a monorepo-like layout:
  //
  //   <parent>/
  //     barn/       ← __dirname is inside here (tools/seo)
  //     wheat/
  //     mill/
  //     …
  //
  // If the layout differs, callers can supply --root explicitly.
  const barnRoot = resolve(__dirname, "..", "..");
  const parent = resolve(barnRoot, "..");
  if (!existsSync(parent) || !statSync(parent).isDirectory()) return [];
  const entries = readdirSync(parent, { withFileTypes: true });
  const roots = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(parent, e.name);
    const llms = join(dir, "site", "llms.txt");
    if (existsSync(llms) && EXPECTED_SIBLINGS.includes(e.name)) {
      roots.push(dir);
    }
  }
  return roots;
}

// ── Parsing ──────────────────────────────────────────────────────────────────
/**
 * Parse a minimal subset of the llms.txt markdown layout:
 *   # H1
 *   > blockquote one-liner (may span multiple lines)
 *   … prose …
 *   ## Documentation
 *     - [label](url): description
 *   ## Ecosystem
 *     - [SiblingName](url): one-liner
 *   ## …
 *   ## Optional
 *
 * We only extract the parts we lint: H1, blockquote, and per-H2 link lists.
 */
function parseLlmsTxt(source) {
  const lines = source.split(/\r?\n/);
  let h1 = null;
  let blockquote = null;
  const sections = {}; // H2 slug → array of { label, url, description }
  let currentSection = null;
  const placeholders = []; // any remaining {{…}}

  const placeholderRe = /\{\{[A-Z0-9_]+\}\}/g;
  const linkRe = /^\s*-\s*\[([^\]]+)\]\(([^)]+)\)\s*(?::\s*(.+))?$/;

  for (const line of lines) {
    // Track placeholders anywhere.
    const m = line.match(placeholderRe);
    if (m) placeholders.push(...m);

    if (h1 === null && line.startsWith("# ")) {
      h1 = line.slice(2).trim();
      continue;
    }
    if (blockquote === null && line.startsWith("> ")) {
      blockquote = line.slice(2).trim();
      continue;
    }
    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim();
      sections[currentSection] = [];
      continue;
    }
    if (currentSection) {
      const lm = line.match(linkRe);
      if (lm) {
        sections[currentSection].push({
          label: lm[1].trim(),
          url: lm[2].trim(),
          description: (lm[3] || "").trim(),
        });
      }
    }
  }

  return { h1, blockquote, sections, placeholders };
}

// Normalize a package name to a bare slug (strip @grainulation/ scope,
// parenthetical qualifiers, trailing "(umbrella)" etc.).
function normalizeName(name) {
  if (!name) return "";
  let n = name.trim().toLowerCase();
  n = n.replace(/@grainulation\//, "");
  n = n.replace(/\(.*?\)/g, "").trim();
  n = n.replace(/\s+/g, "");
  return n;
}

// Cheap similarity: character-set overlap ratio. Good enough to distinguish
// "Mill is an export engine" from "Mill is a research sprint framework".
function similarityRatio(a, b) {
  if (!a || !b) return 0;
  const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.max(A.size, B.size);
}

// ── Linting ──────────────────────────────────────────────────────────────────
function lintAll(roots) {
  const sites = {}; // slug → { root, h1, h1Slug, blockquote, sections, pkgName, placeholders }

  for (const root of roots) {
    const llmsPath = join(root, "site", "llms.txt");
    const pkgPath = join(root, "package.json");
    if (!existsSync(llmsPath)) continue;
    const raw = readFileSync(llmsPath, "utf8");
    const parsed = parseLlmsTxt(raw);
    let pkgName = null;
    if (existsSync(pkgPath)) {
      try {
        pkgName = JSON.parse(readFileSync(pkgPath, "utf8")).name || null;
      } catch {
        pkgName = null;
      }
    }
    const slug = basename(root);
    sites[slug] = {
      root,
      slug,
      path: llmsPath,
      h1: parsed.h1,
      h1Slug: normalizeName(parsed.h1),
      blockquote: parsed.blockquote,
      sections: parsed.sections,
      pkgName,
      placeholders: parsed.placeholders,
    };
  }

  const issues = [];

  for (const site of Object.values(sites)) {
    // 1. unfilled placeholders
    if (site.placeholders.length > 0) {
      issues.push({
        kind: "unfilled",
        site: site.slug,
        path: site.path,
        detail: `contains ${site.placeholders.length} unfilled placeholder(s): ${[...new Set(site.placeholders)].join(", ")}`,
      });
    }

    // 2. h1 drift vs package.json "name"
    if (site.pkgName) {
      const expected = normalizeName(site.pkgName);
      if (
        site.h1Slug &&
        expected &&
        !site.h1Slug.includes(expected) &&
        !expected.includes(site.h1Slug)
      ) {
        issues.push({
          kind: "h1-drift",
          site: site.slug,
          path: site.path,
          detail: `H1 "${site.h1}" (normalized "${site.h1Slug}") does not align with package.json name "${site.pkgName}" (normalized "${expected}")`,
        });
      }
    }

    // 3. missing siblings in the Ecosystem section
    const ecoSection = site.sections["Ecosystem"] || [];
    const listedSlugs = new Set(
      ecoSection.map((e) => normalizeName(e.label)).filter(Boolean),
    );
    // Grainulator is optional (it's a plugin, not a site); barn's own site
    // doesn't need to list itself.
    for (const sibSlug of Object.keys(sites)) {
      if (sibSlug === site.slug) continue;
      const sib = sites[sibSlug];
      const target = normalizeName(sib.h1 || sibSlug);
      if (!listedSlugs.has(target) && !listedSlugs.has(sibSlug)) {
        issues.push({
          kind: "missing-sibling",
          site: site.slug,
          path: site.path,
          detail: `ecosystem list omits sibling "${sibSlug}"`,
        });
      }
    }
  }

  // 4. description drift: for each sibling S, collect how every OTHER site
  //    describes S in its ecosystem list. If any pair's similarity is below
  //    threshold, flag drift.
  const descByTarget = {}; // targetSlug → [{ source, description }]
  for (const site of Object.values(sites)) {
    const eco = site.sections["Ecosystem"] || [];
    for (const entry of eco) {
      const target = normalizeName(entry.label);
      if (!target) continue;
      if (!descByTarget[target]) descByTarget[target] = [];
      if (entry.description) {
        descByTarget[target].push({
          source: site.slug,
          description: entry.description,
        });
      }
    }
  }

  const DRIFT_THRESHOLD = 0.2; // <20% word overlap ⇒ they disagree
  for (const [target, descs] of Object.entries(descByTarget)) {
    for (let i = 0; i < descs.length; i++) {
      for (let j = i + 1; j < descs.length; j++) {
        const r = similarityRatio(descs[i].description, descs[j].description);
        if (r < DRIFT_THRESHOLD) {
          issues.push({
            kind: "description-drift",
            site: `${descs[i].source} vs ${descs[j].source}`,
            path: null,
            detail:
              `describe "${target}" with low-similarity one-liners (overlap=${r.toFixed(2)}):\n` +
              `    ${descs[i].source}: "${descs[i].description}"\n` +
              `    ${descs[j].source}: "${descs[j].description}"`,
          });
        }
      }
    }
  }

  return { sites, issues };
}

// ── Report rendering ─────────────────────────────────────────────────────────
function renderMarkdown({ sites, issues }, { quiet } = {}) {
  const out = [];
  const siteSlugs = Object.keys(sites).sort();
  out.push("# llms-txt cross-link report");
  out.push("");
  out.push(
    `Scanned ${siteSlugs.length} site(s): ${siteSlugs.join(", ") || "(none)"}`,
  );
  out.push(`Issues: **${issues.length}**`);
  out.push("");

  if (!quiet) {
    out.push("## Site summary");
    out.push("");
    out.push("| Site | H1 | Package name | Ecosystem links | Placeholders |");
    out.push("|---|---|---|---:|---:|");
    for (const slug of siteSlugs) {
      const s = sites[slug];
      const eco = s.sections["Ecosystem"] || [];
      out.push(
        `| ${slug} | ${s.h1 || "—"} | ${s.pkgName || "—"} | ${eco.length} | ${s.placeholders.length} |`,
      );
    }
    out.push("");
  }

  if (issues.length === 0) {
    out.push("No issues found.");
    return out.join("\n") + "\n";
  }

  out.push("## Issues");
  out.push("");
  const byKind = {};
  for (const issue of issues) {
    if (!byKind[issue.kind]) byKind[issue.kind] = [];
    byKind[issue.kind].push(issue);
  }
  for (const kind of Object.keys(byKind).sort()) {
    out.push(`### ${kind} (${byKind[kind].length})`);
    out.push("");
    for (const issue of byKind[kind]) {
      out.push(`- **${issue.site}**: ${issue.detail}`);
      if (issue.path) out.push(`  - at: \`${issue.path}\``);
    }
    out.push("");
  }
  return out.join("\n") + "\n";
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }

  const roots =
    args.roots.length > 0
      ? args.roots.map((r) => resolve(r))
      : discoverSiblings();

  if (roots.length === 0) {
    process.stderr.write(
      "llms-txt-lint: no llms.txt files found. Pass --root <dir> or run from the ecosystem root.\n",
    );
    return 2;
  }

  const result = lintAll(roots);

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          sites: Object.fromEntries(
            Object.entries(result.sites).map(([k, v]) => [
              k,
              {
                slug: v.slug,
                path: v.path,
                h1: v.h1,
                pkgName: v.pkgName,
                ecosystemCount: (v.sections["Ecosystem"] || []).length,
                placeholders: v.placeholders,
              },
            ]),
          ),
          issues: result.issues,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(renderMarkdown(result, { quiet: args.quiet }));
  }

  return result.issues.length > 0 ? 1 : 0;
}

const isDirect =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("llms-txt-lint.js") ||
    process.argv[1].endsWith("llms-txt-lint"));
if (isDirect) {
  process.exit(main());
}

export {
  main,
  parseLlmsTxt,
  lintAll,
  normalizeName,
  similarityRatio,
  discoverSiblings,
  EXPECTED_SIBLINGS,
};
