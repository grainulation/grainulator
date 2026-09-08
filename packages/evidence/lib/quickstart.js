/**
 * wheat quickstart — zero-to-dashboard in under 90 seconds
 *
 * Creates a demo sprint with pre-seeded research claims,
 * compiles them, and opens the dashboard. Designed to show
 * wheat's value in the shortest possible time.
 *
 * Usage:
 *   wheat quickstart [--dir <path>] [--no-open] [--port 9092]
 *
 * Zero npm dependencies.
 */

import fs from "fs";
import path from "path";
import { atomicWriteJSON } from "../../shared/lib/atomic.js";
import { fileURLToPath } from "url";
import { compile as runCompiler } from "../compiler/wheat-compiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function target(dir, ...segments) {
	return path.join(dir, ...segments);
}

function packageRoot() {
	return path.resolve(__dirname, "..");
}

function now() {
	return new Date().toISOString();
}

// ── Demo sprint data ────────────────────────────────────────────────────────

const DEMO_QUESTION =
	"Should we consolidate our microservices into a modular monolith?";
const DEMO_AUDIENCE = ["platform team", "service owners", "CTO"];
const DEMO_CONSTRAINTS = [
	"Must not break existing SSO clients or public API contracts during the cutover",
	"Platform team is 4 engineers; each service currently has a dedicated on-call owner",
	"Login-check p99 latency is 180ms today — any consolidation plan must preserve or improve it",
];
const DEMO_DONE =
	"A recommendation with evidence: consolidate, stay split, or partial consolidation — with risk assessment, rollback story, and a 3-month execution plan.";

const DEMO_CLAIMS = [
	{
		id: "d001",
		type: "constraint",
		topic: "contract-stability",
		content:
			"Must not break existing SSO clients or public API contracts during the cutover.",
		source: { origin: "stakeholder", artifact: null, connector: null },
		evidence: "stated",
		status: "active",
		phase_added: "define",
		tags: ["architecture", "constraint"],
	},
	{
		id: "d002",
		type: "constraint",
		topic: "team-capacity",
		content:
			"Platform team is 4 engineers; each service currently has a dedicated on-call owner.",
		source: { origin: "stakeholder", artifact: null, connector: null },
		evidence: "stated",
		status: "active",
		phase_added: "define",
		tags: ["team", "constraint"],
	},
	{
		id: "d003",
		type: "constraint",
		topic: "latency-baseline",
		content:
			"Login-check p99 latency is 180ms today — any consolidation plan must preserve or improve it.",
		source: { origin: "stakeholder", artifact: null, connector: null },
		evidence: "stated",
		status: "active",
		phase_added: "define",
		tags: ["latency", "constraint"],
	},
	{
		id: "d004",
		type: "constraint",
		topic: "done-criteria",
		content:
			"Done looks like: A recommendation with evidence — consolidate, stay split, or partial consolidation — with risk assessment, rollback story, and a 3-month execution plan.",
		source: { origin: "stakeholder", artifact: null, connector: null },
		evidence: "stated",
		status: "active",
		phase_added: "define",
		tags: ["done-criteria"],
	},
	{
		id: "r001",
		type: "factual",
		topic: "in-process-latency",
		content:
			"Network calls between services (~2ms p50, 10-30ms p99) collapse into in-process module calls (~1µs) once consolidated. Public write-ups from Shopify, Prime Video, and Segment report p99 drops of 40-60% on hot paths after reversing premature service extraction.",
		source: {
			origin: "research",
			artifact: "research/consolidation-landscape.md",
			connector: null,
		},
		evidence: "documented",
		status: "active",
		phase_added: "research",
		tags: ["monolith", "latency", "consolidation"],
	},
	{
		id: "r002",
		type: "factual",
		topic: "transaction-boundaries",
		content:
			"Cross-service sagas and outbox patterns collapse into single-module ACID transactions once services share a process and database. This eliminates a class of partial-failure bugs that are painful to diagnose in distributed systems but trivial inside a monolith.",
		source: {
			origin: "research",
			artifact: "research/consolidation-landscape.md",
			connector: null,
		},
		evidence: "documented",
		status: "active",
		phase_added: "research",
		tags: ["monolith", "architecture", "consolidation"],
	},
	{
		id: "r003",
		type: "risk",
		topic: "deployment-coupling",
		content:
			"Deployment-unit coupling returns: consolidated services ship on the monolith's cadence, build-pipeline time grows, and a bad change in one module can block releases for all others. Teams that lose per-service deploy independence report 2-3x longer mean-time-to-recovery if module boundaries are not enforced.",
		source: {
			origin: "research",
			artifact: "research/consolidation-landscape.md",
			connector: null,
		},
		evidence: "documented",
		status: "active",
		phase_added: "research",
		tags: ["monolith", "risk", "deployment"],
	},
	{
		id: "r004",
		type: "recommendation",
		topic: "reverse-strangler",
		content:
			"Use a reverse-strangler pattern behind an anti-corruption layer: keep the service's public contract stable while routing traffic into an in-process module, then retire the standalone service once parity is confirmed. Start with auth or session services where the saga cost is highest, and preserve payments as a separate service where async boundaries are load-bearing.",
		source: {
			origin: "research",
			artifact: "research/consolidation-landscape.md",
			connector: null,
		},
		evidence: "documented",
		status: "active",
		phase_added: "research",
		tags: ["consolidation", "recommendation", "architecture"],
	},
	{
		id: "r005",
		type: "estimate",
		topic: "consolidation-timeline",
		content:
			"Estimated timeline for consolidating one service with 4 engineers: ~3 weeks to land the in-process module behind a module boundary, ~2 weeks to remove saga/outbox machinery, ~1-2 weeks for cutover and service retirement. Total: 6-7 weeks per service. A full 3-service rollback fits in one quarter if modules are built in parallel.",
		source: {
			origin: "research",
			artifact: "research/consolidation-landscape.md",
			connector: null,
		},
		evidence: "web",
		status: "active",
		phase_added: "research",
		tags: ["consolidation", "estimate", "timeline"],
	},
	{
		id: "x001",
		type: "risk",
		topic: "in-process-latency",
		content:
			"The 40-60% p99 win in r001 assumes the monolith's in-process slow-path stays fast at consolidated scale. The last 90 days of incident reports show existing slow-path contention under load, and the reverse-strangler re-establishes exactly the schema boundaries that made these services painful to host in the first place. The latency gain is real but narrower than the headline number suggests.",
		source: { origin: "challenge", artifact: null, connector: null },
		evidence: "documented",
		status: "active",
		phase_added: "research",
		conflicts_with: ["r001"],
		tags: ["monolith", "latency", "challenge"],
	},
];

