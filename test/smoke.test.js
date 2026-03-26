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
	let plugin;

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
	let hooks;

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
	let mcp;

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

// ── WCAG template files ─────────────────────────────────────────────────────

describe("WCAG scroll-snap-deck template", () => {
	const tplPath = path.join(
		ROOT,
		"skills",
		"_templates",
		"scroll-snap-deck.html",
	);
	let html;

	it("exists", () => {
		assert.ok(fs.existsSync(tplPath), "scroll-snap-deck.html template missing");
		html = fs.readFileSync(tplPath, "utf8");
	});

	it("has skip-nav link as first body child pattern", () => {
		assert.ok(html.includes('class="skip-nav"'), "missing skip-nav link");
		assert.ok(
			html.includes('href="#main-content"'),
			"skip-nav does not target #main-content",
		);
	});

	it('uses <section> elements with aria-roledescription="slide" instead of <div class="slide">', () => {
		assert.ok(
			!html.includes('<div class="slide">'),
			'found <div class="slide"> -- must use <section>',
		);
		assert.ok(
			html.includes('aria-roledescription="slide"'),
			'missing aria-roledescription="slide" on sections',
		);
	});

	it('has <main> with role="main" and aria-roledescription="carousel"', () => {
		assert.ok(html.includes('role="main"'), 'missing role="main" on <main>');
		assert.ok(
			html.includes('aria-roledescription="carousel"'),
			'missing aria-roledescription="carousel"',
		);
	});

	it("has heading hierarchy: h1 on first slide only, h2 on subsequent", () => {
		const h1Count = (html.match(/<h1[\s>]/g) || []).length;
		assert.equal(h1Count, 1, `expected exactly 1 <h1>, found ${h1Count}`);
		assert.ok(html.includes("<h2>"), "missing <h2> for subsequent slides");
	});

	it("has no JS that traps Space key", () => {
		assert.ok(!html.includes("'Space'"), "JS traps Space key");
		assert.ok(!html.includes('"Space"'), "JS traps Space key");
		assert.ok(!html.includes("keyCode === 32"), "JS traps Space keyCode");
	});

	it("has focus-visible indicators in CSS", () => {
		assert.ok(html.includes(":focus-visible"), "missing :focus-visible styles");
	});

	it("has aria-live region for slide announcements", () => {
		assert.ok(
			html.includes('aria-live="polite"'),
			'missing aria-live="polite" region',
		);
		assert.ok(
			html.includes("slide-announcer"),
			"missing slide-announcer element",
		);
	});

	it("has IntersectionObserver for slide transitions", () => {
		assert.ok(
			html.includes("IntersectionObserver"),
			"missing IntersectionObserver",
		);
	});

	it("has sr-only utility class", () => {
		assert.ok(html.includes(".sr-only"), "missing .sr-only CSS class");
		assert.ok(/clip:\s*rect\(0/.test(html), "sr-only missing clip property");
	});

	it("has gradient text fallback", () => {
		assert.ok(
			html.includes("@supports not (-webkit-background-clip: text)"),
			"missing gradient text fallback",
		);
	});

	it('has <footer> with role="contentinfo"', () => {
		assert.ok(
			html.includes('role="contentinfo"'),
			'missing role="contentinfo" on footer',
		);
	});
});

describe("WCAG sidebar-brief template", () => {
	const tplPath = path.join(ROOT, "skills", "_templates", "sidebar-brief.html");
	let html;

	it("exists", () => {
		assert.ok(fs.existsSync(tplPath), "sidebar-brief.html template missing");
		html = fs.readFileSync(tplPath, "utf8");
	});

	it("has skip-nav link", () => {
		assert.ok(html.includes('class="skip-nav"'), "missing skip-nav link");
		assert.ok(
			html.includes('href="#main-content"'),
			"skip-nav does not target #main-content",
		);
	});

	it("has <nav> with aria-label for table of contents", () => {
		assert.ok(
			html.includes('aria-label="Table of contents"'),
			"missing aria-label on nav",
		);
	});

	it("has aria-current on active sidebar link", () => {
		assert.ok(
			html.includes('aria-current="page"'),
			'missing aria-current="page"',
		);
	});

	it("has heading hierarchy without skipping levels", () => {
		const h1Count = (html.match(/<h1[\s>]/g) || []).length;
		assert.ok(h1Count >= 1, "missing <h1>");
		assert.ok(html.includes("<h2>"), "missing <h2>");
		assert.ok(html.includes("<h3>"), "missing <h3>");
	});

	it("has accessible tables with caption and th scope", () => {
		assert.ok(html.includes("<caption>"), "missing <caption> on tables");
		assert.ok(html.includes('scope="col"'), 'missing scope="col" on <th>');
	});

	it("has mobile sidebar as <details> disclosure", () => {
		assert.ok(
			html.includes("<details"),
			"missing <details> for mobile sidebar",
		);
		assert.ok(
			html.includes("<summary>"),
			"missing <summary> in mobile disclosure",
		);
	});

	it("has focus-visible indicators", () => {
		assert.ok(html.includes(":focus-visible"), "missing :focus-visible styles");
	});

	it("has sr-only utility class", () => {
		assert.ok(html.includes(".sr-only"), "missing .sr-only CSS class");
	});

	it("severity indicators documented with text-label requirement", () => {
		assert.ok(
			html.includes(".sev--critical"),
			"missing severity class .sev--critical",
		);
		assert.ok(html.includes(">Critical<"), "severity must include text label");
	});

	it('has <footer> with role="contentinfo"', () => {
		assert.ok(
			html.includes('role="contentinfo"'),
			'missing role="contentinfo" on footer',
		);
	});

	it("has gradient text fallback", () => {
		assert.ok(
			html.includes("@supports not (-webkit-background-clip: text)"),
			"missing gradient text fallback",
		);
	});
});

describe("output skills reference WCAG templates", () => {
	it("present/SKILL.md references scroll-snap-deck.html template", () => {
		const content = fs.readFileSync(
			path.join(ROOT, "skills", "present", "SKILL.md"),
			"utf8",
		);
		assert.ok(
			content.includes("scroll-snap-deck.html"),
			"present skill does not reference scroll-snap-deck.html template",
		);
		assert.ok(
			content.includes("WCAG compliance checklist"),
			"present skill missing WCAG compliance checklist",
		);
	});

	it("brief/SKILL.md references sidebar-brief.html template", () => {
		const content = fs.readFileSync(
			path.join(ROOT, "skills", "brief", "SKILL.md"),
			"utf8",
		);
		assert.ok(
			content.includes("sidebar-brief.html"),
			"brief skill does not reference sidebar-brief.html template",
		);
		assert.ok(
			content.includes("WCAG compliance checklist"),
			"brief skill missing WCAG compliance checklist",
		);
	});
});
