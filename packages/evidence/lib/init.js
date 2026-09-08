/**
 * grainulator init — Bootstrap a research sprint in the target repo
 *
 * Three modes:
 *   1. Interactive (default) — conversational readline session
 *   2. Quick (--question "...") — skip conversation, seed from flags
 *   3. Headless (--headless) — non-interactive, requires all flags
 *
 * Creates in the TARGET repo:
 *   - claims.json (seeded with constraint claims)
 *   - CLAUDE.md (sprint configuration for Claude Code)
 *   - .claude/commands/grainulator/*.md (slash commands)
 *   - grainulator.config.json (local config pointing back to package)
 *
 * Zero npm dependencies.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { atomicWriteJSON } from "../../shared/lib/atomic.js";
import { DEFAULTS, env, outputMode } from "./defaults.js";
import { maybeHint } from "./hints.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a path relative to the target directory */
function target(dir, ...segments) {
	return path.join(dir, ...segments);
}

/** Get the package root (where templates live) */
function packageRoot() {
	return path.resolve(__dirname, "..");
}

/** Ask a question and return the answer */
function ask(rl, question) {
	return new Promise((resolve) => {
		rl.question(question, (answer) => resolve(answer.trim()));
	});
}

/** Generate an ISO timestamp */
function now() {
	return new Date().toISOString();
}

/** Parse --flag value pairs from args */
function parseFlags(args) {
	const flags = {};
	for (let i = 0; i < args.length; i++) {
		if (
			args[i].startsWith("--") &&
			i + 1 < args.length &&
			!args[i + 1].startsWith("--")
		) {
			flags[args[i].slice(2)] = args[i + 1];
			i++;
		} else if (args[i].startsWith("--")) {
			flags[args[i].slice(2)] = true;
		}
	}
	return flags;
}

// ─── Conversation ────────────────────────────────────────────────────────────

async function conversationalInit(_dir) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	console.log();
	console.log("  \x1b[1m\x1b[33mgrainulator\x1b[0m — let's set up a research sprint");
	console.log("  ─────────────────────────────────────────");
	console.log();
	console.log("  Before you commit to anything big, let's figure out");
	console.log("  what you actually need to know. Four questions.\n");

	// Question
	const question = await ask(
		rl,
		"  What question are you trying to answer?\n" +
			'  (The more specific, the better. "Should we migrate to X?" beats "what database?")\n\n' +
			"  > ",
	);

	if (!question) {
		console.log("\n  No question, no sprint. Come back when you have one.\n");
		rl.close();
		process.exit(1);
	}

	console.log();

	// Audience
	const audienceRaw = await ask(
		rl,
		"  Who needs the answer?\n" +
			"  Could be your team, a VP, a client, or just yourself.\n\n" +
			"  > ",
	);

	console.log();

	// Constraints
	const constraintsRaw = await ask(
		rl,
		"  Any constraints?\n" +
			"  Budget, timeline, tech stack, team size — whatever narrows the space.\n" +
			"  (Leave blank if none.)\n\n" +
			"  > ",
	);

	console.log();

	// Done criteria
	const doneCriteria = await ask(
		rl,
		"  How will you know you're done?\n" +
			"  A recommendation? A prototype? A go/no-go? A deck for the meeting?\n\n" +
			"  > ",
	);

	rl.close();

	// Parse audience into array
	const audience = audienceRaw
		? audienceRaw
				.split(/[,;]/)
				.map((s) => s.trim())
				.filter(Boolean)
		: ["self"];

	// Parse constraints into individual items
	const constraints = constraintsRaw
		? constraintsRaw
				.split(/[.;]/)
				.map((s) => s.trim())
				.filter((s) => s.length > 5)
		: [];

	return { question, audience, constraints, doneCriteria };
}

// ─── File generation ─────────────────────────────────────────────────────────

