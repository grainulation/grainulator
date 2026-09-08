#!/usr/bin/env node
/**
 * sync-assets — vendor shared grainulation primitives into a consumer site/.
 *
 * Why:
 *   All 8 grainulation sites ship a strict CSP (`default-src 'self'`). Cross-
 *   origin <link> loads from barn.grainulation.com are blocked by policy.
 *   Instead of loosening CSP, each site vendors the shared primitives from
 *   @grainulation/barn into its OWN origin at build time.
 *
 * Usage:
 *   # From a consumer's GitHub Pages workflow (after actions/checkout):
 *   node node_modules/@grainulation/barn/tools/sync-assets.js --target ./site
 *
 *   # Or as a subcommand via the barn CLI:
 *   npx @grainulation/barn sync-assets --target ./site
 *
 * Flags:
 *   --target <dir>   Destination directory (typically the site/ dir). Required.
 *   --strict         Exit non-zero if any target file differs from source
 *                    (instead of overwriting). Useful in CI to catch drift.
 *   --dry-run        Print the plan, touch nothing.
 *   --verbose        Log each file's status.
 *   -h, --help       Show this help.
 *
 * Idempotency:
 *   Sources and targets are compared by sha256 of file contents. If they
 *   match, the copy is skipped. If they differ, target is overwritten (or in
 *   --strict mode, the command exits non-zero without writing).
 *
 * Zero runtime dependencies. Node built-ins only.
 */

import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

// ── Explicit sync manifest ────────────────────────────────────────────────────
// Assets that MUST be vendored into each consumer site. Deliberately NOT a
// glob over public/ — templates, landing HTML, and other non-runtime assets
// must NOT be auto-synced. Add new primitives here and ship a minor bump.
const SYNC_MANIFEST = [
  {
    src: "grainulation-print.css",
    dst: "grainulation-print.css",
    category: "stylesheet",
    description: 'Shared print stylesheet; referenced by <link media="print">.',
  },
  {
    src: "grainulation-tokens.css",
    dst: "grainulation-tokens.css",
    category: "stylesheet",
    description: "Shared design tokens; optionally referenced by <link>.",
  },
  {
    src: "status-icons.svg",
    dst: "status-icons.svg",
    category: "asset",
    description: "Status icon sprite used by the dashboard template.",
    optional: true, // not every site renders dashboards
  },
];

// ── Argv parsing (minimal, built-in) ──────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    target: null,
    strict: false,
    dryRun: false,
    verbose: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--target" || a === "-t") out.target = argv[++i];
    else if (a === "--strict") out.strict = true;
    else if (a === "--dry-run" || a === "-n") out.dryRun = true;
    else if (a === "--verbose" || a === "-V") out.verbose = true;
    else if (a === "-h" || a === "--help") out.help = true;
    else {
      process.stderr.write(`sync-assets: unknown argument '${a}'\n`);
      process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: barn sync-assets --target <dir> [options]",
      "",
      "Vendor shared grainulation primitives from @grainulation/barn into a site/ dir.",
      "",
      "Options:",
      "  --target <dir>  Destination directory (required). Typically ./site.",
      "  --strict        Fail instead of overwriting diverged targets.",
      "  --dry-run       Print plan without writing.",
      "  --verbose       Log each asset's status (copied | unchanged | overwritten).",
      "  -h, --help      Show this help.",
      "",
      "Manifest (current shared assets):",
      ...SYNC_MANIFEST.map(
        (a) =>
          `  ${a.src.padEnd(32)}${a.optional ? "[optional] " : "           "}${a.description}`,
      ),
      "",
    ].join("\n"),
  );
}

function hash(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  if (!args.target) {
    process.stderr.write("sync-assets: --target <dir> is required\n");
    printHelp();
    return 2;
  }

  const target = resolve(args.target);
  if (!existsSync(target)) {
    if (args.dryRun) {
      process.stdout.write(`(dry-run) would create target dir: ${target}\n`);
    } else {
      ensureDir(target);
    }
  } else {
    const s = statSync(target);
    if (!s.isDirectory()) {
      process.stderr.write(
        `sync-assets: --target is not a directory: ${target}\n`,
      );
      return 2;
    }
  }

  const report = {
    copied: 0,
    unchanged: 0,
    overwritten: 0,
    skipped: 0,
    missingSources: 0,
    conflicts: 0,
  };
  const lines = [];

  for (const asset of SYNC_MANIFEST) {
    const srcPath = join(PUBLIC_DIR, asset.src);
    const dstPath = join(target, asset.dst);

    if (!existsSync(srcPath)) {
      if (asset.optional) {
        report.skipped++;
        if (args.verbose)
          lines.push(`  skipped  ${asset.src} (optional source missing)`);
        continue;
      }
      report.missingSources++;
      lines.push(
        `  MISSING  ${asset.src} (required source not found at ${srcPath})`,
      );
      continue;
    }

    const srcBuf = readFileSync(srcPath);
    const srcHash = hash(srcBuf);

    if (existsSync(dstPath)) {
      const dstBuf = readFileSync(dstPath);
      const dstHash = hash(dstBuf);
      if (srcHash === dstHash) {
        report.unchanged++;
        if (args.verbose) lines.push(`  unchanged  ${asset.dst}`);
        continue;
      }
      if (args.strict) {
        report.conflicts++;
        lines.push(
          `  CONFLICT  ${asset.dst} (differs from source; --strict refuses overwrite)`,
        );
        continue;
      }
      if (args.dryRun) {
        report.overwritten++;
        lines.push(`  (dry-run) overwrite  ${asset.dst}`);
        continue;
      }
      writeFileSync(dstPath, srcBuf);
      report.overwritten++;
      lines.push(`  overwrite  ${asset.dst}`);
      continue;
    }

    // Target missing — fresh copy.
    if (args.dryRun) {
      report.copied++;
      lines.push(`  (dry-run) copy  ${asset.dst}`);
      continue;
    }
    writeFileSync(dstPath, srcBuf);
    report.copied++;
    lines.push(`  copied  ${asset.dst}`);
  }

  const total =
    report.copied +
    report.unchanged +
    report.overwritten +
    report.skipped +
    report.missingSources +
    report.conflicts;
  const summary =
    `sync-assets: target=${target}  (${total} asset${total === 1 ? "" : "s"})\n` +
    `  copied=${report.copied}  unchanged=${report.unchanged}  overwritten=${report.overwritten}` +
    `  skipped=${report.skipped}  conflicts=${report.conflicts}  missing-sources=${report.missingSources}\n`;

  process.stdout.write(summary);
  if (args.verbose || report.conflicts || report.missingSources) {
    process.stdout.write(lines.join("\n") + (lines.length ? "\n" : ""));
  }

  if (report.missingSources > 0) return 1;
  if (args.strict && report.conflicts > 0) return 1;
  return 0;
}

const isDirect =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("sync-assets.js") ||
    process.argv[1].endsWith("sync-assets"));
if (isDirect) {
  process.exit(main());
}

export { main, SYNC_MANIFEST };
