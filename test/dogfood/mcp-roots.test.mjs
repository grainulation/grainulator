import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const plugin = fileURLToPath(
	new URL("../../bin/grainulator-plugin.js", import.meta.url),
);

// Drive the plugin entry like an agent: answer roots/list the way `roots` says.
async function session({ env, capabilities, roots, cwd }) {
	const child = spawn(process.execPath, [plugin], {
		cwd,
		env: { ...process.env, GRAINULATOR_WORKSPACE: "", ...env },
		stdio: ["pipe", "pipe", "pipe"],
	});
	const replies = new Map();
	const asked = [];
	const lines = readline.createInterface({ input: child.stdout });
	lines.on("line", (line) => {
		const message = JSON.parse(line);
		if (message.method === "roots/list") {
			asked.push(message.method);
			const reply =
				roots === "error"
					? { error: { code: -32601, message: "Method not found" } }
					: roots === "silent"
						? null
						: { result: { roots } };
			if (reply)
				child.stdin.write(
					`${JSON.stringify({ jsonrpc: "2.0", id: message.id, ...reply })}\n`,
				);
			return;
		}
		replies.get(message.id)?.(message);
	});
	let next = 0;
	const call = (method, params) =>
		new Promise((resolve) => {
			const id = ++next;
			replies.set(id, resolve);
			child.stdin.write(
				`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
			);
		});
	await call("initialize", {
		protocolVersion: "2024-11-05",
		capabilities,
		clientInfo: { name: "test", version: "0" },
	});
	child.stdin.write(
		`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
	);
	const init = await call("tools/call", {
		name: "init",
		arguments: { question: "Which database?" },
	});
	child.stdin.end();
	await new Promise((resolve) => child.on("close", resolve));
	return { init, asked };
}

function setup(t) {
	const dir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-roots-")),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	for (const name of ["plugin", "project", "saved", "explicit"])
		fs.mkdirSync(path.join(dir, name));
	const config = path.join(dir, "workspace.json");
	return {
		dir,
		cwd: path.join(dir, "plugin"),
		project: path.join(dir, "project"),
		saved: path.join(dir, "saved"),
		explicit: path.join(dir, "explicit"),
		noConfig: { GRAINULATOR_CONFIG: config },
		withConfig: () => {
			fs.writeFileSync(
				config,
				JSON.stringify({ schema: 1, workspace: path.join(dir, "saved") }),
			);
			return { GRAINULATOR_CONFIG: config };
		},
	};
}

const created = (folder) => fs.existsSync(path.join(folder, "claims.json"));

test("plugin uses the project folder the agent shares", async (t) => {
	const s = setup(t);
	const { init, asked } = await session({
		cwd: s.cwd,
		env: s.withConfig(),
		capabilities: { roots: { listChanged: true } },
		roots: [{ uri: pathToFileURL(s.project).href, name: "project" }],
	});
	assert.equal(init.result.isError, false, JSON.stringify(init.result));
	assert.deepEqual(asked, ["roots/list"]);
	assert.ok(created(s.project), "research is saved in the shared project");
	assert.ok(!created(s.saved) && !created(s.cwd), "nothing lands elsewhere");
});

test("an explicit GRAINULATOR_WORKSPACE wins and roots are never requested", async (t) => {
	const s = setup(t);
	const { init, asked } = await session({
		cwd: s.cwd,
		env: { ...s.withConfig(), GRAINULATOR_WORKSPACE: s.explicit },
		capabilities: { roots: {} },
		roots: [{ uri: pathToFileURL(s.project).href }],
	});
	assert.equal(init.result.isError, false);
	assert.deepEqual(asked, []);
	assert.ok(created(s.explicit));
});

test("agents without roots fall back to the saved default", async (t) => {
	const s = setup(t);
	const { init, asked } = await session({
		cwd: s.cwd,
		env: s.withConfig(),
		capabilities: {},
	});
	assert.equal(init.result.isError, false);
	assert.deepEqual(asked, []);
	assert.ok(created(s.saved));
});

test("unusable roots fall back to the saved default", async (t) => {
	for (const roots of [
		"error",
		[],
		[{ uri: "https://example.com/repo" }],
		[{ uri: pathToFileURL("/definitely/missing/grainulator").href }],
	]) {
		const s = setup(t);
		const { init } = await session({
			cwd: s.cwd,
			env: s.withConfig(),
			capabilities: { roots: {} },
			roots,
		});
		assert.equal(init.result.isError, false, JSON.stringify(roots));
		assert.ok(created(s.saved), JSON.stringify(roots));
		assert.ok(!created(s.cwd));
	}
});

test("no shared folder and no saved default reports how to fix it and touches nothing", async (t) => {
	const s = setup(t);
	const { init } = await session({
		cwd: s.cwd,
		env: s.noConfig,
		capabilities: {},
	});
	assert.equal(init.result.isError, true);
	assert.match(
		init.result.content[0].text,
		/did not share a project folder.*setup --dir/,
	);
	assert.ok(!created(s.cwd), "the plugin folder is never used as the project");
});