function buildClaims(meta, constraints) {
	const claims = [];
	const timestamp = now();

	constraints.forEach((constraint, i) => {
		claims.push({
			id: `d${String(i + 1).padStart(3, "0")}`,
			type: "constraint",
			topic: "sprint-scope",
			content: constraint,
			source: { origin: "stakeholder", artifact: null, connector: null },
			evidence: "stated",
			status: "active",
			phase_added: "define",
			timestamp,
			conflicts_with: [],
			resolved_by: null,
			tags: [],
		});
	});

	// Add done-criteria as a constraint if provided
	if (meta.doneCriteria) {
		claims.push({
			id: `d${String(constraints.length + 1).padStart(3, "0")}`,
			type: "constraint",
			topic: "done-criteria",
			content: `Done looks like: ${meta.doneCriteria}`,
			source: { origin: "stakeholder", artifact: null, connector: null },
			evidence: "stated",
			status: "active",
			phase_added: "define",
			timestamp,
			conflicts_with: [],
			resolved_by: null,
			tags: ["done-criteria"],
		});
	}

	return {
		schema_version: "1.0",
		meta: {
			question: meta.question,
			initiated: new Date().toISOString().split("T")[0],
			audience: meta.audience,
			phase: "define",
			connectors: [],
		},
		claims,
	};
}

function buildClaudeMd(meta) {
	const templatePath = path.join(packageRoot(), "templates", "claude.md");
	let template;
	try {
		template = fs.readFileSync(templatePath, "utf8");
	} catch {
		// Fallback if template is missing (shouldn't happen in installed package)
		console.error(
			"  Warning: CLAUDE.md template not found, using minimal template",
		);
		template =
			"# Grainulator — Research Sprint\n\n## Sprint\n\n**Question:** {{QUESTION}}\n\n**Audience:** {{AUDIENCE}}\n\n**Constraints:**\n{{CONSTRAINTS}}\n\n**Done looks like:** {{DONE_CRITERIA}}\n";
	}

	const constraintList =
		meta.constraints.length > 0
			? meta.constraints.map((c) => `- ${c}`).join("\n")
			: "- (none specified)";

	return template
		.replace(/\{\{QUESTION\}\}/g, meta.question)
		.replace(/\{\{AUDIENCE\}\}/g, meta.audience.join(", "))
		.replace(/\{\{CONSTRAINTS\}\}/g, constraintList)
		.replace(
			/\{\{DONE_CRITERIA\}\}/g,
			meta.doneCriteria || "A recommendation with evidence",
		);
}

function copyCommands(dir) {
	const srcDir = path.join(packageRoot(), "templates", "commands");
	const destDir = target(dir, ".claude", "commands", "grainulator");

	// Create .claude/commands/grainulator/ if it doesn't exist
	fs.mkdirSync(destDir, { recursive: true });

	let copied = 0;
	try {
		const files = fs.readdirSync(srcDir);
		for (const file of files) {
			if (!file.endsWith(".md")) continue;
			const src = path.join(srcDir, file);
			const dest = path.join(destDir, file);

			// Don't overwrite existing commands (user may have customized)
			if (fs.existsSync(dest)) {
				console.log(
					`  Skipped .claude/commands/grainulator/${file} (already exists)`,
				);
				continue;
			}

			fs.copyFileSync(src, dest);
			copied++;
		}
	} catch (err) {
		console.error(`  Warning: could not copy commands: ${err.message}`);
	}

	return copied;
}

// ─── Git Hook Installation ─────────────────────────────────────────────────

