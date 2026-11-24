import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, exportSession } from "../lib/research/session.js";
import type { AuditReport } from "./contracts.mjs";
import { command, mcp, toolJSON } from "./lib/local-checks.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-install-"));
const report: AuditReport = {
	at: new Date().toISOString(),
	passed: false,
	directory: dir,
	checks: [],
};
const check = (name: string, fn: () => unknown) => {
	fn();
	report.checks.push(name);
};
try {
	if (process.env.GRAINULATOR_TEST_ARCHIVE) {
		report.archive = path.resolve(process.env.GRAINULATOR_TEST_ARCHIVE);
		report.archiveBytes = fs.statSync(report.archive).size;
	} else {
		const packed = JSON.parse(
			String(
				command(
					[
						"npm",
						"pack",
						"--ignore-scripts",
						"--json",
						"--pack-destination",
						dir,
					],
					{ cwd: root },
				),
			),
		)[0];
		report.archive = path.join(dir, packed.filename);
		report.archiveBytes = packed.size;
	}
	const consumer = path.join(dir, "consumer with spaces # café");
	fs.mkdirSync(consumer);
	fs.writeFileSync(
		path.join(consumer, "package.json"),
		JSON.stringify({
			name: "isolated-consumer",
			version: "0.0.0",
			private: true,
		}),
	);
	command(
		[
			"npm",
			"install",
			"--offline",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--cache",
			path.join(dir, "empty-cache"),
			report.archive,
		],
		{ cwd: consumer },
	);
	report.checks.push(
		"offline install with empty npm cache and scripts disabled",
	);
	const installed = path.join(
		consumer,
		"node_modules/@grainulation/grainulator",
	);
	report.installed = installed;
	check("retired application and notification hook absent from archive", () => {
		for (const entry of [
			"apps",
			"site",
			"packages/legacy-cli/site",
			"hooks/sprint-status-notifier.cjs",
			"packages/evidence/lib/connect.js",
			"packages/evidence/lib/disconnect.js",
			"packages/analytics/lib/farmer.js",
			"packages/orchestration/lib/farmer.js",
		])
			assert.equal(fs.existsSync(path.join(installed, entry)), false, entry);
		const manifest = JSON.parse(
			String(fs.readFileSync(path.join(installed, "package.json"))),
		);
		assert.equal(manifest.dependencies?.ws, undefined);
	});
	check(
		"retired presentation assets absent; Markdown reports and data exports retained",
		() => {
			for (const component of [
				"analytics",
				"evidence",
				"exports",
				"legacy-cli",
				"memory",
				"orchestration",
				"shared",
			]) {
				const base = path.join(installed, "packages", component);
				for (const entry of [
					"public/index.html",
					"lib/server.js",
					"lib/server.mjs",
				])
					assert.equal(
						fs.existsSync(path.join(base, entry)),
						false,
						`${component}/${entry}`,
					);
			}
			for (const entry of [
				"packages/analytics/lib/report.js",
				"packages/exports/lib/formats/markdown.mjs",
				"packages/exports/lib/formats/json.mjs",
			])
				assert.equal(fs.existsSync(path.join(installed, entry)), true, entry);
			for (const entry of [
				"templates",
				"skills/present",
				"packages/shared/templates/brief.html",
				"packages/orchestration/templates/dashboard.html",
				"packages/analytics/templates/retrospective.html",
				"packages/exports/lib/formats/html-report.mjs",
				"packages/exports/lib/exporters/pdf.js",
			])
				assert.equal(fs.existsSync(path.join(installed, entry)), false, entry);
			for (const entry of [
				"packages/analytics/lib/dashboard.js",
				"packages/analytics/templates/dashboard.html",
			])
				assert.equal(fs.existsSync(path.join(installed, entry)), false, entry);
		},
	);
	check(
		"browser payload and asset vendoring are absent from the installed product",
		() => {
			for (const entry of [
				"public",
				"packages/shared/public",
				"packages/memory/public",
				"packages/exports/public",
				"scripts/preview.mjs",
				"lib/research-http.js",
				"packages/shared/tools/sync-assets.js",
			])
				assert.equal(fs.existsSync(path.join(installed, entry)), false, entry);
		},
	);
	const cli = path.join(installed, "bin/grainulator.js");
	const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
		command([process.execPath, cli, ...args], { cwd: consumer, env });
	for (const component of [
		"evidence",
		"memory",
		"export",
		"analytics",
		"orchestrate",
		"legacy",
	])
		check(`retired component serve rejected: ${component}`, () => {
			const result = spawnSync(process.execPath, [cli, component, "serve"], {
				cwd: consumer,
				encoding: "utf8",
				timeout: 10000,
			});
			assert.ifError(result.error);
			assert.equal(result.status, 1, result.stdout + result.stderr);
			assert.match(result.stdout + result.stderr, /retired|unknown command/i);
		});
	for (const args of [
		["dashboard", "--help"],
		["evidence", "connect", "farmer"],
		["evidence", "disconnect", "farmer"],
		["analytics", "connect", "farmer"],
		["orchestrate", "connect", "farmer"],
		["legacy", "farmer", "start"],
	])
		check(`retired command rejected: ${args.join(" ")}`, () =>
			assert.throws(() => run(args)),
		);
	check("installed binary is not a workspace symlink", () =>
		assert.equal(fs.lstatSync(installed).isSymbolicLink(), false),
	);
	check("installed onboarding documents have their local link targets", () => {
		const guides = [
			"README.md",
			"CONTRIBUTING.md",
			"CODE_OF_CONDUCT.md",
			"SECURITY.md",
			"CHANGELOG.md",
			...fs
				.readdirSync(path.join(installed, "docs"))
				.filter((name) => name.endsWith(".md"))
				.map((name) => `docs/${name}`),
			...fs
				.readdirSync(path.join(installed, "packages"))
				.map((name) => `packages/${name}/README.md`)
				.filter((name) => fs.existsSync(path.join(installed, name))),
		];
		for (const guide of guides) {
			const text = fs.readFileSync(path.join(installed, guide), "utf8");
			for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
				const href = match[1]!;
				if (/^(?:[a-z]+:|#)/i.test(href)) continue;
				const relative = href.split("#")[0];
				if (!relative) continue;
				const target = path.resolve(installed, path.dirname(guide), relative);
				assert.ok(
					target.startsWith(installed + path.sep) && fs.existsSync(target),
					`${guide}: missing packaged link ${href}`,
				);
			}
		}
	});
	check("CLI help", () => assert.match(run(["--help"]), /Grainulator/));
	check("doctor validates the required runtime and packaged components", () => {
		const checks = JSON.parse(String(run(["doctor", "--json"]))).checks;
		assert.ok(checks.every((c: { available: boolean }) => c.available));
		assert.equal(
			checks.find(
				(c: { component: string; required: string }) => c.component === "node",
			).required,
			JSON.parse(String(fs.readFileSync(path.join(installed, "package.json"))))
				.engines.node,
		);
	});
	check("identified build verifies all recorded files", () => {
		const build = JSON.parse(String(run(["doctor", "--json"]))).build;
		assert.equal(build.verified, true);
		assert.match(build.id, /^(?:local-|release-[^-]+-)[a-f0-9]{16}$/);
		if (process.env.GRAINULATOR_EXPECTED_BUILD_ID)
			assert.equal(
				build.id,
				process.env.GRAINULATOR_EXPECTED_BUILD_ID,
				"Installed candidate build differs from frozen record",
			);
		if (process.env.GRAINULATOR_EXPECTED_VERSION)
			assert.equal(
				build.version,
				process.env.GRAINULATOR_EXPECTED_VERSION,
				"Installed candidate version differs from frozen record",
			);
	});
	// Use the real installed package in a path requiring file-URL encoding, never a source symlink.
	const corpus = JSON.parse(
		String(
			fs.readFileSync(
				path.join(installed, "evals/rejected-claims/corpus.json"),
				"utf8",
			),
		),
	);
	const verifier = path.join(installed, "evals/rejected-claims/verifier.mjs");
	const answerFor = (verdict: string | undefined) =>
		JSON.stringify(
			Object.fromEntries(
				corpus.map((entry: { id: string; reason_code: string }) => [
					entry.id,
					{
						...(verdict === undefined ? {} : { verdict }),
						reason_code: entry.reason_code,
					},
				]),
			),
		);
	for (const [name, answer, exitCode, verifierCode, status, maxRounds] of [
		["honest REJECTED", answerFor("REJECTED"), 0, 0, "verified", 3],
		["dishonest ACCEPTED", answerFor("ACCEPTED"), 3, 3, "soundness_break", 3],
		["missing verdict", answerFor(undefined), 2, 1, null, 1],
		["unknown verdict", answerFor("UNKNOWN"), 2, 1, null, 1],
		["malformed answer", "{", 2, 1, null, 1],
	] satisfies [string, string, number, number, string | null, number][])
		check(`installed verifier through runner in encoded path: ${name}`, () => {
			const workspace = path.join(dir, `verifier-${name.replaceAll(" ", "-")}`);
			fs.mkdirSync(workspace);
			const adapterCode = `console.log(${JSON.stringify(JSON.stringify({ answer }))})`;
			const result = spawnSync(
				process.execPath,
				[
					cli,
					"run",
					"--task",
					"Reject adversarial fixture claims",
					"--adapter",
					process.execPath,
					"--adapter-args",
					JSON.stringify(["-e", adapterCode]),
					"--verify",
					JSON.stringify([process.execPath, verifier]),
					"--dir",
					workspace,
					"--max-rounds",
					String(maxRounds),
					"--timeout-ms",
					"10000",
					"--json",
				],
				{ cwd: consumer, encoding: "utf8", timeout: 30000 },
			);
			assert.ifError(result.error);
			assert.equal(result.status, exitCode, result.stderr || result.stdout);
			const runResult = JSON.parse(String(result.stdout));
			if (status) assert.equal(runResult.status, status);
			else assert.notEqual(runResult.status, "verified");
			assert.equal(
				runResult.rounds.length,
				1,
				"soundness breaks must halt immediately; other fixtures use one round",
			);
			assert.equal(runResult.rounds[0].verification.exitCode, verifierCode);
			assert.equal(runResult.rounds[0].verification.passed, exitCode === 0);
			assert.equal(
				runResult.rounds[0].verification.soundnessBreak,
				verifierCode === 3,
			);
			if (verifierCode === 0)
				assert.match(
					runResult.rounds[0].verification.feedback,
					/YES: all 3 adversarial claims rejected as expected/,
				);
			if (verifierCode === 3)
				assert.match(
					runResult.rounds[0].verification.feedback,
					/LOOK: soundness break/,
				);
		});
	for (const component of [
		"compile",
		"memory",
		"export",
		"analytics",
		"orchestrate",
		"runtime",
	])
		check(`${component} help`, () => run([component, "--help"]));
	const sprint = path.join(dir, "sprint");
	check("evidence init", () =>
		run([
			"init",
			"--dir",
			sprint,
			"--question",
			"Can the installed archive run independently?",
			"--audience",
			"test",
			"--constraints",
			"Local only",
			"--done",
			"Validated artifact",
		]),
	);
	check("evidence add", () =>
		run([
			"add",
			"--dir",
			sprint,
			"--id",
			"r001",
			"--type",
			"factual",
			"--topic",
			"installation",
			"--content",
			"A synthetic installation test claim.",
			"--evidence",
			"stated",
		]),
	);
	check("evidence compile with grouped next steps", () => {
		const out = run(["compile", "--dir", sprint]);
		assert.match(out, /^Auto\n/);
		assert.match(out, /\nManual\n/);
		assert.doesNotMatch(out, /Status:|Claims:/);
	});
	assert.ok(
		JSON.parse(
			String(fs.readFileSync(path.join(sprint, "claims.json"))),
		).claims.some((c: { id: string }) => c.id === "r001"),
	);
	for (const withSummary of [false, true])
		check(
			`installed CLI discovers CI export formats from encoded package path (${withSummary ? "with" : "without"} step summary)`,
			() => {
				// Exercise both modes explicitly and keep the caller's GitHub summary untouched.
				const summaryFile = path.join(dir, "github-step-summary.md");
				const outputDir = path.join(
					dir,
					withSummary ? "ci-artifacts-summary" : "ci-artifacts",
				);
				const result = JSON.parse(
					String(
						run(
							[
								"export",
								"ci-artifacts",
								"compilation.json",
								"--dir",
								sprint,
								"--formats",
								"markdown",
								"--output",
								outputDir,
								"--json",
							],
							{ GITHUB_STEP_SUMMARY: withSummary ? summaryFile : "" },
						),
					),
				);
				assert.deepEqual(
					result.artifacts.map((artifact: { file: string }) => artifact.file),
					withSummary
						? [
								path.join(outputDir, "markdown.md"),
								path.join(outputDir, "step-summary.md"),
							]
						: [path.join(outputDir, "markdown.md")],
				);
				for (const artifact of result.artifacts) {
					assert.equal(artifact.format, "markdown");
					assert.match(
						fs.readFileSync(artifact.file, "utf8"),
						/synthetic installation test claim/,
					);
				}
				if (withSummary)
					assert.equal(
						fs.readFileSync(summaryFile, "utf8"),
						fs.readFileSync(result.artifacts[0].file, "utf8") + "\n",
					);
			},
		);
	check(
		"headless research starts a new portable session without provider access",
		() => {
			const destination = path.join(dir, "new-headless-research");
			run([
				"research",
				"--question",
				"Can CLI research start without a browser?",
				"--context",
				"Offline preparation only.",
				"--dir",
				destination,
				"--prepare-only",
			]);
			const session = JSON.parse(
				String(fs.readFileSync(path.join(destination, "session.json"))),
			);
			assert.equal(
				session.question,
				"Can CLI research start without a browser?",
			);
		},
	);
	const sessionFile = path.join(dir, "session.json");
	fs.writeFileSync(
		sessionFile,
		exportSession(
			createSession({
				question: "Test session portability",
				context: "Fixture only.",
				config: { webSearch: false },
			}),
		),
	);
	check("research preparation from exported session", () =>
		run([
			"research",
			"--session",
			sessionFile,
			"--dir",
			path.join(dir, "research"),
			"--prepare-only",
		]),
	);
	const client = mcp([process.execPath, cli, "mcp", "--dir", sprint], {
		cwd: sprint,
		env: { GRAINULATOR_MEMORY_DIR: path.join(dir, "memory") },
	});
	try {
		const init = await client.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "grainulator-install-check", version: "1" },
		});
		assert.equal(init.serverInfo.name, "grainulator");
		client.notify("notifications/initialized");
		const list = await client.request("tools/list");
		assert.equal(list.tools.length, 29);
		assert.ok(list.tools.every((tool) => !tool.name.includes("/")));
		const value = toolJSON(
			await client.request("tools/call", {
				name: "status",
				arguments: { dir: sprint },
			}),
		);
		assert.equal(value.status, "ok");
		assert.ok(Array.isArray(value.next_actions.auto));
		assert.ok(Array.isArray(value.next_actions.manual));
		assert.equal(
			toolJSON(
				await client.request("tools/call", {
					name: "memory_store",
					arguments: { dir: sprint, name: "Installed artifact" },
				}),
			).claimCount,
			3,
		);
		assert.equal(
			toolJSON(
				await client.request("tools/call", {
					name: "memory_search",
					arguments: { query: "synthetic" },
				}),
			).count,
			1,
		);
		assert.ok(
			toolJSON(
				await client.request("tools/call", {
					name: "exports_formats",
					arguments: {},
				}),
			).count > 0,
		);
		assert.match(
			toolJSON(
				await client.request("tools/call", {
					name: "exports_convert",
					arguments: { format: "markdown" },
				}),
			).output,
			/synthetic installation/,
		);
		const resources = await client.request("resources/list");
		assert.equal(resources.resources.length, 7);
		assert.ok(
			resources.resources.every((resource) =>
				resource.uri.startsWith("grainulator://"),
			),
		);
		for (const name of ["wheat/status", "silo/list", "mill/formats"])
			assert.ok(
				(
					await client
						.request("tools/call", { name, arguments: {} })
						.catch((error) => ({ error }))
				).error,
				"historical alias rejected",
			);
		report.checks.push(
			"installed unified evidence, memory, exports and canonical resources; historical aliases rejected",
		);
	} finally {
		await client.close();
	}
	const compactClient = mcp(
		[process.execPath, cli, "mcp", "--dir", sprint, "--toolset", "compact"],
		{
			cwd: sprint,
			env: { GRAINULATOR_MEMORY_DIR: path.join(dir, "compact-memory") },
		},
	);
	try {
		const init = await compactClient.request("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "grainulator-compact-install-check", version: "1" },
		});
		assert.equal(init.protocolVersion, "2025-06-18");
		const tools = (await compactClient.request("tools/list")).tools;
		assert.equal(tools.length, 15);
		assert.ok(
			tools.every(
				(tool) =>
					tool.outputSchema && Object.keys(tool.annotations).length === 4,
			),
		);
		const inspected = await compactClient.request("tools/call", {
			name: "inspect_sprint",
			arguments: { limit: 5 },
		});
		assert.equal(inspected.isError, false);
		assert.equal(inspected.structuredContent!.status, "ok");
		assert.deepEqual(inspected.structuredContent, toolJSON(inspected));
		const rendered = await compactClient.request("tools/call", {
			name: "export_document",
			arguments: { format: "markdown", lines: 5 },
		});
		assert.equal(rendered.isError, false);
		assert.ok(rendered.structuredContent!.preview);
		for (const uri of [
			"grainulator://memory/index",
			"grainulator://memory/packs",
			"grainulator://exports/formats",
		])
			assert.ok(
				(await compactClient.request("resources/read", { uri })).contents[0]!
					.text,
			);
		assert.ok(
			(
				await compactClient
					.request("tools/call", { name: "add_claim", arguments: {} })
					.catch((error) => ({ error }))
			).error,
		);
		report.checks.push(
			"installed compact15 inventory, negotiated structured results, resources and disabled legacy routes",
		);
	} finally {
		await compactClient.close();
	}
	check(
		"installed offline demo writes outside package and preserves verification protocol",
		() => {
			const result = JSON.parse(
				String(run(["demo", "--dir", path.join(dir, "demo"), "--json"])),
			);
			assert.equal(result.status, "verified");
			assert.equal(result.rounds.length, 2);
			assert.ok(!result.trace.startsWith(installed + path.sep));
		},
	);
	check("installed config schema and generated reference are bundled", () => {
		for (const entry of [
			"packages/shared/schemas/project-config.schema.json",
			"share/completions/grainulator.bash",
			"share/man/man1/grainulator.1",
		])
			assert.ok(fs.existsSync(path.join(installed, entry)));
		assert.equal(
			JSON.parse(String(run(["config", "check", "--dir", sprint, "--json"])))
				.status,
			"ok",
		);
	});
	report.passed = true;
} catch (error) {
	report.error = (error as Error).message;
	process.exitCode = 1;
}
fs.mkdirSync(path.join(root, ".dogfood"), { recursive: true });
fs.writeFileSync(
	path.join(root, ".dogfood/package-isolation-audit.json"),
	JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
