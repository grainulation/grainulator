/**
 * basic.test.js — Smoke tests for silo
 *
 * Runs with plain Node.js (node:test + node:assert).
 * Zero test framework dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Store } from "../lib/store.js";
import { Search } from "../lib/search.js";
import { ImportExport } from "../lib/import-export.js";
import { Templates } from "../lib/templates.js";
import { Packs } from "../lib/packs.js";
import { Graph } from "../lib/graph.js";
import { Confluence } from "../lib/confluence.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(os.tmpdir(), `silo-test-${Date.now()}`);

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe("Store", () => {
  let store;
  before(() => {
    cleanup();
    store = new Store(path.join(TEST_DIR, "silo")).init();
  });
  after(cleanup);

  it("creates directory structure on init", () => {
    assert.ok(fs.existsSync(store.root));
    assert.ok(fs.existsSync(store.claimsDir));
    assert.ok(fs.existsSync(store.templatesDir));
    assert.ok(fs.existsSync(store.packsDir));
    assert.ok(fs.existsSync(store.indexPath));
  });

  it("stores and retrieves claims", () => {
    const claims = [
      {
        id: "c001",
        type: "constraint",
        content: "Must use TLS 1.2+",
        tags: ["security"],
      },
      {
        id: "c002",
        type: "risk",
        content: "Latency may spike under load",
        tags: ["performance"],
      },
    ];
    const entry = store.storeClaims("test-claims", claims);
    assert.equal(entry.id, "test-claims");
    assert.equal(entry.claimCount, 2);

    const retrieved = store.getClaims("test-claims");
    assert.ok(retrieved);
    assert.equal(retrieved.claims.length, 2);
    assert.equal(retrieved.claims[0].content, "Must use TLS 1.2+");
  });

  it("lists stored collections", () => {
    const list = store.list();
    assert.ok(list.length >= 1);
    assert.ok(list.some((c) => c.id === "test-claims"));
  });

  it("removes a collection", () => {
    store.storeClaims("to-remove", [{ id: "x", content: "temp" }]);
    assert.ok(store.getClaims("to-remove"));
    store.remove("to-remove");
    assert.equal(store.getClaims("to-remove"), null);
  });
});

describe("Search", () => {
  let store, search;
  before(() => {
    store = new Store(path.join(TEST_DIR, "silo-search")).init();
    store.storeClaims("security-pack", [
      {
        id: "s001",
        type: "constraint",
        evidence: "documented",
        content: "All data must be encrypted at rest",
        tags: ["encryption"],
      },
      {
        id: "s002",
        type: "risk",
        evidence: "web",
        content: "TLS certificate rotation may cause downtime",
        tags: ["tls"],
      },
      {
        id: "s003",
        type: "constraint",
        evidence: "documented",
        content: "Passwords must be hashed with bcrypt or argon2",
        tags: ["auth"],
      },
    ]);
    search = new Search(store);
  });

  it("finds claims by text search", () => {
    const results = search.query("encrypted");
    assert.ok(results.length >= 1);
    assert.ok(results[0].claim.content.includes("encrypted"));
  });

  it("filters by type", () => {
    const results = search.query("encrypted", { type: "risk" });
    assert.equal(results.length, 0);
  });

  it("returns empty for no matches", () => {
    const results = search.query("quantum blockchain");
    assert.equal(results.length, 0);
  });
});

describe("ImportExport", () => {
  let store, io;
  before(() => {
    store = new Store(path.join(TEST_DIR, "silo-io")).init();
    io = new ImportExport(store);
  });

  it("pulls built-in pack claims into a target file", () => {
    const targetPath = path.join(TEST_DIR, "target-claims.json");
    fs.writeFileSync(targetPath, "[]");
    const result = io.pull("compliance", targetPath);
    assert.ok(result.imported > 0);

    const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    assert.ok(written.length > 0);
    assert.ok(written[0].importedFrom === "compliance");
  });

  it("deduplicates on repeated pulls", () => {
    const targetPath = path.join(TEST_DIR, "target-dedup.json");
    fs.writeFileSync(targetPath, "[]");
    io.pull("compliance", targetPath);
    const first = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    io.pull("compliance", targetPath);
    const second = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    assert.equal(first.length, second.length);
  });

  it("normalizes legacy tier/text to evidence/content on pull", () => {
    // Store claims using legacy field names
    store.storeClaims("legacy-pack", [
      {
        id: "leg001",
        type: "constraint",
        tier: "documented",
        text: "Legacy claim with old fields",
        tags: ["test"],
      },
    ]);
    const targetPath = path.join(TEST_DIR, "target-legacy.json");
    fs.writeFileSync(targetPath, "[]");
    io.pull("legacy-pack", targetPath);
    const claims = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    assert.ok(claims.length > 0);
    const claim = claims[0];
    // Should have wheat-canonical fields
    assert.equal(claim.evidence, "documented");
    assert.equal(claim.content, "Legacy claim with old fields");
    // Should NOT have legacy fields
    assert.equal(claim.tier, undefined);
    assert.equal(claim.text, undefined);
    // Should have all required wheat fields
    assert.ok("source" in claim && typeof claim.source === "object");
    assert.ok("status" in claim);
    assert.ok("phase_added" in claim);
    assert.ok("timestamp" in claim);
    assert.ok("conflicts_with" in claim);
    assert.ok("tags" in claim);
  });

  it("imported pack claims have wheat-canonical schema", () => {
    const targetPath = path.join(TEST_DIR, "target-schema.json");
    fs.writeFileSync(targetPath, "[]");
    io.pull("compliance", targetPath);
    const claims = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    for (const claim of claims) {
      assert.ok(claim.content, `claim ${claim.id} missing content`);
      assert.ok(claim.evidence, `claim ${claim.id} missing evidence`);
      assert.equal(
        claim.text,
        undefined,
        `claim ${claim.id} still has legacy text`,
      );
      assert.equal(
        claim.tier,
        undefined,
        `claim ${claim.id} still has legacy tier`,
      );
      assert.ok(
        typeof claim.source === "object",
        `claim ${claim.id} source should be object`,
      );
    }
  });

  it("stores claims from a file (push)", () => {
    const sourcePath = path.join(TEST_DIR, "source.json");
    fs.writeFileSync(
      sourcePath,
      JSON.stringify([
        { id: "p001", type: "factual", content: "Node.js is single-threaded" },
      ]),
    );
    const entry = io.push(sourcePath, "node-facts");
    assert.equal(entry.claimCount, 1);
    assert.ok(store.getClaims("node-facts"));
  });
});

describe("Templates", () => {
  let store, tmpl;
  before(() => {
    store = new Store(path.join(TEST_DIR, "silo-tmpl")).init();
    tmpl = new Templates(store);
  });

  it("saves and retrieves a template", () => {
    tmpl.save("Database Migration", {
      question: "Should we migrate from Postgres to CockroachDB?",
      audience: "Engineering team",
      constraints: ["Zero downtime", "No data loss"],
      seedClaims: [
        { type: "constraint", content: "Migration must be reversible" },
      ],
      tags: ["database", "migration"],
    });

    const retrieved = tmpl.get("database-migration");
    assert.ok(retrieved);
    assert.equal(
      retrieved.question,
      "Should we migrate from Postgres to CockroachDB?",
    );
    assert.equal(retrieved.seedClaims.length, 1);
  });

  it("lists templates", () => {
    const list = tmpl.list();
    assert.ok(list.length >= 1);
    assert.ok(list.some((t) => t.id === "database-migration"));
  });

  it("instantiates a template into a directory", () => {
    const dir = path.join(TEST_DIR, "new-sprint");
    const result = tmpl.instantiate("database-migration", dir);
    assert.ok(fs.existsSync(result.claimsFile));
    assert.ok(fs.existsSync(result.configFile));
    assert.equal(result.seedClaims, 1);
  });
});

describe("Packs", () => {
  let packsMgr;
  before(() => {
    const store = new Store(path.join(TEST_DIR, "silo-packs")).init();
    packsMgr = new Packs(store);
  });

  it("lists built-in packs", () => {
    const list = packsMgr.list();
    assert.ok(list.length >= 3);
    const ids = list.map((p) => p.id);
    assert.ok(ids.includes("compliance"));
    assert.ok(ids.includes("migration"));
    assert.ok(ids.includes("architecture"));
  });

  it("retrieves a built-in pack", () => {
    const pack = packsMgr.get("compliance");
    assert.ok(pack);
    assert.ok(pack.claims.length > 0);
    assert.equal(pack.name, "Compliance Constraints");
  });

  it("installs a pack from file", () => {
    const packFile = path.join(TEST_DIR, "custom-pack.json");
    fs.writeFileSync(
      packFile,
      JSON.stringify({
        name: "Custom Pack",
        claims: [{ id: "x001", content: "test claim" }],
      }),
    );
    const result = packsMgr.install(packFile);
    assert.equal(result.id, "custom-pack");
    assert.equal(result.claimCount, 1);
  });
});

describe("Graph", () => {
  let store, graphIndex;
  before(() => {
    store = new Store(path.join(TEST_DIR, "silo-graph")).init();
    store.storeClaims("sprint-a", [
      {
        id: "a001",
        type: "constraint",
        topic: "encryption",
        content: "Must use AES-256",
        tags: ["security", "encryption"],
      },
      {
        id: "a002",
        type: "risk",
        topic: "encryption",
        content: "Key rotation may cause downtime",
        tags: ["security", "encryption"],
        conflicts_with: [],
      },
      {
        id: "a003",
        type: "factual",
        topic: "performance",
        content: "P99 latency is 200ms",
        tags: ["performance"],
      },
    ]);
    store.storeClaims("sprint-b", [
      {
        id: "b001",
        type: "constraint",
        topic: "encryption",
        content: "TLS 1.3 required for transit",
        tags: ["security", "encryption", "tls"],
      },
      {
        id: "b002",
        type: "recommendation",
        topic: "caching",
        content: "Use Redis for session cache",
        tags: ["performance", "caching"],
      },
    ]);
    graphIndex = new Graph(store);
  });

  it("builds graph and reports stats", () => {
    const stats = graphIndex.build();
    assert.ok(stats.nodes >= 5);
    assert.ok(stats.edges > 0);
    assert.ok(stats.topics >= 2);
    assert.ok(stats.sources >= 2);
  });

  it("finds related claims by topic", () => {
    const results = graphIndex.byTopic("encryption");
    assert.ok(results.length >= 3);
    assert.ok(results.every((r) => r.claim.topic.includes("encryption")));
  });

  it("finds related claims by tag", () => {
    const results = graphIndex.byTag("security");
    assert.ok(results.length >= 3);
  });

  it("finds neighbors via related()", () => {
    // a001 and b001 share topic 'encryption' — should be related
    const results = graphIndex.related("sprint-a:a001");
    assert.ok(results.length >= 1);
    assert.ok(
      results.some(
        (r) => r.relation === "same-topic" || r.relation === "shared-tag",
      ),
    );
  });

  it("finds clusters", () => {
    const clusters = graphIndex.clusters(2);
    assert.ok(clusters.length >= 1);
    assert.ok(clusters[0].claimCount >= 2);
  });

  it("exports as JSON", () => {
    const json = graphIndex.toJSON();
    assert.ok(json.nodes.length >= 5);
    assert.ok(json.edges.length > 0);
    assert.ok(json.stats);
    assert.ok(json.builtAt);
  });

  it("searches for prior art across sprints", () => {
    const results = graphIndex.search("encryption security");
    assert.ok(results.length >= 2);
    assert.ok(
      results[0].score >= results[1].score,
      "results should be sorted by score",
    );
    assert.ok(results[0].textScore > 0);
    assert.ok(results.every((r) => r.source && r.sourceType));
  });

  it("search returns empty for no matches", () => {
    const results = graphIndex.search("quantum blockchain");
    assert.equal(results.length, 0);
  });

  it("search filters by type", () => {
    const results = graphIndex.search("encryption", { type: "constraint" });
    assert.ok(results.length >= 1);
    assert.ok(results.every((r) => r.claim.type === "constraint"));
  });

  it("search filters by sourceType", () => {
    const results = graphIndex.search("encryption", {
      sourceType: "collection",
    });
    assert.ok(results.length >= 1);
    assert.ok(results.every((r) => r.sourceType === "collection"));
  });
});

describe("Confluence", () => {
  it("reports unconfigured when no env vars set", () => {
    const c = new Confluence();
    assert.equal(c.isConfigured(), false);
  });

  it("reports configured with explicit opts", () => {
    const c = new Confluence({
      baseUrl: "https://test.atlassian.net/wiki",
      token: "tok",
      email: "a@b.com",
    });
    assert.equal(c.isConfigured(), true);
  });

  it("throws on publish when not configured", async () => {
    const c = new Confluence();
    await assert.rejects(() => c.publish("Test", []), /not configured/);
  });

  it("generates and parses Confluence storage format", () => {
    const c = new Confluence({
      baseUrl: "https://test.atlassian.net/wiki",
      token: "tok",
      email: "a@b.com",
    });
    const claims = [
      {
        id: "c001",
        type: "constraint",
        topic: "encryption",
        content: "Must use AES-256",
        evidence: "documented",
        source: { origin: "regulation", artifact: null, connector: null },
        tags: ["security"],
      },
      {
        id: "c002",
        type: "risk",
        topic: "latency",
        content: "P99 may spike > 500ms",
        evidence: "web",
        source: { origin: "research", artifact: null, connector: null },
        tags: ["performance", "sla"],
      },
    ];
    const html = c._claimsToStorageFormat("Test Pack", claims);
    assert.ok(html.includes("Must use AES-256"));
    assert.ok(html.includes("silo-meta"));

    const parsed = c._parseStorageFormat(html);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].id, "c001");
    assert.equal(parsed[0].content, "Must use AES-256");
    assert.equal(parsed[0].evidence, "documented");
    assert.equal(parsed[1].type, "risk");
    assert.ok(parsed[1].tags.includes("performance"));
  });
});

describe("Enterprise Packs", () => {
  let packsMgr;
  before(() => {
    const store = new Store(path.join(TEST_DIR, "silo-ent-packs")).init();
    packsMgr = new Packs(store);
  });

  it("includes vendor-eval pack", () => {
    const pack = packsMgr.get("vendor-eval");
    assert.ok(pack);
    assert.ok(pack.claims.length >= 10);
    assert.equal(pack.name, "Vendor Evaluation Framework");
  });

  it("includes adr pack", () => {
    const pack = packsMgr.get("adr");
    assert.ok(pack);
    assert.ok(pack.claims.length >= 10);
    assert.equal(pack.name, "Architecture Decision Records");
  });

  it("includes hackathon category packs", () => {
    const ids = [
      "hackathon-most-rigorous",
      "hackathon-most-innovative",
      "hackathon-business-impact",
      "hackathon-best-ai",
    ];
    for (const id of ids) {
      const pack = packsMgr.get(id);
      assert.ok(pack, `Pack ${id} not found`);
      assert.ok(pack.claims.length >= 8, `Pack ${id} has fewer than 8 claims`);
    }
  });

  it("all pack claims have wheat-canonical schema", () => {
    const ids = [
      "vendor-eval",
      "adr",
      "hackathon-most-rigorous",
      "hackathon-best-ai",
    ];
    for (const id of ids) {
      const pack = packsMgr.get(id);
      for (const c of pack.claims) {
        assert.ok(c.id, `${id}: claim missing id`);
        assert.ok(c.type, `${id}: claim ${c.id} missing type`);
        assert.ok(c.content, `${id}: claim ${c.id} missing content`);
        assert.ok(c.evidence, `${id}: claim ${c.id} missing evidence`);
        assert.ok(c.tags, `${id}: claim ${c.id} missing tags`);
        assert.ok(
          typeof c.source === "object",
          `${id}: claim ${c.id} source should be object`,
        );
      }
    }
  });

  it("includes vendor-evaluation enterprise pack", () => {
    const pack = packsMgr.get("vendor-evaluation");
    assert.ok(pack);
    assert.ok(pack.claims.length >= 8);
    assert.equal(pack.name, "Vendor Evaluation (Enterprise)");
  });

  it("includes architecture-decision enterprise pack", () => {
    const pack = packsMgr.get("architecture-decision");
    assert.ok(pack);
    assert.ok(pack.claims.length >= 8);
    assert.equal(pack.name, "Architecture Decision (Enterprise)");
  });

  it("includes incident-postmortem pack", () => {
    const pack = packsMgr.get("incident-postmortem");
    assert.ok(pack);
    assert.ok(pack.claims.length >= 10);
    assert.equal(pack.name, "Incident Postmortem");
    // Should cover key postmortem topics
    const topics = pack.claims.map((c) => c.topic);
    assert.ok(topics.some((t) => t.includes("root cause")));
    assert.ok(topics.some((t) => t.includes("action items")));
  });

  it("includes hackathon-sprint-boost pack with correct weights", () => {
    const pack = packsMgr.get("hackathon-sprint-boost");
    assert.ok(pack);
    assert.ok(pack.judging);
    assert.equal(pack.judging.weights.impact, 0.4);
    assert.equal(pack.judging.weights.rigor, 0.3);
    assert.equal(pack.judging.weights.creativity, 0.3);
  });

  it("includes hackathon-innovation pack with correct weights", () => {
    const pack = packsMgr.get("hackathon-innovation");
    assert.ok(pack);
    assert.ok(pack.judging);
    assert.equal(pack.judging.weights.creativity, 0.3);
    assert.equal(pack.judging.weights.novelty, 0.25);
    assert.equal(pack.judging.weights.evidence, 0.25);
    assert.equal(pack.judging.weights.feasibility, 0.2);
  });

  it("new enterprise pack claims have wheat-canonical schema", () => {
    const ids = [
      "vendor-evaluation",
      "architecture-decision",
      "incident-postmortem",
      "hackathon-sprint-boost",
      "hackathon-innovation",
    ];
    for (const id of ids) {
      const pack = packsMgr.get(id);
      assert.ok(pack, `Pack ${id} not found`);
      for (const c of pack.claims) {
        assert.ok(c.id, `${id}: claim missing id`);
        assert.ok(c.type, `${id}: claim ${c.id} missing type`);
        assert.ok(c.content, `${id}: claim ${c.id} missing content`);
        assert.ok(c.evidence, `${id}: claim ${c.id} missing evidence`);
        assert.ok(c.tags, `${id}: claim ${c.id} missing tags`);
        assert.ok(
          typeof c.source === "object",
          `${id}: claim ${c.id} source should be object`,
        );
      }
    }
  });
});

describe("CLI", () => {
  const cli = path.join(__dirname, "..", "bin", "silo.js");

  it("prints help with no args", () => {
    const output = execFileSync("node", [cli], { encoding: "utf-8" });
    assert.ok(output.includes("reusable knowledge"));
  });

  it("lists packs including new enterprise and hackathon packs", () => {
    const output = execFileSync("node", [cli, "packs"], { encoding: "utf-8" });
    assert.ok(output.includes("compliance"));
    assert.ok(output.includes("migration"));
    assert.ok(output.includes("architecture"));
    assert.ok(output.includes("vendor-eval"));
    assert.ok(output.includes("adr"));
    assert.ok(output.includes("hackathon-most-rigorous"));
    assert.ok(output.includes("hackathon-best-ai"));
  });

  it("pulls compliance pack into a file", () => {
    const target = path.join(TEST_DIR, "cli-target.json");
    fs.writeFileSync(target, "[]");
    const output = execFileSync(
      "node",
      [cli, "pull", "compliance", "--into", target],
      { encoding: "utf-8" },
    );
    assert.ok(output.includes("Imported"));
    const claims = JSON.parse(fs.readFileSync(target, "utf-8"));
    assert.ok(claims.length > 0);
  });

  it("runs graph stats command", () => {
    const output = execFileSync("node", [cli, "graph", "stats"], {
      encoding: "utf-8",
    });
    assert.ok(output.includes("nodes"));
    assert.ok(output.includes("edges"));
  });

  it("pulls vendor-eval pack into a file", () => {
    const target = path.join(TEST_DIR, "cli-vendor-target.json");
    fs.writeFileSync(target, "[]");
    const output = execFileSync(
      "node",
      [cli, "pull", "vendor-eval", "--into", target],
      { encoding: "utf-8" },
    );
    assert.ok(output.includes("Imported"));
    const claims = JSON.parse(fs.readFileSync(target, "utf-8"));
    assert.ok(claims.length >= 10);
  });
});
