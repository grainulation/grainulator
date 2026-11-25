import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { saveWorkspace } from "../../lib/workspace-config.js";
import { mcp, toolJSON } from "../../scripts/lib/local-checks.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
function fixture(t: TestContext) {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-native-contract-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}
async function connect(
	t: TestContext,
	dir: string,
	workspace: string,
	config = path.join(dir, "workspace.json"),
	toolset?: string,
) {
	const {
		mcpServers: { grainulator: server },
	} = JSON.parse(fs.readFileSync(path.join(root, "mcp.json")).toString()) as {
		mcpServers: {
			grainulator: { args: string[]; env: Record<string, string> };
		};
	};
	const pluginData = path.join(dir, "plugin-data");
	const expand = (value: string) =>
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
			...(toolset === undefined ? {} : { GRAINULATOR_TOOLSET: toolset }),
		},
	});
	t.after(() => client.close());
	const initialized = await client.request("initialize", {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "native-contract", version: "1" },
	});
	assert.equal(
		(initialized as { serverInfo: { name: string } }).serverInfo.name,
		"grainulator",
	);
	client.notify("notifications/initialized");
	return { client, pluginData };
}
test("native Agent Plugin manifest and Codex overlay register portable components", () => {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(root, "plugin.json")).toString(),
	) as { $schema: string; name: string; version: string };
	const overlay = JSON.parse(
		fs.readFileSync(path.join(root, ".codex-plugin/plugin.json")).toString(),
	) as {
		version: string;
		skills: string;
		mcpServers: { grainulator: { env_vars: string[] } };
	};
	assert.equal(
		manifest.$schema,
		"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
	);
	assert.equal(manifest.name, "grainulator");
	assert.equal(
		manifest.version,
		(
			JSON.parse(
				fs.readFileSync(path.join(root, "package.json")).toString(),
			) as { version: string }
		).version,
	);
	assert.equal(overlay.version, manifest.version);
	assert.ok(fs.existsSync(path.join(root, overlay.skills, "status/SKILL.md")));
	assert.deepEqual(overlay.mcpServers.grainulator.env_vars, [
		"GRAINULATOR_WORKSPACE",
		"GRAINULATOR_CONFIG",
		"GRAINULATOR_TOOLSET",
		"GRAINULATOR_CLI",
	]);
	const {
		mcpServers: { grainulator: server },
	} = JSON.parse(fs.readFileSync(path.join(root, "mcp.json")).toString()) as {
		mcpServers: { grainulator: { command: string } };
	};
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
	assert.equal(
		((await client.request("tools/list")) as { tools: unknown[] }).tools.length,
		29,
	);
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
	assert.equal((initialized as { status: string }).status, "ok");
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
	assert.equal((memory as { status: string }).status, "ok");
	assert.ok(fs.existsSync(path.join(pluginData, "memory/index.json")));
});
test("missing or relative native workspace binding exposes tools but cannot access sprint data", async (t) => {
	for (const binding of ["", "relative-project"]) {
		const dir = fixture(t);
		const { client, pluginData } = await connect(t, dir, binding);
		assert.equal(
			((await client.request("tools/list")) as { tools: unknown[] }).tools
				.length,
			29,
		);
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
			resource instanceof Error || (resource as { error?: unknown }).error,
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
	assert.equal((result as { status: string }).status, "ok");
	assert.ok(fs.existsSync(path.join(workspace, "sprint/claims.json")));
	await assert.rejects(
		client.request("tools/call", {
			name: "init",
			arguments: { dir: path.join(dir, "outside"), question: "Forbidden" },
		}),
		/outside workspace/,
	);
});

test("native compact selection advertises and executes only its supported profile", async (t) => {
	const dir = fixture(t),
		workspace = path.join(dir, "project");
	fs.mkdirSync(workspace);
	const config = path.join(dir, "workspace.json");
	saveWorkspace(workspace, { GRAINULATOR_CONFIG: config }, "compact");
	const { client } = await connect(t, dir, "", config);
	const listing = (await client.request("tools/list")) as {
		tools: { name: string }[];
	};
	assert.equal(listing.tools.length, 15);
	assert.ok(listing.tools.some((tool) => tool.name === "configure_sprint"));
	assert.ok(!listing.tools.some((tool) => tool.name === "memory_confluence"));
	await assert.rejects(
		client.request("tools/call", {
			name: "init",
			arguments: { question: "Unadvertised name" },
		}),
	);
	const result = toolJSON(
		await client.request("tools/call", {
			name: "configure_sprint",
			arguments: {
				mode: "create",
				dir: path.join(workspace, "sprint"),
				question: "Compact plugin binding",
			},
		}),
	);
	assert.equal((result as { status: string }).status, "ok");
	assert.ok(fs.existsSync(path.join(workspace, "sprint/claims.json")));
	await assert.rejects(
		client.request("tools/call", {
			name: "configure_sprint",
			arguments: {
				mode: "create",
				dir: path.join(dir, "outside"),
				question: "Forbidden sibling",
			},
		}),
		/outside workspace/,
	);
	assert.equal(fs.existsSync(path.join(dir, "outside")), false);
});

test("an invalid native profile blocks tool calls instead of silently broadening access", async (t) => {
	const dir = fixture(t),
		workspace = path.join(dir, "project");
	fs.mkdirSync(workspace);
	const { client, pluginData } = await connect(
		t,
		dir,
		workspace,
		path.join(dir, "workspace.json"),
		"typo",
	);
	await assert.rejects(
		client.request("tools/call", {
			name: "init",
			arguments: { dir: workspace, question: "Must not write" },
		}),
		/toolset must be legacy or compact/,
	);
	assert.equal(fs.existsSync(path.join(workspace, "claims.json")), false);
	assert.equal(fs.existsSync(pluginData), false);
});
