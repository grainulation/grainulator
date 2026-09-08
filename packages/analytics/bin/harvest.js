#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { analyze } from "../lib/analyzer.js";
import { calibrate } from "../lib/calibration.js";
import { detectPatterns } from "../lib/patterns.js";
import { checkDecay, decayAlerts } from "../lib/decay.js";
import { measureVelocity } from "../lib/velocity.js";
import { generateReport } from "../lib/report.js";
import { analyzeTokens } from "../lib/tokens.js";
import { trackCosts } from "../lib/token-tracker.js";
import { generateWrapped } from "../lib/wrapped.js";
import { generateCard, generateEmbedSnippet } from "../lib/harvest-card.js";

import { setVerbose, vlog as barnVlog } from "../../shared/lib/cli.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");
setVerbose(verbose);
const vlog = (...a) => barnVlog("grainulator analytics:", ...a);

const USAGE = `
grainulator analytics -- learn from every decision you've made

Usage:
  grainulator analytics analyze <sprints-dir>       Cross-sprint claim analysis
  grainulator analytics calibrate <sprints-dir>     Score predictions against outcomes
  grainulator analytics patterns <sprints-dir>      Detect decision patterns
  grainulator analytics decay <sprints-dir>         Find claims that need refreshing
  grainulator analytics velocity <sprints-dir>      Sprint timing and phase analysis
  grainulator analytics tokens <sprints-dir>        Token cost tracking and efficiency
  grainulator analytics card <sprints-dir> [-o <output>]  Generate Analytics Report SVG card
  grainulator analytics report <sprints-dir> [-o <output>]  Generate retrospective HTML
  grainulator analytics trends <sprints-dir>        All analyses in one pass
  grainulator analytics intelligence <sprints-dir>  Full intelligence report (all features)
  grainulator analytics serve [--port 9096] [--root <sprints-dir>]  Start the analytics report UI

Options:
  -o, --output <path>   Output file path (default: stdout or ./retrospective.html)
  -h, --help            Show this help
  --json                Output as JSON instead of text
  --days <n>            Decay threshold in days (default: 90)
`.trim();

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    command: null,
    dir: null,
    output: null,
    json: false,
    days: 90,
  };

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(USAGE);
    process.exit(0);
  }

  parsed.command = args[0];
  parsed.dir =
    args[1] && !args[1].startsWith("-") ? path.resolve(args[1]) : null;

  for (let i = 2; i < args.length; i++) {
    if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
      parsed.output = path.resolve(args[++i]);
    } else if (args[i] === "--json") {
      parsed.json = true;
    } else if (args[i] === "--days" && args[i + 1]) {
      parsed.days = parseInt(args[++i], 10);
    }
  }

  return parsed;
}

function loadSprintData(dir) {
  if (!dir || !fs.existsSync(dir)) {
    console.error(`grainulator analytics: directory not found: ${dir}`);
    process.exit(1);
  }

  const sprints = [];

  // Include root if it has claims.json
  const directClaims = path.join(dir, "claims.json");
  if (fs.existsSync(directClaims)) {
    sprints.push(loadSingleSprint(dir));
  }

  // Scan subdirectories (two levels deep to catch sprints/<name>/claims.json)
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      const childDir = path.join(dir, entry.name);
      const childClaims = path.join(childDir, "claims.json");
      if (fs.existsSync(childClaims)) {
        sprints.push(loadSingleSprint(childDir));
      }
      // Second level
      try {
        const subEntries = fs.readdirSync(childDir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          if (sub.name.startsWith(".")) continue;
          const subDir = path.join(childDir, sub.name);
          const subClaims = path.join(subDir, "claims.json");
          if (fs.existsSync(subClaims)) {
            sprints.push(loadSingleSprint(subDir));
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }

  if (sprints.length === 0) {
    console.error(`grainulator analytics: no sprint data found in ${dir}`);
    console.error(
      "Expected claims.json in the directory or its subdirectories.",
    );
    process.exit(1);
  }

  return sprints;
}

function loadSingleSprint(dir) {
  const sprint = {
    name: path.basename(dir),
    dir,
    claims: [],
    compilation: null,
    gitLog: null,
  };

  const claimsPath = path.join(dir, "claims.json");
  try {
    sprint.claims = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
    if (!Array.isArray(sprint.claims)) {
      // Handle { claims: [...] } wrapper
      sprint.claims = sprint.claims.claims || [];
    }
  } catch (e) {
    console.error(`grainulator analytics: could not parse ${claimsPath}: ${e.message}`);
  }

  const compilationPath = path.join(dir, "compilation.json");
  if (fs.existsSync(compilationPath)) {
    try {
      sprint.compilation = JSON.parse(fs.readFileSync(compilationPath, "utf8"));
    } catch {
      // skip
    }
  }

  // Try to read git log for the sprint directory
  try {
    // execFile (no shell) — user-controlled cwd can't inject into argv.
    sprint.gitLog = execFileSync(
      "git",
      ["log", "--oneline", "--format=%H|%ai|%s", "--", "claims.json"],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, date, ...msg] = line.split("|");
        return { hash, date, message: msg.join("|") };
      });
  } catch {
    sprint.gitLog = [];
  }

  return sprint;
}