// ── Main ────────────────────────────────────────────────────────────────────

export async function run(dir, args) {
	const startTime = Date.now();
	const flags = {};
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--no-open") flags.noOpen = true;
		else if (args[i] === "--port" && args[i + 1]) {
			flags.port = args[++i];
		}
	}

	const claimsPath = target(dir, "claims.json");
	if (fs.existsSync(claimsPath) && !args.includes("--force")) {
		console.log();
		console.log("  A sprint already exists here. Use --force to overwrite.");
		console.log();
		process.exit(1);
	}

	console.log();
	console.log("  \x1b[1m\x1b[33mwheat quickstart\x1b[0m — zero to dashboard");
	console.log("  ─────────────────────────────────────────");
	console.log();

	// Step 1: Create claims.json with demo data
	const timestamp = now();
	const claimsData = {
		meta: {
			question: DEMO_QUESTION,
			initiated: new Date().toISOString().split("T")[0],
			audience: DEMO_AUDIENCE,
			phase: "research",
			connectors: [],
			dismissed_blind_spots: [],
			merged_from: [],
		},
		claims: DEMO_CLAIMS.map((c) => ({
			...c,
			timestamp,
			conflicts_with: c.conflicts_with || [],
			resolved_by: c.resolved_by || null,
		})),
	};

	atomicWriteJSON(claimsPath, claimsData, 2);
	const elapsed1 = Date.now() - startTime;
	console.log(
		`  \x1b[32m+\x1b[0m claims.json (${claimsData.claims.length} claims seeded)  \x1b[2m${elapsed1}ms\x1b[0m`,
	);

	// Step 2: Create CLAUDE.md
	const templatePath = path.join(packageRoot(), "templates", "claude.md");
	let claudeMd;
	try {
		claudeMd = fs
			.readFileSync(templatePath, "utf8")
			.replace(/\{\{QUESTION\}\}/g, DEMO_QUESTION)
			.replace(/\{\{AUDIENCE\}\}/g, DEMO_AUDIENCE.join(", "))
			.replace(
				/\{\{CONSTRAINTS\}\}/g,
				DEMO_CONSTRAINTS.map((c) => `- ${c}`).join("\n"),
			)
			.replace(/\{\{DONE_CRITERIA\}\}/g, DEMO_DONE);
	} catch {
		claudeMd = `# Wheat Sprint\n\n**Question:** ${DEMO_QUESTION}\n`;
	}
	fs.writeFileSync(target(dir, "CLAUDE.md"), claudeMd);
	console.log(`  \x1b[32m+\x1b[0m CLAUDE.md`);

	// Step 3: Copy slash commands
	const srcDir = path.join(packageRoot(), "templates", "commands");
	const destDir = target(dir, ".claude", "commands");
	fs.mkdirSync(destDir, { recursive: true });
	let copied = 0;
	try {
		for (const file of fs.readdirSync(srcDir)) {
			if (!file.endsWith(".md")) continue;
			fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
			copied++;
		}
	} catch {
		/* commands dir may not exist in dev */
	}
	console.log(`  \x1b[32m+\x1b[0m .claude/commands/ (${copied} commands)`);

	// Step 4: Create directories
	for (const d of ["output", "research", "prototypes", "evidence"]) {
		const dirPath = target(dir, d);
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
			fs.writeFileSync(path.join(dirPath, ".gitkeep"), "");
		}
	}
	console.log("  \x1b[32m+\x1b[0m output/, research/, prototypes/, evidence/");

	// Step 5: Run the compiler
	console.log();
	console.log("  \x1b[1mCompiling...\x1b[0m");
	try {
		const compilationPath = path.join(dir, "compilation.json");
		runCompiler(claimsPath, compilationPath, dir);
	} catch (err) {
		console.log(`  \x1b[33m!\x1b[0m Compilation skipped: ${err.message}`);
	}

	const elapsed5 = Date.now() - startTime;
	console.log();
	console.log(`  \x1b[32mCompiled in ${elapsed5}ms.\x1b[0m`);

	// Step 6: Start the dashboard
	const port = flags.port || "9092";
	console.log();
	console.log(`  \x1b[1mStarting dashboard on port ${port}...\x1b[0m`);

	// Import and start the server
	try {
		const serverModule = await import(
			path.join(packageRoot(), "lib", "server.js")
		);
		// The server module's run() starts listening — we call it and let it run
		// It will keep the process alive
		const serverArgs = ["--port", port, "--dir", dir];
		if (flags.noOpen) serverArgs.push("--no-open");

		console.log();
		console.log("  ─────────────────────────────────────────");
		const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
		console.log(
			`  \x1b[1m\x1b[33mQuickstart complete.\x1b[0m  ${totalTime}s total`,
		);
		console.log();
		console.log(`  Sprint:     ${DEMO_QUESTION}`);
		console.log(
			`  Claims:     ${claimsData.claims.length} (${
				DEMO_CLAIMS.filter((c) => c.id.startsWith("d")).length
			} constraints + ${
				DEMO_CLAIMS.filter((c) => c.id.startsWith("r")).length
			} research + ${
				DEMO_CLAIMS.filter((c) => c.id.startsWith("x")).length
			} challenge)`,
		);
		console.log(`  Conflicts:  1 (r001 vs x001 — latency gain at scale)`);
		console.log(`  Dashboard:  http://localhost:${port}`);
		console.log();
		console.log("  What to do now:");
		console.log(
			"    1. Explore the dashboard — click topics, claims, see the conflict",
		);
		console.log(
			'    2. Open Claude Code here and try: /research "module boundary enforcement"',
		);
		console.log("    3. Or start YOUR sprint: wheat init");
		console.log();

		// Start server (this blocks — keeps process alive)
		await serverModule.run(dir, serverArgs);
	} catch (err) {
		// If server fails, still show the summary
		console.log(`  \x1b[33m!\x1b[0m Dashboard failed to start: ${err.message}`);
		console.log(`  Run manually: wheat serve --dir ${dir}`);
		console.log();
	}
}
