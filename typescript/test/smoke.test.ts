/**
 * Smoke tests for the grainulator plugin.
 *
 * Validates that plugin.json parses correctly, skill files have valid
 * YAML frontmatter, hooks.json is valid, and .mcp.json is well-formed.
 *
 * Uses node:test + node:assert -- zero dependencies.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── plugin.json ──────────────────────────────────────────────────────────────

describe("plugin.json", () => {
	let plugin: {
		name: string;
		version: string;
		description: string;
		skills: string;
		agents: string | string[];
		mcpServers: string;
	};

	it("parses as valid JSON", () => {
		const raw = fs.readFileSync(
			path.join(ROOT, ".claude-plugin", "plugin.json"),
			"utf8",
		);
		plugin = JSON.parse(raw);
	});

	it("has required fields", () => {
		assert.ok(plugin.name, "missing name");
		assert.ok(plugin.version, "missing version");
		assert.ok(plugin.description, "missing description");
		assert.ok(plugin.skills, "missing skills");
		assert.ok(plugin.agents, "missing agents");
		assert.ok(plugin.mcpServers, "missing mcpServers");
	});

	it("referenced paths exist", () => {
		assert.ok(
			fs.existsSync(path.join(ROOT, plugin.skills)),
			`skills dir missing: ${plugin.skills}`,
		);
		const agentPaths = Array.isArray(plugin.agents)
			? plugin.agents
			: [plugin.agents];
		for (const p of agentPaths) {
			assert.ok(fs.existsSync(path.join(ROOT, p)), `agent path missing: ${p}`);
		}
		// hooks/hooks.json is auto-discovered, not in plugin.json
		assert.ok(
			fs.existsSync(path.join(ROOT, "hooks", "hooks.json")),
			"hooks/hooks.json missing",
		);
		assert.ok(
			fs.existsSync(path.join(ROOT, plugin.mcpServers)),
			`mcp config missing: ${plugin.mcpServers}`,
		);
	});
});

// ── Skill files ──────────────────────────────────────────────────────────────

describe("skill files", () => {
	const skillsDir = path.join(ROOT, "skills");
	// Skills use subdirectory format: skills/<name>/SKILL.md
	// Skip _templates (shared HTML templates, not a skill) and any underscore-prefixed dirs
	const skillDirs = fs
		.readdirSync(skillsDir)
		.filter(
			(f) =>
				fs.statSync(path.join(skillsDir, f)).isDirectory() &&
				!f.startsWith("_"),
		);

	it("has at least one skill directory", () => {
		assert.ok(skillDirs.length > 0, "no skill subdirectories found");
	});

	for (const dir of skillDirs) {
		const skillFile = path.join(skillsDir, dir, "SKILL.md");

		it(`${dir}/SKILL.md exists and has YAML frontmatter with name and description`, () => {
			assert.ok(fs.existsSync(skillFile), `${dir}/SKILL.md does not exist`);
			const content = fs.readFileSync(skillFile, "utf8");
			assert.ok(
				content.startsWith("---"),
				`${dir}/SKILL.md missing frontmatter delimiter`,
			);
			const endIdx = content.indexOf("---", 3);
			assert.ok(
				endIdx > 3,
				`${dir}/SKILL.md missing closing frontmatter delimiter`,
			);
			const frontmatter = content.slice(3, endIdx);
			assert.ok(
				/^name:\s*.+$/m.test(frontmatter),
				`${dir}/SKILL.md missing "name" in frontmatter`,
			);
			assert.ok(
				/^description:\s*.+$/m.test(frontmatter),
				`${dir}/SKILL.md missing "description" in frontmatter`,
			);
		});
	}
});

// ── hooks.json ───────────────────────────────────────────────────────────────

describe("hooks.json", () => {
	let hooks: {
		hooks: Record<
			string,
			{ matcher: string; hooks: { type: string; command: string }[] }[]
		>;
	};

	it("parses as valid JSON", () => {
		const raw = fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8");
		hooks = JSON.parse(raw);
	});

	it("has event-keyed hooks object", () => {
		assert.ok(hooks.hooks, "missing hooks wrapper");
		assert.ok(typeof hooks.hooks === "object", "hooks.hooks is not an object");
		const events = Object.keys(hooks.hooks);
		assert.ok(events.length > 0, "no hook events defined");
		for (const event of events) {
			assert.ok(
				Array.isArray(hooks.hooks[event]),
				`hooks.hooks.${event} is not an array`,
			);
		}
	});

	it("each hook entry has matcher and hooks array with type+command", () => {
		for (const [event, entries] of Object.entries(hooks.hooks)) {
			for (const entry of entries) {
				assert.ok(entry.matcher, `${event} entry missing matcher`);
				assert.ok(
					Array.isArray(entry.hooks),
					`${event} entry missing hooks array`,
				);
				for (const h of entry.hooks) {
					assert.ok(h.type, `${event} hook missing type`);
					assert.ok(h.command, `${event} hook missing command`);
				}
			}
		}
	});
});

// ── .mcp.json ────────────────────────────────────────────────────────────────

describe(".mcp.json", () => {
	let mcp: { mcpServers: Record<string, unknown> };

	it("parses as valid JSON", () => {
		const raw = fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8");
		mcp = JSON.parse(raw);
	});

	it("has mcpServers object", () => {
		assert.ok(mcp.mcpServers, "missing mcpServers");
		assert.ok(
			typeof mcp.mcpServers === "object",
			"mcpServers is not an object",
		);
	});

	it("does not use CWD variable in env values", () => {
		const raw = fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8");
		const cwdVar = "$" + "{CWD}";
		assert.ok(
			!raw.includes(cwdVar),
			`.mcp.json contains unsupported ${cwdVar} variable`,
		);
	});
});

describe("Markdown output skills", () => {
	it("keeps the brief workflow and retires presentation assets", () => {
		const source = fs.readFileSync(
			path.join(ROOT, "skills/brief/SKILL.md"),
			"utf8",
		);
		assert.match(source, /"format":"markdown"/);
		assert.match(source, /output\/brief\.md/);
		assert.equal(
			fs.existsSync(path.join(ROOT, "skills/present/SKILL.md")),
			false,
		);
		assert.equal(
			fs.existsSync(path.join(ROOT, "templates/scroll-snap-deck.html")),
			false,
		);
	});
});
