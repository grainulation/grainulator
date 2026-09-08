#!/usr/bin/env node
// @ts-check
/**
 * bean smoke test — validates plugin manifests and skill frontmatter.
 * Zero dependencies (Node built-ins only). Exit 0 = pass, 1 = fail.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** @param {string} p */
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
/** @param {string} p */
const json = (p) => JSON.parse(read(p));

let passed = 0;
/** @param {string} name @param {() => void} fn */
const check = (name, fn) => {
	fn();
	passed++;
	console.log(`  ok  ${name}`);
};

// --- Claude plugin manifest ---
check("claude plugin.json has name 'bean'", () => {
	const m = json(".claude-plugin/plugin.json");
	assert.equal(m.name, "bean");
	assert.match(m.version, /^\d+\.\d+\.\d+$/);
	assert.equal(m.skills, "./skills/");
});

check("claude marketplace.json lists the bean plugin", () => {
	const m = json(".claude-plugin/marketplace.json");
	assert.ok(Array.isArray(m.plugins) && m.plugins.length >= 1);
	assert.equal(m.plugins[0].name, "bean");
	assert.equal(m.plugins[0].license, "MIT");
});

// --- Codex plugin manifest ---
check("codex plugin.json has name 'bean' and interface", () => {
	const m = json(".codex-plugin/plugin.json");
	assert.equal(m.name, "bean");
	assert.equal(m.license, "MIT");
	assert.ok(m.interface && m.interface.displayName);
});

// --- version sync across manifests ---
check("versions are synchronized across manifests", () => {
	const v = json("package.json").version;
	assert.equal(json(".claude-plugin/plugin.json").version, v);
	assert.equal(json(".claude-plugin/marketplace.json").metadata.version, v);
	assert.equal(json(".claude-plugin/marketplace.json").plugins[0].version, v);
	assert.equal(json(".codex-plugin/plugin.json").version, v);
	assert.equal(json("package-lock.json").version, v);
});

// --- skill frontmatter ---
/** @param {string} md */
const parseFrontmatter = (md) => {
	const match = md.match(/^---\n([\s\S]*?)\n---/);
	assert.ok(match, "SKILL.md must start with YAML frontmatter");
	/** @type {Record<string, string>} */
	const fm = {};
	for (const line of match[1].split("\n")) {
		const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
		if (m) fm[m[1]] = m[2];
	}
	return fm;
};

check("SKILL.md has name 'bean' and a description", () => {
	const md = read("skills/bean/SKILL.md");
	const fm = parseFrontmatter(md);
	assert.equal(fm.name, "bean");
	assert.ok("description" in fm);
});

// --- referenced files exist ---
check("all referenced reference files exist", () => {
	const refs = [
		"runtime",
		"convergence",
		"belief-revision",
		"discover",
		"delegate",
		"verify",
		"self-critique",
		"codex-blindspot",
		"verbosity",
		"runtime-claude",
		"runtime-codex",
		"grainulation",
		"bean-check",
	];
	for (const r of refs) {
		const p = path.join(root, "skills/bean/references", `${r}.md`);
		assert.ok(fs.existsSync(p), `missing references/${r}.md`);
	}
});

check("the Codex agent config exists", () => {
	assert.ok(fs.existsSync(path.join(root, "skills/bean/agents/openai.yaml")));
});

check("bean-check compiler exists and is wired as a bin", () => {
	assert.ok(
		fs.existsSync(path.join(root, "bin/bean-check.js")),
		"missing bin/bean-check.js",
	);
	const pkg = json("package.json");
	assert.equal(pkg.bin["bean-check"], "./bin/bean-check.js");
});

check("JSON schemas exist (claim, run, result)", () => {
	for (const s of ["claim", "run", "result"])
		assert.ok(
			fs.existsSync(path.join(root, "schemas", `${s}.schema.json`)),
			`missing schemas/${s}.schema.json`,
		);
});

check("no redundant commands/ dir (skill provides /bean)", () => {
	assert.ok(
		!fs.existsSync(path.join(root, "commands")),
		"commands/ duplicates the skill as a second 'bean' component; the skill alone provides /bean",
	);
});

check("all internal markdown links resolve to real files", () => {
	/** @type {string[]} */
	const mdFiles = [];
	/** @param {string} dir */
	const walk = (dir) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.name === "node_modules" || e.name.startsWith(".")) continue;
			const full = path.join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else if (e.name.endsWith(".md")) mdFiles.push(full);
		}
	};
	walk(root);

	const linkRe = /\[[^\]]+\]\(([^)]+)\)/g;
	const broken = [];
	for (const file of mdFiles) {
		const text = fs.readFileSync(file, "utf8");
		for (const m of text.matchAll(linkRe)) {
			let target = m[1].trim();
			// Skip external links and pure anchors.
			if (/^(https?:|mailto:|#)/.test(target)) continue;
			target = target.split("#")[0];
			if (!target) continue;
			const resolved = path.resolve(path.dirname(file), target);
			if (!fs.existsSync(resolved)) {
				broken.push(`${path.relative(root, file)} -> ${m[1]}`);
			}
		}
	}
	assert.equal(
		broken.length,
		0,
		`broken internal links:\n  ${broken.join("\n  ")}`,
	);
});

console.log(`\n${passed} checks passed`);
