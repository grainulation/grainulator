#!/usr/bin/env node

/**
 * grainulator memory — CLI for storing and sharing reusable research knowledge
 *
 * Usage:
 *   grainulator memory list                          List all stored collections and packs
 *   grainulator memory pull <pack> --into <file>     Pull claims from a pack into a claims file
 *   grainulator memory store <name> --from <file>    Store claims from a file into memory
 *   grainulator memory search <query>                Search across all stored claims
 *   grainulator memory publish <name> --collections <ids...>  Bundle collections into a pack
 *   grainulator memory packs                         List available knowledge packs
 *   grainulator memory templates                     List available sprint templates
 *   grainulator memory serve [--port 9095]           Start the knowledge browser UI
 *   grainulator memory analyze                        Run cross-library analytics (uses the analytics component)
 *   grainulator memory serve-mcp                     Start the MCP server on stdio
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../lib/store.js";
import { Search } from "../lib/search.js";
import { ImportExport } from "../lib/import-export.js";
import { Templates } from "../lib/templates.js";
import { Packs } from "../lib/packs.js";
import { Graph } from "../lib/graph.js";
import { setVerbose, vlog as barnVlog } from "../../shared/lib/cli.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── --version / -v (before verbose check) ──
if (
  process.argv.includes("--version") ||
  (process.argv.includes("-v") && process.argv.length === 3)
) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
  );
  process.stdout.write(pkg.version + "\n");
  process.exit(0);
}

const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");
setVerbose(verbose);
const vlog = (...a) => barnVlog("grainulator memory:", ...a);

const memoryDirIndex = process.argv.indexOf("--memory-dir");
const memoryDir = memoryDirIndex >= 0 ? process.argv[memoryDirIndex + 1] : undefined;
if (memoryDirIndex >= 0 && (!memoryDir || memoryDir.startsWith("--"))) {
  console.error("grainulator memory: --memory-dir requires a path"); process.exit(1);
}
const store = new Store(memoryDir);
const search = new Search(store);
const io = new ImportExport(store);
const templates = new Templates(store);
const packs = new Packs(store);

const args = process.argv.slice(2);
const command = args[0];

vlog("startup", `command=${command || "(none)"}`, `cwd=${process.cwd()}`);

const jsonMode = args.includes("--json");

function flag(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || true;
}

function flagList(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return [];
  const values = [];
  for (let i = idx + 1; i < args.length; i++) {
    if (args[i].startsWith("--")) break;
    values.push(args[i]);
  }
  return values;
}

function print(obj) {
  if (typeof obj === "string") {
    process.stdout.write(obj + "\n");
  } else {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  }
}

function usage() {
  print(`grainulator memory -- reusable knowledge for research sprints

Commands:
  list                              List all stored collections and packs
  pull <pack> --into <file> [--filter <ids>]  Pull claims (optionally filter by ID)
  store <name> --from <file>        Store claims from a file into memory
  search <query> [--type <type>]    Search across all stored claims
  publish <name> --collections <ids...>  Bundle collections into a pack
  packs                             List available knowledge packs
  templates                         List available sprint templates
  install <file>                    Install a pack from a file
  graph [stats|related|topic|clusters|export]  Knowledge graph operations
  analyze                            Run cross-library analytics (uses the analytics component)
  serve [--port 9095]               Start the knowledge browser UI
  serve-mcp                         Start the MCP server on stdio
  fetch <url> [--mode auto|concise|full|meta-only] [--no-cache] [--privacy]
                                    Size-efficient fetch with semantic extraction
  cache <stats|clear|purge <domain>>
                                    Manage the smart-fetch cache

Examples:
  grainulator memory pull compliance --into ./claims.json
  grainulator memory search "encryption" --type constraint
  grainulator memory store "my-findings" --from ./claims.json
  grainulator memory serve --port 9095
  grainulator memory fetch https://example.com/article --mode concise
  grainulator memory cache stats
  grainulator memory packs

Storage:
  --memory-dir <path> overrides GRAINULATOR_MEMORY_DIR and legacy SILO_STORE.
  CLI and MCP share the same default store.`);
}

try {
  switch (command) {
    case "list": {
      const collections = store.list();
      if (jsonMode) {
        print(JSON.stringify(collections));
        break;
      }
      if (collections.length === 0) {
        print(
          'No stored collections. Use "grainulator memory store" to save claims or "grainulator memory packs" to see built-in packs.',
        );
      } else {
        print("Stored collections:\n");
        for (const c of collections) {
          print(
            `  ${c.id}  (${c.type || "claims"}, ${c.claimCount} claims)  ${c.storedAt || ""}`,
          );
        }
      }
      break;
    }

    case "pull": {
      const source = args[1];
      const into = flag("into");
      if (!source || !into) {
        print("Usage: grainulator memory pull <pack> --into <file>");
        process.exit(1);
      }
      const dryRun = args.includes("--dry-run");
      const types = flagList("type");
      const filterIds = flag("filter");
      const ids = filterIds
        ? filterIds.split(",").map((s) => s.trim())
        : undefined;
      const result = io.pull(source, into, {
        types: types.length ? types : undefined,
        ids,
        dryRun,
      });
      if (dryRun) {
        print(`Dry run: would import ${result.wouldImport} claims`);
        print(result.claims);
      } else {
        print(
          `Imported ${result.imported} claims into ${into} (${result.skippedDuplicates} duplicates skipped, ${result.totalClaims} total)`,
        );
      }
      break;
    }

    case "store": {
      const name = args[1];
      const from = flag("from");
      if (!name || !from) {
        print("Usage: grainulator memory store <name> --from <file>");
        process.exit(1);
      }
      const result = io.push(from, name);
      print(
        `Stored "${name}" (${result.claimCount} claims, hash: ${result.hash})`,
      );
      break;
    }

    case "search": {
      const queryWords = [];
      const valueFlags = new Set(["--type", "--evidence", "--tier", "--memory-dir"]);
      for (let i = 1; i < args.length; i++) {
        if (valueFlags.has(args[i])) { i++; continue; }
        if (!args[i].startsWith("--")) queryWords.push(args[i]);
      }
      const query = queryWords.join(" ");
      if (!query) {
        print("Usage: grainulator memory search <query> [--type <type>] [--evidence <tier>]");
        process.exit(1);
      }
      const type = flag("type");
      const tier = flag("evidence") || flag("tier");
      const results = search.query(query, { type, tier });
      if (jsonMode) {
        print(JSON.stringify(results));
        break;
      }
      if (results.length === 0) {
        print("No matches found.");
      } else {
        print(`${results.length} result(s):\n`);
        for (const r of results) {
          const text = r.claim.content || r.claim.text || "";
          const tier = r.claim.evidence || r.claim.tier || "unknown";
          print(
            `  [${r.claim.id}] (${r.claim.type}, ${tier}) ${text.slice(0, 120)}${text.length > 120 ? "..." : ""}`,
          );
          print(`    from: ${r.collection}  score: ${r.score}\n`);
        }
      }
      break;
    }

    case "publish": {
      const name = args[1];
      const collections = flagList("collections");
      if (!name || collections.length === 0) {
        print("Usage: grainulator memory publish <name> --collections <id1> <id2> ...");
        process.exit(1);
      }
      const desc = flag("description") || "";
      const result = packs.bundle(name, collections, { description: desc });
      print(
        `Published pack "${name}" (${result.claimCount} claims) -> ${result.path}`,
      );
      break;
    }

    case "packs": {
      const allPacks = packs.list();
      if (jsonMode) {
        print(JSON.stringify(allPacks));
        break;
      }
      if (allPacks.length === 0) {
        print("No packs available.");
      } else {
        print("Available packs:\n");
        for (const p of allPacks) {
          print(
            `  ${p.id}  ${p.name}  (${p.claimCount} claims, v${p.version}, ${p.source})`,
          );
          if (p.description) print(`    ${p.description.slice(0, 100)}`);
          print("");
        }
      }
      break;
    }

    case "templates": {
      const allTemplates = templates.list();
      if (jsonMode) {
        print(JSON.stringify(allTemplates));
        break;
      }
      if (allTemplates.length === 0) {
        print("No templates saved yet. Use the Templates API to create them.");
      } else {
        for (const t of allTemplates) {
          print(
            `  ${t.id}  "${t.question || t.name}"  (${t.seedClaims} seed claims)  [${t.tags.join(", ")}]`,
          );
        }
      }
      break;
    }

    case "install": {
      const filePath = args[1];
      if (!filePath) {
        print("Usage: grainulator memory install <pack-file.json>");
        process.exit(1);
      }
      const result = packs.install(filePath);
      print(`Installed pack "${result.id}" (${result.claimCount} claims)`);
      break;
    }

    case "analyze": {
      const { analyzeLibrary } = await import("../lib/analytics.js");
      const result = await analyzeLibrary(store);
      if (jsonMode) {
        print(JSON.stringify(result));
        break;
      }
      if (!result.available) {
        print(
          `grainulator memory analyze: bundled analytics component is missing. Run grainulator doctor to check this installation.`,
        );
        process.exit(1);
      }
      if (!result.analysis) {
        print(`grainulator memory analyze: ${result.reason || "no data to analyze"}`);
        break;
      }
      print(
        `Cross-library analytics (${result.collectionCount} collection(s)):\n`,
      );
      const analysis = result.analysis;
      if (analysis.typeDistribution) {
        print("Type distribution:");
        for (const [type, count] of Object.entries(analysis.typeDistribution)) {
          print(`  ${type}: ${count}`);
        }
        print("");
      }
      if (analysis.evidenceQuality) {
        print("Evidence quality:");
        for (const [tier, count] of Object.entries(analysis.evidenceQuality)) {
          print(`  ${tier}: ${count}`);
        }
        print("");
      }
      // Print any other top-level keys from the analysis
      for (const [key, value] of Object.entries(analysis)) {
        if (key === "typeDistribution" || key === "evidenceQuality") continue;
        if (typeof value === "object") {
          print(`${key}: ${JSON.stringify(value, null, 2)}`);
        } else {
          print(`${key}: ${value}`);
        }
      }
      break;
    }

    case "graph": {
      const graph = new Graph(store);
      const action = args[1] || "stats";
      const stats = graph.build();

      if (action === "stats") {
        if (jsonMode) {
          print(JSON.stringify(stats));
          break;
        }
        print(
          `Knowledge graph: ${stats.nodes} nodes, ${stats.edges} edges, ${stats.sources} sources, ${stats.topics} topics, ${stats.tags} tags`,
        );
      } else if (action === "related") {
        const claimId = args[2];
        if (!claimId) {
          print("Usage: grainulator memory graph related <claimId>");
          process.exit(1);
        }
        const results = graph.related(claimId, { limit: 20 });
        if (jsonMode) {
          print(JSON.stringify(results));
          break;
        }
        if (results.length === 0) {
          print("No related claims found.");
          break;
        }
        print(`${results.length} related claim(s):\n`);
        for (const r of results) {
          print(
            `  [${r.claim.id}] (${r.relation}, w=${r.weight}) ${(r.claim.content || "").slice(0, 100)}`,
          );
          print(`    from: ${r.source}\n`);
        }
      } else if (action === "topic") {
        const topic = args
          .slice(2)
          .filter((a) => !a.startsWith("--"))
          .join(" ");
        if (!topic) {
          print("Usage: grainulator memory graph topic <topic>");
          process.exit(1);
        }
        const results = graph.byTopic(topic);
        if (jsonMode) {
          print(JSON.stringify(results));
          break;
        }
        if (results.length === 0) {
          print("No claims found for this topic.");
          break;
        }
        print(`${results.length} claim(s) for topic "${topic}":\n`);
        for (const r of results) {
          print(
            `  [${r.claim.id}] (${r.claim.type}) ${(r.claim.content || "").slice(0, 100)}`,
          );
          print(`    from: ${r.source}\n`);
        }
      } else if (action === "clusters") {
        const clusters = graph.clusters(parseInt(flag("min-size")) || 3);
        if (jsonMode) {
          print(JSON.stringify(clusters));
          break;
        }
        if (clusters.length === 0) {
          print("No clusters found.");
          break;
        }
        print(`${clusters.length} cluster(s):\n`);
        for (const c of clusters.slice(0, 20)) {
          print(
            `  "${c.topic}" — ${c.claimCount} claims, ${c.edgeCount} edges`,
          );
        }
      } else if (action === "export") {
        print(JSON.stringify(graph.toJSON(), null, 2));
      } else {
        print(
          `Unknown graph action: ${action}. Use: stats, related, topic, clusters, export`,
        );
        process.exit(1);
      }
      break;
    }

    case "serve-mcp": {
      const serveMcp = await import("../lib/serve-mcp.js");
      serveMcp.run(process.cwd());
      break;
    }

    case "fetch": {
      const url = process.argv[3];
      if (!url || !/^https?:\/\//i.test(url)) {
        print(`grainulator memory: fetch requires an absolute http(s) URL\n`);
        print(
          `Usage: grainulator memory fetch <url> [--mode auto|concise|full|meta-only] [--no-cache] [--privacy]`,
        );
        process.exit(1);
      }
      const mode = flag("mode") || "auto";
      const noCache = process.argv.includes("--no-cache");
      const privacy = process.argv.includes("--privacy");
      const { smartFetch } = await import("../lib/smart-fetch.js");
      smartFetch(url, {
        mode,
        cache: !noCache,
        privacy,
      })
        .then((r) => {
          if (flag("json") || process.argv.includes("--json")) {
            print(r);
            return;
          }
          process.stdout.write(
            `URL:        ${r.url}\n` +
              `Status:     ${r.ok ? "OK" : "FAILED"} (HTTP ${r.status || "?"})\n` +
              `Quality:    ${r.quality}\n` +
              `Mode used:  ${r.mode_used || mode}\n` +
              `Title:      ${r.title || ""}\n` +
              `Description:${r.description ? " " + r.description.slice(0, 200) : ""}\n` +
              `Size:       ${r.size?.full || 0} → ${r.size?.extracted || 0} (${r.reduction_pct || 0}% reduction)\n` +
              `Cached:     ${r.cached ? "yes (hit)" : "no"}\n` +
              `Elapsed:    ${r.elapsed_ms}ms\n` +
              (r.warnings?.length
                ? `Warnings:   ${r.warnings.join(", ")}\n`
                : "") +
              `\n--- Content ---\n${r.content || "(empty)"}\n`,
          );
          process.exit(r.ok ? 0 : 1);
        })
        .catch((err) => {
          process.stderr.write(`grainulator memory: fetch error: ${err.message}\n`);
          process.exit(1);
        });
      break;
    }

    case "cache": {
      const subcommand = process.argv[3];
      const { FetchCache } = await import("../lib/fetch-cache.js");
      const cache = new FetchCache();
      switch (subcommand) {
        case "stats": {
          const stats = cache.stats();
          const mb = (n) => (n / (1024 * 1024)).toFixed(2);
          const days = stats.oldest_ms
            ? ((Date.now() - stats.oldest_ms) / (1000 * 60 * 60 * 24)).toFixed(
                1,
              )
            : null;
          process.stdout.write(
            `grainulator memory smart-fetch cache:\n` +
              `  entries:   ${stats.entries} / ${stats.max_entries}\n` +
              `  size:      ${mb(stats.total_bytes)} MB / ${mb(stats.max_bytes)} MB\n` +
              `  ttl:       ${stats.ttl_ms / (1000 * 60 * 60 * 24)} days\n` +
              (days !== null ? `  oldest:    ${days} days old\n` : "") +
              `  directory: ${cache.dir}\n`,
          );
          break;
        }
        case "clear": {
          const removed = cache.clear();
          process.stdout.write(`grainulator memory: cleared ${removed} cache file(s)\n`);
          break;
        }
        case "purge": {
          const domain = process.argv[4];
          if (!domain) {
            print(`grainulator memory: cache purge requires a domain\n`);
            print(`Usage: grainulator memory cache purge <domain>`);
            process.exit(1);
          }
          const removed = cache.purgeDomain(domain);
          process.stdout.write(
            `grainulator memory: purged ${removed} entries matching ${domain}\n`,
          );
          break;
        }
        default:
          print(
            `grainulator memory: cache subcommand required: stats, clear, or purge <domain>`,
          );
          process.exit(1);
      }
      break;
    }

    case "serve": {
      // Dynamic ESM import so the bin can load the server module lazily
      // and call start() in-process (no child fork). The server's start()
      // factory contains all the side-effecty code — this file picks up
      // SIGTERM/SIGINT handlers itself, so we don't need to bridge them.
      const port = parseInt(flag("port") || "9095", 10);
      const root = flag("root") || process.cwd();
      const corsOrigin = flag("cors") || null;
      import("../lib/server.js")
        .then(({ start }) => {
          start({ port, root, corsOrigin, verbose });
        })
        .catch((err) => {
          process.stderr.write(`grainulator memory: error starting server: ${err.message}\n`);
          process.exit(1);
        });
      break;
    }

    case "help":
    case "--help":
    case "-h":
    case undefined:
      usage();
      break;

    default:
      print(`grainulator memory: unknown command: ${command}\n`);
      usage();
      process.exit(1);
  }
} catch (err) {
  process.stderr.write(`grainulator memory: ${err.message}\n`);
  process.exit(1);
}
