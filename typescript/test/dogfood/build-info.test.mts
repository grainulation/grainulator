import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectBuild, portableMcpBytes } from "../../lib/build-info.js";

test("build verification distinguishes unidentified, unchanged, changed and missing files", () => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-build-info-"),
	);
	try {
		assert.equal(inspectBuild(root).verified, null);
		fs.writeFileSync(path.join(root, "entry.js"), "original");
		const hash = crypto.createHash("sha256").update("original").digest("hex");
		fs.writeFileSync(
			path.join(root, "build-info.json"),
			JSON.stringify({ id: "fixture", files: { "entry.js": hash } }),
		);
		assert.equal(inspectBuild(root).verified, true);
		fs.writeFileSync(path.join(root, "entry.js"), "changed");
		assert.deepEqual(inspectBuild(root).changed, ["entry.js"]);
		fs.unlinkSync(path.join(root, "entry.js"));
		assert.deepEqual(inspectBuild(root).missing, ["entry.js"]);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("host wrapper is reported separately only when its original server definition matches", () => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-build-wrapper-"),
	);
	try {
		const plain = {
			mcpServers: {
				grainulator: {
					command: "node",
					// biome-ignore lint/suspicious/noTemplateCurlyInString: literal host variable
					args: ["${CLAUDE_PLUGIN_ROOT}/bin/grainulator.js", "mcp"],
					// biome-ignore lint/suspicious/noTemplateCurlyInString: literal host variable
					env: { GRAINULATOR_MEMORY_DIR: "${CLAUDE_PLUGIN_DATA}/memory" },
				},
			},
		};
		const bytes = portableMcpBytes(Buffer.from(JSON.stringify(plain)));
		const hash = crypto.createHash("sha256").update(bytes).digest("hex");
		fs.writeFileSync(
			path.join(root, "build-info.json"),
			JSON.stringify({ id: "fixture", files: { ".mcp.json": hash } }),
		);
		const wrapped = structuredClone(plain);
		wrapped.mcpServers.grainulator.command =
			"/usr/local/bin/prompt_security/prompt_security_mcp";
		wrapped.mcpServers.grainulator.args = [
			path.join(root, ".mcp.json"),
			"grainulator",
			"__args__",
			"node",
			...plain.mcpServers.grainulator.args,
		];
		fs.writeFileSync(path.join(root, ".mcp.json"), JSON.stringify(wrapped));
		assert.equal(inspectBuild(root).verified, true);
		assert.deepEqual(inspectBuild(root).host_adaptations, [".mcp.json"]);
		wrapped.mcpServers.grainulator.args.push("--different-setting");
		fs.writeFileSync(path.join(root, ".mcp.json"), JSON.stringify(wrapped));
		assert.equal(inspectBuild(root).verified, false);
		assert.deepEqual(inspectBuild(root).changed, [".mcp.json"]);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("native MCP host wrappers verify only when the complete launch configuration matches", () => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-native-wrapper-"),
	);
	try {
		const plain = {
			mcpServers: {
				grainulator: {
					command: "node",
					args: ["plugin.js"],
					env: { MEMORY: "memory" },
				},
			},
		};
		const hash = crypto
			.createHash("sha256")
			.update(portableMcpBytes(Buffer.from(JSON.stringify(plain))))
			.digest("hex");
		fs.writeFileSync(
			path.join(root, "build-info.json"),
			JSON.stringify({ id: "fixture", files: { "mcp.json": hash } }),
		);
		const wrapped = structuredClone(plain);
		wrapped.mcpServers.grainulator.command =
			"/usr/local/bin/prompt_security/prompt_security_mcp";
		wrapped.mcpServers.grainulator.args = [
			path.join(root, "mcp.json"),
			"grainulator",
			"__args__",
			"node",
			"plugin.js",
		];
		fs.writeFileSync(path.join(root, "mcp.json"), JSON.stringify(wrapped));
		assert.equal(inspectBuild(root).verified, true);
		assert.deepEqual(inspectBuild(root).host_adaptations, ["mcp.json"]);
		const valid = structuredClone(wrapped);
		for (const [index, value] of [
			[0, path.join(root, "other.json")],
			[1, "other-server"],
			[2, "other-marker"],
		] satisfies [number, string][]) {
			fs.writeFileSync(path.join(root, "other.json"), JSON.stringify(plain));
			const altered = structuredClone(valid);
			altered.mcpServers.grainulator.args[index] = value;
			fs.writeFileSync(path.join(root, "mcp.json"), JSON.stringify(altered));
			assert.equal(
				inspectBuild(root).verified,
				false,
				`changed wrapper arg ${index} must fail`,
			);
		}
		wrapped.mcpServers.grainulator.env.MEMORY = "changed";
		fs.writeFileSync(path.join(root, "mcp.json"), JSON.stringify(wrapped));
		assert.equal(inspectBuild(root).verified, false);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("handoff reproduction preserves timestamp binding and permits repeated artifact generation", (t) => {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-handoff-regression-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const output = path.join(dir, "handoff.json");
	for (let attempt = 0; attempt < 2; attempt++) {
		const result = spawnSync(
			process.execPath,
			[
				path.resolve(import.meta.dirname, "../../scripts/record-handoff.mjs"),
				output,
			],
			{ encoding: "utf8", timeout: 15000 },
		);
		assert.equal(result.status, 0, result.stderr);
		const artifact = JSON.parse(fs.readFileSync(output, "utf8")) as {
			stages: {
				decision: { allow: boolean };
				inputHash: string;
				compiledHash: string;
			}[];
		};
		assert.deepEqual(
			artifact.stages.map((stage) => stage.decision.allow),
			[true, false, true],
		);
		assert.notEqual(
			artifact.stages[1]!.inputHash,
			artifact.stages[1]!.compiledHash,
		);
		assert.equal(
			artifact.stages[2]!.inputHash,
			artifact.stages[2]!.compiledHash,
		);
	}
});

test("local packing rewrites every staged manifest to the verified local version", (t) => {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-local-pack-regression-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const result = spawnSync(
		process.execPath,
		[path.resolve(import.meta.dirname, "../../scripts/pack-local.mjs"), dir],
		{ encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
	);
	assert.equal(result.status, 0, result.stderr);
	const report = JSON.parse(result.stdout) as {
		stage: string;
		version: string;
		archive: string;
	};
	assert.ok(
		fs
			.realpathSync(report.stage)
			.startsWith(
				path.join(fs.realpathSync(os.tmpdir()), "grainulator-local-build-"),
			),
	);
	t.after(() => fs.rmSync(report.stage, { recursive: true, force: true }));
	assert.equal(inspectBuild(report.stage).verified, true);
	assert.match(report.version, /-local\.[a-f0-9]{16}$/);
	for (const name of [
		"package.json",
		"plugin.json",
		".claude-plugin/plugin.json",
		".codex-plugin/plugin.json",
		...fs
			.readdirSync(path.join(report.stage, "packages"))
			.map((component) => `packages/${component}/package.json`),
	]) {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(report.stage, name), "utf8"),
		) as { version: string };
		assert.equal(manifest.version, report.version, name);
	}
	assert.ok(fs.statSync(report.archive).size > 0);
});