function installGitHook(dir) {
	// Find git root (might be different from target dir in monorepos)
	let gitRoot;
	try {
		gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd: dir,
			timeout: 5000,
			stdio: ["ignore", "pipe", "pipe"],
		})
			.toString()
			.trim();
	} catch {
		console.log("  \x1b[33m!\x1b[0m Not a git repo — skipping pre-commit hook");
		return;
	}

	const hooksDir = path.join(gitRoot, ".git", "hooks");
	const hookPath = path.join(hooksDir, "pre-commit");

	// The hook snippet — runs grainulator compile --check before allowing commits
	// Uses an existing local installation; never fetches code on commit.
	const GRAINULATOR_MARKER = "# grainulator-guard";
	const escapedDir = "'" + path.resolve(dir).replace(/'/g, "'\"'\"'") + "'";
	const hookSnippet = `
${GRAINULATOR_MARKER}
# Grainulator pre-commit: verify claims compile before committing
if git diff --cached --name-only | grep -q 'claims.json'; then
  GRAINULATOR_BIN=""
  if command -v grainulator >/dev/null 2>&1; then
    GRAINULATOR_BIN="grainulator"
  elif [ -x "./node_modules/.bin/grainulator" ]; then
    GRAINULATOR_BIN="./node_modules/.bin/grainulator"
  fi
  if [ -n "$GRAINULATOR_BIN" ]; then
    $GRAINULATOR_BIN compile --check --dir ${escapedDir} 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "grainulator: claims.json has compilation errors. Run 'grainulator compile --summary' to see details."
      exit 1
    fi
  fi
fi
`;

	try {
		if (fs.existsSync(hookPath)) {
			const existing = fs.readFileSync(hookPath, "utf8");
			if (existing.includes(GRAINULATOR_MARKER)) {
				console.log("  \x1b[34m-\x1b[0m pre-commit hook (already installed)");
				return;
			}
			// Append to existing hook
			fs.appendFileSync(hookPath, hookSnippet);
		} else {
			// Create new hook
			fs.writeFileSync(hookPath, "#!/bin/sh\n" + hookSnippet);
			// chmod is a no-op on Windows but needed for Unix
			try {
				fs.chmodSync(hookPath, 0o755);
			} catch {
				/* Windows: no chmod support, git handles executable bit */
			}
		}
		console.log("  \x1b[32m+\x1b[0m .git/hooks/pre-commit (grainulator guard)");
	} catch (err) {
		console.log(
			`  \x1b[33m!\x1b[0m Could not install git hook: ${err.message}`,
		);
	}
}

// ─── .mcp.json & AGENTS.md ──────────────────────────────────────────────────

function writeMcpJson(dir) {
	if (env.CLAUDE_PLUGIN_ROOT) {
		console.log(
			"  - .mcp.json              (skipped — plugin provides MCP servers)",
		);
		return;
	}

	const mcpPath = target(dir, ".mcp.json");
	const grainulatorEntry = {
		command: process.execPath,
		args: [path.resolve(packageRoot(), "../../bin/grainulator.js"), "mcp", "--dir", path.resolve(dir)],
	};

	let config = { mcpServers: {} };
	if (fs.existsSync(mcpPath)) {
		try {
			config = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
			if (!Object.hasOwn(config, "mcpServers")) config.mcpServers = {};
		} catch {
			console.error("  Existing .mcp.json is invalid; left unchanged. Use grainulator connect to inspect the intended configuration.");
			return;
		}
	}

	if (!config || typeof config !== "object" || Array.isArray(config) || !config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
		console.error("  Existing .mcp.json has an unsupported structure; left unchanged.");
		return;
	}
	if (Object.hasOwn(config.mcpServers, "grainulator")) {
		console.log("  Existing Grainulator MCP registration preserved.");
		return;
	}
	config.mcpServers.grainulator = grainulatorEntry;
	fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n");
	console.log(
		"  \x1b[32m+\x1b[0m .mcp.json              (Claude Code MCP auto-discovery)",
	);
}

