import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test, { type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const plugin = fileURLToPath(
	new URL("../../bin/grainulator-plugin.js", import.meta.url),
);

type Capabilities = { roots?: { listChanged?: boolean } };
type SharedRoots =
	| readonly { uri: string; name?: string }[]
	| "error"
	| "silent";
interface SessionOptions {
	env: NodeJS.ProcessEnv;
	capabilities: Capabilities;
	roots?: SharedRoots | ((count: number) => SharedRoots);
	cwd: string;
	afterInitialize?: {
		method: string;
		params?: unknown;
		notification?: boolean;
	}[];
}
interface ToolResult {
	isError: boolean;
	content: { text: string }[];
}
interface RpcMessage {
	id?: number;
	method?: string;
	result?: unknown;
	error?: { code: number };
}

// Drive the plugin entry like an agent: answer roots/list the way `roots` says.
async function session({
	env,
	capabilities,
	roots,
	cwd,
	afterInitialize = [],
}: SessionOptions) {
	const child = spawn(process.execPath, [plugin], {
		cwd,
		env: {
			...process.env,
			GRAINULATOR_WORKSPACE: "",
			GRAINULATOR_TOOLSET: undefined,
			...env,
		},
		stdio: ["pipe", "pipe", "pipe"],
	});
	const replies = new Map<number | undefined, (message: RpcMessage) => void>();
	const asked: string[] = [];
	const lines = readline.createInterface({ input: child.stdout });
	lines.on("line", (line) => {
		const message: RpcMessage = JSON.parse(line);
		if (message.method === "roots/list") {
			asked.push(message.method);
			const sharedRoots =
				typeof roots === "function" ? roots(asked.length) : roots;
			const reply =
				sharedRoots === "error"
					? { error: { code: -32601, message: "Method not found" } }
					: sharedRoots === "silent"
						? null
						: { result: { roots: sharedRoots } };
			if (reply)
				child.stdin.write(
					`${JSON.stringify({ jsonrpc: "2.0", id: message.id, ...reply })}\n`,
				);
			return;
		}
		replies.get(message.id)?.(message);
	});
	let next = 0;
	const call = (method: string, params: unknown) =>
		new Promise<RpcMessage>((resolve) => {
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
	const prelude = [];
	for (const request of afterInitialize) {
		if (request.notification)
			child.stdin.write(
				`${JSON.stringify({ jsonrpc: "2.0", method: request.method, ...(Object.hasOwn(request, "params") ? { params: request.params } : {}) })}\n`,
			);
		else prelude.push(await call(request.method, request.params));
	}
	await call("ping", {});

	const listing = (await call("tools/list", {})) as RpcMessage & {
		result: { tools: { name: string }[] };
	};
	const compact = listing.result.tools.some(
		(tool) => tool.name === "configure_sprint",
	);
	const init = (await call("tools/call", {
		name: compact ? "configure_sprint" : "init",
		arguments: {
			...(compact ? { mode: "create" } : {}),
			question: "Which database?",
		},
	})) as RpcMessage & { result: ToolResult };
	child.stdin.end();
	await new Promise((resolve) => child.on("close", resolve));
	return { init, asked, prelude, listing };
}

function setup(t: TestContext) {
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

const created = (folder: string) =>
	fs.existsSync(path.join(folder, "claims.json"));

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

test("compact roots recover damaged saved bindings when the environment selects a known profile", async (t) => {
	for (const contents of [
		"{",
		"null",
		'{"schema":2}',
		'{"schema":1,"toolset":"typo"}',
	]) {
		const s = setup(t);
		fs.writeFileSync(s.noConfig.GRAINULATOR_CONFIG, contents);
		const result = await session({
			cwd: s.cwd,
			env: { ...s.noConfig, GRAINULATOR_TOOLSET: "compact" },
			capabilities: { roots: {} },
			roots: [{ uri: pathToFileURL(s.project).href }],
		});
		assert.equal(result.listing.result.tools.length, 15);
		assert.equal(
			result.init.result.isError,
			false,
			JSON.stringify(result.init),
		);
		assert.ok(created(s.project));
		assert.equal(created(s.saved), false);
	}
});

test("a valid saved compact profile remains usable with shared roots and an unusable fallback", async (t) => {
	const s = setup(t);
	fs.writeFileSync(
		s.noConfig.GRAINULATOR_CONFIG,
		JSON.stringify({
			schema: 1,
			workspace: path.join(s.dir, "missing"),
			toolset: "compact",
		}),
	);
	const result = await session({
		cwd: s.cwd,
		env: s.noConfig,
		capabilities: { roots: {} },
		roots: [{ uri: pathToFileURL(s.project).href }],
	});
	assert.equal(result.listing.result.tools.length, 15);
	assert.equal(result.init.result.isError, false);
	assert.ok(created(s.project));
});

test("unusable roots fall back to the saved default", async (t) => {
	for (const roots of [
		"error",
		[],
		[{ uri: "https://example.com/repo" }],
		[{ uri: pathToFileURL("/definitely/missing/grainulator").href }],
	] satisfies SharedRoots[]) {
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
		init.result.content[0]!.text,
		/did not share a project folder.*setup --dir/,
	);
	assert.ok(!created(s.cwd), "the plugin folder is never used as the project");
});

const initialize = (capabilities: Capabilities) => ({
	protocolVersion: "2025-06-18",
	capabilities,
	clientInfo: { name: "repeat", version: "1" },
});

test("stdio preserves falsy params for validation before any dispatch", async (t) => {
	const s = setup(t);
	const { prelude } = await session({
		cwd: s.cwd,
		env: s.withConfig(),
		capabilities: {},
		afterInitialize: [null, false, 0, ""].flatMap((params) => [
			{ method: "ping", params },
			{ method: "tools/call", params },
		]),
	});
	assert.equal(prelude.length, 8);
	for (const response of prelude)
		assert.equal(response.error?.code, -32602, JSON.stringify(response));
});

test("rejected and repeated initialize cannot change negotiated roots", async (t) => {
	for (const repeat of [
		{ ...initialize({ roots: {} }), clientInfo: null },
		initialize({ roots: { listChanged: true } }),
	]) {
		const s = setup(t);
		const { init, asked } = await session({
			cwd: s.cwd,
			env: s.withConfig(),
			capabilities: {},
			roots: [{ uri: pathToFileURL(s.project).href }],
			afterInitialize: [{ method: "initialize", params: repeat }],
		});
		assert.equal(init.result.isError, false);
		assert.deepEqual(asked, []);
		assert.ok(created(s.saved));
		assert.equal(created(s.project), false);
	}
	const s = setup(t);
	const { init, asked } = await session({
		cwd: s.cwd,
		env: s.withConfig(),
		capabilities: { roots: {} },
		roots: [{ uri: pathToFileURL(s.project).href }],
		afterInitialize: [{ method: "initialize", params: initialize({}) }],
	});
	assert.equal(init.result.isError, false);
	assert.deepEqual(asked, ["roots/list"]);
	assert.ok(created(s.project));
	assert.equal(created(s.saved), false);
});

test("only negotiated valid roots notifications invalidate the cached workspace", async (t) => {
	for (const [listChanged, params, expectedRequests] of [
		[false, {}, 1],
		[true, null, 1],
		[true, [], 1],
		[true, { _meta: false }, 1],
		[true, { _meta: { progressToken: false } }, 1],
		[true, {}, 2],
	] satisfies [boolean, unknown, number][]) {
		const s = setup(t);
		const { asked } = await session({
			cwd: s.cwd,
			env: s.withConfig(),
			capabilities: { roots: { listChanged } },
			roots: (count) => [
				{ uri: pathToFileURL(count === 1 ? s.project : s.explicit).href },
			],
			afterInitialize: [
				{
					method: "tools/call",
					params: { name: "init", arguments: { question: "First workspace" } },
				},
				{
					notification: true,
					method: "notifications/roots/list_changed",
					params,
				},
			],
		});
		assert.equal(
			asked.length,
			expectedRequests,
			JSON.stringify({ listChanged, params }),
		);
		assert.ok(created(s.project));
		assert.equal(created(s.explicit), expectedRequests === 2);
	}
	const s = setup(t);
	const { asked } = await session({
		cwd: s.cwd,
		env: s.withConfig(),
		capabilities: {},
		roots: [{ uri: pathToFileURL(s.project).href }],
		afterInitialize: [
			{
				notification: true,
				method: "notifications/roots/list_changed",
				params: {},
			},
		],
	});
	assert.deepEqual(asked, []);
	assert.ok(created(s.saved));
	assert.equal(created(s.project), false);
});

test("compact tools follow a negotiated roots change", async (t) => {
	const s = setup(t);
	const { asked, init, prelude } = await session({
		cwd: s.cwd,
		env: { ...s.withConfig(), GRAINULATOR_TOOLSET: "compact" },
		capabilities: { roots: { listChanged: true } },
		roots: (count) => [
			{ uri: pathToFileURL(count === 1 ? s.project : s.explicit).href },
		],
		afterInitialize: [
			{
				method: "tools/call",
				params: {
					name: "configure_sprint",
					arguments: { mode: "create", question: "First root" },
				},
			},
			{
				notification: true,
				method: "notifications/roots/list_changed",
				params: {},
			},
		],
	});
	const first = prelude[0];
	assert.ok(first);
	assert.equal((first.result as ToolResult).isError, false);
	assert.equal(init.result.isError, false);
	assert.equal(asked.length, 2);
	assert.ok(created(s.project));
	assert.ok(created(s.explicit));
	assert.equal(created(s.saved), false);
});
