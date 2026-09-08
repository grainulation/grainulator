/**
 * Integration test: wheat init --question "..."
 *
 * Verifies that `wheat init` in quick mode creates the expected files:
 *   - claims.json (with meta.question and claims array)
 *   - CLAUDE.md (with sprint question)
 *   - .claude/commands/grainulator/ (populated with slash commands)
 *
 * Uses node:test + node:assert — zero dependencies.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WHEAT_BIN = path.resolve(__dirname, "..", "bin", "wheat.js");
const QUESTION = "Should we migrate the database to Postgres?";

describe("wheat init --question (quick mode)", () => {
	let tmpDir;

	before(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-init-test-"));
		// Initialize a git repo so the init command can find git root
		execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
	});

	after(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("creates claims.json with correct structure", () => {
		execFileSync(
			process.execPath,
			[
				WHEAT_BIN,
				"init",
				"--question",
				QUESTION,
				"--audience",
				"engineering,product",
				"--constraints",
				"Budget under 10k;Timeline 2 weeks",
				"--done",
				"A go/no-go recommendation",
				"--dir",
				tmpDir,
			],
			{ timeout: 10_000 },
		);

		const claimsPath = path.join(tmpDir, "claims.json");
		assert.ok(fs.existsSync(claimsPath), "claims.json should exist");

		const claims = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
		assert.equal(claims.meta.question, QUESTION);
		assert.ok(Array.isArray(claims.meta.audience), "audience should be array");
		assert.ok(claims.meta.audience.includes("engineering"));
		assert.ok(Array.isArray(claims.claims), "claims should be array");
		assert.ok(
			claims.claims.length >= 2,
			"should have at least 2 constraint claims (constraints + done)",
		);
		assert.equal(claims.meta.phase, "define");
	});

	it("creates CLAUDE.md with sprint question", () => {
		const claudePath = path.join(tmpDir, "CLAUDE.md");
		assert.ok(fs.existsSync(claudePath), "CLAUDE.md should exist");

		const content = fs.readFileSync(claudePath, "utf8");
		assert.ok(
			content.includes(QUESTION),
			"CLAUDE.md should contain the question",
		);
		assert.ok(
			content.includes("engineering"),
			"CLAUDE.md should contain audience",
		);
	});

	it("creates .claude/commands/grainulator/ with slash command files", () => {
		const commandsDir = path.join(tmpDir, ".claude", "commands", "grainulator");
		assert.ok(
			fs.existsSync(commandsDir),
			".claude/commands/grainulator/ should exist",
		);

		const files = fs.readdirSync(commandsDir);
		assert.ok(files.length > 0, "should have at least one command file");
		assert.ok(
			files.some((f) => f.endsWith(".md")),
			"command files should be .md",
		);
		// Verify known commands exist
		assert.ok(
			files.includes("research.md"),
			"research.md command should exist",
		);
		assert.ok(files.includes("status.md"), "status.md command should exist");
	});

	it("creates output directories with .gitkeep", () => {
		for (const dir of ["output", "research", "prototypes", "evidence"]) {
			const dirPath = path.join(tmpDir, dir);
			assert.ok(fs.existsSync(dirPath), `${dir}/ should exist`);
			assert.ok(
				fs.existsSync(path.join(dirPath, ".gitkeep")),
				`${dir}/.gitkeep should exist`,
			);
		}
	});

	it("refuses to reinitialize without --force", () => {
		assert.throws(() => {
			execFileSync(
				process.execPath,
				[WHEAT_BIN, "init", "--question", "Another question", "--dir", tmpDir],
				{ timeout: 10_000, stdio: "pipe" },
			);
		}, "should exit non-zero when sprint already exists");
	});
});

// ─── CLAUDE.md preservation ──────────────────────────────────────────────────

const INIT_FLAGS = [
	"--question",
	"Test question?",
	"--audience",
	"engineering",
	"--constraints",
	"None",
	"--done",
	"A recommendation",
];

describe("CLAUDE.md preservation", () => {
	describe("appends wheat section to existing CLAUDE.md", () => {
		let tmpDir;

		before(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-claude-append-"));
			execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
			fs.writeFileSync(
				path.join(tmpDir, "CLAUDE.md"),
				"# My Project\nSome content",
			);
		});

		after(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("preserves original content and appends wheat section with separator", () => {
			execFileSync(
				process.execPath,
				[WHEAT_BIN, "init", ...INIT_FLAGS, "--dir", tmpDir],
				{ timeout: 10_000 },
			);

			const content = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf8");
			assert.ok(
				content.startsWith("# My Project"),
				"should start with original heading",
			);
			assert.ok(content.includes("---"), "should contain separator");
			assert.ok(
				content.includes("## Sprint"),
				"should contain wheat sprint section",
			);
		});
	});

	describe("creates backup with --force on existing CLAUDE.md", () => {
		let tmpDir;
		const originalContent = "# Existing Project\nImportant notes here";

		before(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-claude-force-"));
			execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
			// First init to create claims.json (so --force has something to override)
			execFileSync(
				process.execPath,
				[WHEAT_BIN, "init", ...INIT_FLAGS, "--dir", tmpDir],
				{ timeout: 10_000 },
			);
			// Overwrite CLAUDE.md with known content before --force reinit
			fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), originalContent);
		});

		after(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("backs up existing CLAUDE.md to CLAUDE.md.bak", () => {
			execFileSync(
				process.execPath,
				[WHEAT_BIN, "init", "--force", ...INIT_FLAGS, "--dir", tmpDir],
				{ timeout: 10_000 },
			);

			const bakPath = path.join(tmpDir, "CLAUDE.md.bak");
			assert.ok(fs.existsSync(bakPath), "CLAUDE.md.bak should exist");
			assert.equal(
				fs.readFileSync(bakPath, "utf8"),
				originalContent,
				"backup should contain original content",
			);
		});
	});

	describe("writes fresh CLAUDE.md when none exists", () => {
		let tmpDir;

		before(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wheat-claude-fresh-"));
			execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
		});

		after(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("creates CLAUDE.md with wheat template content", () => {
			execFileSync(
				process.execPath,
				[WHEAT_BIN, "init", ...INIT_FLAGS, "--dir", tmpDir],
				{ timeout: 10_000 },
			);

			const claudePath = path.join(tmpDir, "CLAUDE.md");
			assert.ok(fs.existsSync(claudePath), "CLAUDE.md should exist");

			const content = fs.readFileSync(claudePath, "utf8");
			assert.ok(
				content.startsWith("# Grainulator"),
				"should start with wheat template heading",
			);
			assert.ok(content.includes("## Sprint"), "should contain sprint section");
		});
	});
});