function output(result, opts) {
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (typeof result === "string") {
    console.log(result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  vlog(
    "startup",
    `command=${opts.command || "(none)"}`,
    `dir=${opts.dir || "none"}`,
  );

  const commands = {
    analyze() {
      const sprints = loadSprintData(opts.dir);
      const result = analyze(sprints);
      output(result, opts);
    },
    calibrate() {
      const sprints = loadSprintData(opts.dir);
      const result = calibrate(sprints);
      output(result, opts);
    },
    patterns() {
      const sprints = loadSprintData(opts.dir);
      const result = detectPatterns(sprints);
      output(result, opts);
    },
    decay() {
      const sprints = loadSprintData(opts.dir);
      const result = checkDecay(sprints, { thresholdDays: opts.days });
      output(result, opts);
    },
    velocity() {
      const sprints = loadSprintData(opts.dir);
      const result = measureVelocity(sprints);
      output(result, opts);
    },
    report() {
      const sprints = loadSprintData(opts.dir);
      const html = generateReport(sprints, {
        analyzeFn: analyze,
        calibrateFn: calibrate,
        patternsFn: detectPatterns,
        decayFn: checkDecay,
        velocityFn: measureVelocity,
        tokensFn: analyzeTokens,
        wrappedFn: generateWrapped,
      });
      const outPath =
        opts.output || path.join(process.cwd(), "retrospective.html");
      fs.writeFileSync(outPath, html, "utf8");
      console.log(`Retrospective written to ${outPath}`);
    },
    tokens() {
      const sprints = loadSprintData(opts.dir);
      const result = analyzeTokens(sprints);
      output(result, opts);
    },
    card() {
      const sprints = loadSprintData(opts.dir);
      const { svg, stats } = generateCard(sprints);

      if (opts.json) {
        output(stats, opts);
        return;
      }

      const outPath =
        opts.output || path.join(process.cwd(), "harvest-card.svg");
      fs.writeFileSync(outPath, svg, "utf8");
      const embed = generateEmbedSnippet(path.basename(outPath));
      console.log(`Analytics card written to ${outPath}`);
      console.log(`\nEmbed in README:\n  ${embed.markdown}`);
      console.log(`\nHTML:\n  ${embed.html}`);
    },
    intelligence() {
      const sprints = loadSprintData(opts.dir);
      const result = {
        analysis: analyze(sprints),
        calibration: calibrate(sprints),
        patterns: detectPatterns(sprints),
        decay: checkDecay(sprints, { thresholdDays: opts.days }),
        decayAlerts: decayAlerts(sprints),
        velocity: measureVelocity(sprints),
        tokens: analyzeTokens(sprints),
      };
      output(result, opts);
    },
    trends() {
      const sprints = loadSprintData(opts.dir);
      const result = {
        analysis: analyze(sprints),
        calibration: calibrate(sprints),
        patterns: detectPatterns(sprints),
        decay: checkDecay(sprints, { thresholdDays: opts.days }),
        velocity: measureVelocity(sprints),
      };
      output(result, opts);
    },
  };

  if (opts.command === "help") {
    console.log(USAGE);
    process.exit(0);
  }

  if (opts.command === "--version") {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
    );
    console.log(pkg.version);
    process.exit(0);
  }



  if (opts.command === "serve") {
    // Launch the ESM server module in-process via dynamic import.
    // start() installs its own SIGTERM/SIGINT handlers and crash handlers.
    const portIdx = process.argv.indexOf("--port");
    const rootIdx = process.argv.indexOf("--root");
    const corsIdx = process.argv.indexOf("--cors");
    const port =
      portIdx !== -1 && process.argv[portIdx + 1]
        ? parseInt(process.argv[portIdx + 1], 10)
        : 9096;
    const root =
      rootIdx !== -1 && process.argv[rootIdx + 1]
        ? process.argv[rootIdx + 1]
        : opts.dir || process.cwd();
    const corsOrigin =
      corsIdx !== -1 && process.argv[corsIdx + 1]
        ? process.argv[corsIdx + 1]
        : null;
    try {
      const { start } = await import("../lib/server.js");
      start({ port, root, corsOrigin, verbose });
    } catch (err) {
      console.error(`grainulator analytics: error starting server: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (!commands[opts.command]) {
    console.error(`grainulator analytics: unknown command: ${opts.command}`);
    console.error(`Run "grainulator analytics --help" for usage.`);
    process.exit(1);
  }

  commands[opts.command]();
}

main();