function writeAgentsMd(dir, meta) {
	const agentsPath = target(dir, "AGENTS.md");
	const constraintList =
		meta.constraints.length > 0
			? meta.constraints.map((c) => `- ${c}`).join("\n")
			: "- (none specified)";

	const section = `# Grainulator Research Sprint

**Question:** ${meta.question}

**Audience:** ${meta.audience.join(", ")}

**Constraints:**
${constraintList}

**Done looks like:** ${meta.doneCriteria || "A recommendation with evidence"}

## Claims System

All findings are tracked as typed claims in \`claims.json\`. Claim types: constraint, factual, estimate, risk, recommendation, feedback. Evidence tiers (low to high): stated, web, documented, tested, production.

## Key Commands

- \`grainulator init\` — bootstrap a research sprint
- \`grainulator compile\` — validate and compile claims
- \`grainulator status\` — sprint health dashboard
- \`grainulator search <query>\` — search claims
- \`grainulator add\` — add a new claim
- \`grainulator resolve <id>\` — resolve a conflicting claim

## Next actions

After a meaningful pass, present fresh compiler next_actions as **Auto** and **Manual** bullet lists. Continue authorized Auto work; Manual is only decisions, access, or actions requiring the user. Show None. for an empty group, never invent work, and when only next steps were requested omit all recap. Finish against the task’s done criteria, not claim counts.
`;

	if (fs.existsSync(agentsPath)) {
		const existing = fs.readFileSync(agentsPath, "utf8");
		if (existing.includes("# Grainulator Research Sprint")) {
			console.log(
				"  \x1b[34m-\x1b[0m AGENTS.md              (grainulator section already present)",
			);
			return;
		}
		// Append grainulator section
		fs.appendFileSync(agentsPath, "\n" + section);
		console.log(
			"  \x1b[32m+\x1b[0m AGENTS.md              (appended grainulator section)",
		);
	} else {
		fs.writeFileSync(agentsPath, section);
		console.log(
			"  \x1b[32m+\x1b[0m AGENTS.md              (universal AI instructions)",
		);
	}
}

// ─── .gitignore ──────────────────────────────────────────────────────────────

