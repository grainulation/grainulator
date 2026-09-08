import assert from "node:assert/strict";
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
