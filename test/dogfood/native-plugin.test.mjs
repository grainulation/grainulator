import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { saveWorkspace } from "../../lib/workspace-config.js";
import { mcp, toolJSON } from "../../scripts/lib/local-checks.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t) {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-native-contract-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}
async function connect(
	t,
	dir,
	workspace,
	config = path.join(dir, "workspace.json"),
) {
	const server = JSON.parse(fs.readFileSync(path.join(root, "mcp.json")))
		.mcpServers.grainulator;
	const pluginData = path.join(dir, "plugin-data");
	const expand = (value) =>
		value
			.replaceAll(/\$\{PLUGIN_ROOT\}/g, root.replace(/\/$/, ""))
			.replaceAll(/\$\{PLUGIN_DATA\}/g, pluginData);
	const client = mcp([process.execPath, ...server.args.map(expand)], {
		cwd: dir,
		env: {
			...Object.fromEntries(
				Object.entries(server.env).map(([key, value]) => [key, expand(value)]),
			),
			GRAINULATOR_WORKSPACE: workspace,
			GRAINULATOR_CONFIG: config,
		},
	});
	t.after(() => client.close());
	const initialized = await client.request("initialize", {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "native-contract", version: "1" },
	});
	assert.equal(initialized.serverInfo.name, "grainulator");
	client.notify("notifications/initialized");
	return { client, pluginData };
}
test("native Agent Plugin manifest and Codex overlay register portable components", () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin.json")));
	const overlay = JSON.parse(
		fs.readFileSync(path.join(root, ".codex-plugin/plugin.json")),
	);
	assert.equal(
		manifest.$schema,
		"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
	);
	assert.equal(manifest.name, "grainulator");
	assert.equal(
		manifest.version,
		JSON.parse(fs.readFileSync(path.join(root, "package.json"))).version,
	);
	assert.equal(overlay.version, manifest.version);
	assert.ok(fs.existsSync(path.join(root, overlay.skills, "status/SKILL.md")));
	assert.deepEqual(overlay.mcpServers.grainulator.env_vars, [
		"GRAINULATOR_WORKSPACE",
		"GRAINULATOR_CONFIG",
	]);
	const server = JSON.parse(fs.readFileSync(path.join(root, "mcp.json")))
		.mcpServers.grainulator;
	assert.equal(server.command, "node");
	assert.doesNotMatch(
		JSON.stringify(server),
		/CLAUDE_PLUGIN|\/Users\/|\/usr\/local\//,
	);
});
test("native launcher binds only the explicitly selected workspace and persistent plugin memory", async (t) => {
	const dir = fixture(t),
		workspace = path.join(dir, "project");
	fs.mkdirSync(workspace);
	const { client, pluginData } = await connect(t, dir, workspace);
	assert.equal((await client.request("tools/list")).tools.length, 20);
	assert.equal(
		fs.existsSync(pluginData),
		false,
		"startup must not create persistent plugin data",
	);
	const initialized = toolJSON(
		await client.request("tools/call", {
			name: "init",
			arguments: {
				dir: path.join(workspace, "sprint"),
				question: "Native plugin binding",
				audience: "test",
			},
		}),
	);
	assert.equal(initialized.status, "ok");
	assert.ok(fs.existsSync(path.join(workspace, "sprint/claims.json")));
	await assert.rejects(
		client.request("tools/call", {
			name: "init",
			arguments: {
				dir: path.join(dir, "outside"),
				question: "Forbidden sibling",
			},
		}),
		/outside workspace/,
	);
	assert.equal(fs.existsSync(path.join(dir, "outside")), false);
	const memory = toolJSON(
		await client.request("tools/call", { name: "memory_list", arguments: {} }),
	);
	assert.equal(memory.status, "ok");
	assert.ok(fs.existsSync(path.join(pluginData, "memory/index.json")));
});
test("missing or relative native workspace binding exposes tools but cannot access sprint data", async (t) => {
	for (const binding of ["", "relative-project"]) {
		const dir = fixture(t);
		const { client, pluginData } = await connect(t, dir, binding);
		assert.equal((await client.request("tools/list")).tools.length, 20);
		await assert.rejects(
			client.request("tools/call", {
				name: "init",
				arguments: { dir, question: "Must not write" },
			}),
			/GRAINULATOR_WORKSPACE/,
		);
		const resource = await client
			.request("resources/read", { uri: "grainulator://claims" })
			.catch((error) => error);
		assert.ok(
			resource instanceof Error || resource.error,
			"unconfigured resources must not read the plugin directory",
		);
		assert.equal(fs.existsSync(path.join(dir, "claims.json")), false);
		assert.equal(fs.existsSync(pluginData), false);
	}
});

test("native launcher uses a saved workspace without launch environment binding", async (t) => {
	const dir = fixture(t),
		workspace = path.join(dir, "project");
	fs.mkdirSync(workspace);
	const config = path.join(dir, "workspace.json");
	saveWorkspace(workspace, { GRAINULATOR_CONFIG: config });
	const { client } = await connect(t, dir, "", config);
	const result = toolJSON(
		await client.request("tools/call", {
			name: "init",
			arguments: {
				dir: path.join(workspace, "sprint"),
				question: "Persistent binding",
				audience: "test",
			},
		}),
	);
	assert.equal(result.status, "ok");
	assert.ok(fs.existsSync(path.join(workspace, "sprint/claims.json")));
	await assert.rejects(
		client.request("tools/call", {
			name: "init",
			arguments: { dir: path.join(dir, "outside"), question: "Forbidden" },
		}),
		/outside workspace/,
	);
});