function writeGitignore(dir) {
	const gitignorePath = target(dir, ".gitignore");
	const templatePath = path.join(packageRoot(), "templates", "gitignore");

	let grainulatorSection;
	try {
		grainulatorSection = fs.readFileSync(templatePath, "utf8");
	} catch {
		console.log("  \x1b[33m!\x1b[0m .gitignore template not found — skipping");
		return;
	}

	if (fs.existsSync(gitignorePath)) {
		const existing = fs.readFileSync(gitignorePath, "utf8");
		if (existing.includes("# Grainulator")) {
			console.log(
				"  \x1b[34m-\x1b[0m .gitignore             (grainulator section already present)",
			);
			return;
		}
		// Append grainulator section to existing .gitignore
		fs.appendFileSync(gitignorePath, "\n" + grainulatorSection);
		console.log(
			"  \x1b[32m+\x1b[0m .gitignore             (appended grainulator section)",
		);
	} else {
		fs.writeFileSync(gitignorePath, grainulatorSection);
		console.log(
			"  \x1b[32m+\x1b[0m .gitignore             (machine-local files excluded)",
		);
	}
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function run(dir, args) {
	const flags = parseFlags(args);

	// Warn if a parent directory has a sprint (MCP server may be bound there)
	let parentCheck = path.dirname(path.resolve(dir));
	while (parentCheck !== path.dirname(parentCheck)) {
		if (fs.existsSync(path.join(parentCheck, "claims.json"))) {
			console.log();
			console.log(
				`  \x1b[33m!\x1b[0m Parent sprint detected at ${parentCheck}/claims.json`,
			);
			console.log(
				"    The grainulator MCP server may still be bound to the parent directory.",
			);
			console.log(
				'    Use the "dir" parameter in MCP tool calls to target this sub-sprint.',
			);
			console.log();
			break;
		}
		parentCheck = path.dirname(parentCheck);
	}

	// Check if sprint already exists
	const claimsPath = target(dir, "claims.json");
	if (fs.existsSync(claimsPath) && !flags.force) {
		console.log();
		console.log(
			"  A sprint already exists in this directory (claims.json found).",
		);
		console.log(
			'  Use --force to reinitialize, or run "grainulator compile" to continue.',
		);
		console.log();
		process.exit(1);
	}

	let meta;

	if (flags.auto) {
		// ── Auto mode — question only, smart defaults for everything else ──
		if (!flags.question) {
			console.error("  grainulator: no question provided");
			process.exit(1);
		}
		meta = {
			question: flags.question,
			audience: flags.audience
				? flags.audience.split(",").map((s) => s.trim())
				: DEFAULTS.audience,
			constraints: flags.constraints
				? flags.constraints
						.split(";")
						.map((s) => s.trim())
						.filter(Boolean)
				: DEFAULTS.constraints,
			doneCriteria: flags.done || DEFAULTS.doneCriteria,
		};
	} else if (flags.headless || flags["non-interactive"]) {
		// ── Headless mode — all flags required ──
		const missing = [];
		if (!flags.question) missing.push("--question");
		if (!flags.audience) missing.push("--audience");
		if (!flags.constraints) missing.push("--constraints");
		if (!flags.done) missing.push("--done");
		if (missing.length > 0) {
			console.error();
			console.error(
				`  --headless requires all flags: --question, --audience, --constraints, --done`,
			);
			console.error(`  Missing: ${missing.join(", ")}`);
			console.error();
			console.error("  Example:");
			console.error("    grainulator init --headless \\");
			console.error('      --question "Should we migrate to Postgres?" \\');
			console.error('      --audience "Backend team" \\');
			console.error(
				'      --constraints "Must support zero-downtime; Budget under 10k" \\',
			);
			console.error(
				'      --done "Migration plan with risk assessment and rollback strategy"',
			);
			console.error();
			process.exit(1);
		}
		meta = {
			question: flags.question,
			audience: flags.audience.split(",").map((s) => s.trim()),
			constraints: flags.constraints
				.split(";")
				.map((s) => s.trim())
				.filter(Boolean),
			doneCriteria: flags.done,
		};
		console.log();
		console.log("  \x1b[1m\x1b[33mgrainulator\x1b[0m — headless sprint init");
		console.log("  ─────────────────────────────────────────");
		console.log(
			`  Question:    ${meta.question.slice(0, 70)}${
				meta.question.length > 70 ? "..." : ""
			}`,
		);
		console.log(`  Audience:    ${meta.audience.join(", ")}`);
		console.log(`  Constraints: ${meta.constraints.length}`);
		console.log(
			`  Done:        ${meta.doneCriteria.slice(0, 70)}${
				meta.doneCriteria.length > 70 ? "..." : ""
			}`,
		);
	} else if (flags.question) {
		// ── Quick mode — question pre-filled, prompt for the rest if missing ──
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		const prompt = (q) => new Promise((resolve) => rl.question(q, resolve));

		console.log();
		console.log("  \x1b[1m\x1b[33mgrainulator\x1b[0m — quick sprint init");
		console.log("  ─────────────────────────────────────────");
		console.log(`  Question: ${flags.question}`);
		console.log();

		const audience = flags.audience
			? flags.audience.split(",").map((s) => s.trim())
			: (
					await prompt(
						"  Who is this for? (comma-separated, default: self)\n  > ",
					)
				)
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean) || ["self"];

		const constraints = flags.constraints
			? flags.constraints
					.split(";")
					.map((s) => s.trim())
					.filter(Boolean)
			: (
					await prompt(
						"  Any constraints? (semicolon-separated, or press Enter to skip)\n  > ",
					)
				)
					.split(";")
					.map((s) => s.trim())
					.filter(Boolean);

		const doneCriteria =
			flags.done || (await prompt('  What does "done" look like?\n  > '));

		rl.close();

		meta = {
			question: flags.question,
			audience: audience.length ? audience : ["self"],
			constraints,
			doneCriteria,
		};
	} else {
		// ── Interactive mode ──
		meta = await conversationalInit(dir);
	}

	// Build claims.json
	const claims = buildClaims(meta, meta.constraints);

	// Build CLAUDE.md
	const claudeMd = buildClaudeMd(meta);

	// Write files
	console.log();
	console.log("  \x1b[1mCreating sprint files...\x1b[0m");
	console.log();

	fs.mkdirSync(dir, { recursive: true });

	// claims.json — atomic via @grainulation/barn/atomic (tmp + rename,
	// cleans up tmp on failure, no torn writes visible to concurrent readers).
	atomicWriteJSON(claimsPath, claims, 2);
	console.log("  \x1b[32m+\x1b[0m claims.json");

	// CLAUDE.md (preserve existing content unless --force)
	const claudePath = target(dir, "CLAUDE.md");
	const claudeExists = fs.existsSync(claudePath);
	if (claudeExists && flags.force) {
		// --force with existing file: back up before overwriting
		fs.copyFileSync(claudePath, claudePath + ".bak");
		fs.writeFileSync(claudePath, claudeMd);
		console.log(
			"  \x1b[32m+\x1b[0m CLAUDE.md (backed up existing to CLAUDE.md.bak)",
		);
	} else if (claudeExists) {
		// Existing file, no --force: append grainulator section with separator
		const existing = fs.readFileSync(claudePath, "utf8");
		fs.writeFileSync(claudePath, existing + "\n\n---\n\n" + claudeMd);
		console.log("  \x1b[32m+\x1b[0m CLAUDE.md (appended grainulator sprint section)");
	} else {
		// No existing file: write normally
		fs.writeFileSync(claudePath, claudeMd);
		console.log("  \x1b[32m+\x1b[0m CLAUDE.md");
	}

	// .claude/commands/grainulator/
	const copied = copyCommands(dir);
	console.log(
		`  \x1b[32m+\x1b[0m .claude/commands/grainulator/ (${copied} commands installed)`,
	);

	// .mcp.json (Claude Code MCP auto-discovery)
	writeMcpJson(dir);

	// AGENTS.md (universal AI instructions)
	writeAgentsMd(dir, meta);

	// .gitignore (merge with existing if present)
	writeGitignore(dir);

	// Create output directories
	const dirs = ["output", "research", "prototypes", "evidence"];
	for (const d of dirs) {
		const dirPath = target(dir, d);
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
			fs.writeFileSync(path.join(dirPath, ".gitkeep"), "");
			console.log(`  \x1b[32m+\x1b[0m ${d}/`);
		}
	}

	// Install git pre-commit hook (like husky — stakeholder insight)
	if (flags["git-hook"]) installGitHook(dir);

	// Summary
	if (flags.json) {
		console.log(
			JSON.stringify({
				question: meta.question,
				audience: meta.audience,
				constraints: meta.constraints.length,
				done_criteria: meta.doneCriteria || null,
				claims_seeded: claims.claims.length,
				files_created: [
					"claims.json",
					"CLAUDE.md",
					".claude/commands/grainulator/",
					".mcp.json",
					"AGENTS.md",
				],
				dir,
			}),
		);
		process.exit(0);
	}

	console.log();
	// Auto mode: compact output, no tutorial
	if (flags.auto) {
		const mode = outputMode();
		if (mode === "quiet") {
			return;
		} else if (mode === "json") {
			console.log(
				JSON.stringify({
					question: meta.question,
					audience: meta.audience,
					claims: claims.claims.length,
					dir,
				}),
			);
			return;
		} else {
			console.log();
			console.log(`  \x1b[1m\x1b[33mgrainulator\x1b[0m — sprint created`);
			console.log(`  ${meta.question}`);
			console.log(`  ${claims.claims.length} constraint(s) seeded`);
			try {
				const hint = maybeHint({ claims: claims.claims }, { context: "init" });
				if (hint) process.stderr.write(hint + "\n");
			} catch {
				/* non-critical */
			}
			console.log();
			return;
		}
	}

	console.log("  ─────────────────────────────────────────");
	console.log(`  \x1b[1m\x1b[33mSprint ready.\x1b[0m`);
	console.log();
	console.log(`  Question:  ${meta.question}`);
	console.log(`  Audience:  ${meta.audience.join(", ")}`);
	console.log(`  Claims:    ${claims.claims.length} constraint(s) seeded`);
	console.log();
	console.log("  Created:");
	console.log("    claims.json           Your evidence database");
	console.log("    CLAUDE.md             AI assistant configuration");
	console.log("    .claude/commands/grainulator/  slash commands for Claude Code");
	console.log("    .mcp.json             Claude Code MCP auto-discovery");
	console.log("    AGENTS.md             Universal AI instructions");
	console.log("    output/               Where compiled artifacts land");
	console.log();
	console.log("Auto\n\n- Investigate the sprint question (/research <topic>)\n\nManual\n\n- None.");

	try {
		const hint = maybeHint({ claims: claims.claims }, { context: "init" });
		if (hint) process.stderr.write(hint + "\n");
	} catch {
		/* non-critical */
	}
	console.log();
}
