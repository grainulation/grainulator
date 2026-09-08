import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveMemoryDir, Store } from "../../packages/memory/lib/store.js";
import { command, mcp, toolJSON } from "../../scripts/lib/local-checks.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = path.join(root, "bin/grainulator.js");
function fixture(t) {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-memory-regression-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}
function worker(argv) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, argv, {
			stdio: ["ignore", "ignore", "pipe"],
		});
		let error = "";
		child.stderr.on("data", (chunk) => {
			error += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) =>
			code === 0 ? resolve() : reject(Error(`Worker exit ${code}: ${error}`)),
		);
	});
}

test("concurrent memory writers preserve every collection and index entry from first initialization", async (t) => {
	const dir = fixture(t);
	const memory = path.join(dir, "memory");
	const file = path.join(dir, "writer.mjs");
	fs.writeFileSync(
		file,
		`import {Store} from ${JSON.stringify(pathToFileURL(path.join(root, "packages/memory/lib/store.js")).href)};const store=new Store(process.argv[2]);for(let i=0;i<80;i++)store.storeClaims(process.argv[3]+'-'+i,[{id:'r001',content:'Concurrent evidence '+i}]);`,
	);
	await Promise.all(
		Array.from({ length: 4 }, (_, i) => worker([file, memory, `writer${i}`])),
	);
	const store = new Store(memory);
	const entries = store.list();
	assert.equal(entries.length, 320);
	assert.equal(new Set(entries.map((entry) => entry.id)).size, 320);
	assert.equal(fs.readdirSync(store.claimsDir).length, 320);
	for (const entry of entries) {
		const data = store.getClaims(entry.id);
		assert.equal(data.meta.hash, entry.hash);
		assert.equal(data._integrityWarning, undefined);
	}
	assert.equal(fs.existsSync(`${store.indexPath}.lock`), false);
	// Concurrent removal and new insertion use the same transaction boundary.
	fs.writeFileSync(
		file,
		`import {Store} from ${JSON.stringify(pathToFileURL(path.join(root, "packages/memory/lib/store.js")).href)};const store=new Store(process.argv[2]);for(let i=0;i<40;i++){store.remove(process.argv[3]+'-'+(i*2));store.storeClaims(process.argv[3]+'-new-'+i,[{id:'r002',content:'Replacement evidence'}]);}`,
	);
	await Promise.all(
		Array.from({ length: 4 }, (_, i) => worker([file, memory, `writer${i}`])),
	);
	assert.equal(store.list().length, 320);
	assert.equal(fs.readdirSync(store.claimsDir).length, 320);
	assert.ok(store.verifyAll().every((entry) => entry.ok));
});

test("CLI and MCP share configured memory and return source provenance when reusing a finding", async (t) => {
	const dir = fixture(t);
	const memory = path.join(dir, "memory");
	const legacy = path.join(dir, "legacy");
	const explicit = path.join(dir, "explicit");
	const sprint = path.join(dir, "sprint");
	fs.mkdirSync(sprint);
	const source = {
		origin: "Independent test suite",
		artifact: "evidence/results.json",
		connector: null,
		witnessed_claim: "r001",
		relationship: "full_support",
	};
	const claim = {
		id: "r002",
		type: "factual",
		topic: "reuse",
		content: "A reusable sourced finding",
		evidence: "tested",
		status: "active",
		source,
		tags: ["verified"],
		timestamp: "2026-09-07T00:00:00Z",
	};
	fs.writeFileSync(
		path.join(sprint, "claims.json"),
		JSON.stringify({
			schema_version: "1.0",
			meta: { question: "Source portability" },
			claims: [claim],
		}),
	);
	const env = { GRAINULATOR_MEMORY_DIR: memory, SILO_STORE: legacy };
	const client = mcp([process.execPath, cli, "mcp", "--dir", sprint], {
		cwd: sprint,
		env,
	});
	t.after(() => client.close());
	const call = async (name, args = {}) =>
		toolJSON(await client.request("tools/call", { name, arguments: args }));
	await client.request("initialize");
	await call("memory_store", { name: "From MCP" });
	const run = (args) =>
		command([process.execPath, cli, "memory", ...args], { cwd: sprint, env });
	assert.equal(JSON.parse(run(["list", "--json"]))[0].id, "from-mcp");
	assert.equal(fs.existsSync(legacy), false);
	run([
		"store",
		"From CLI",
		"--from",
		path.join(sprint, "claims.json"),
		"--json",
	]);
	assert.equal((await call("memory_list")).count, 2);
	assert.equal(
		JSON.parse(
			run([
				"search",
				"doesnotexist",
				"--type",
				"factual",
				"--memory-dir",
				memory,
				"--json",
			]),
		).length,
		0,
	);
	assert.equal(
		JSON.parse(
			run(["search", "reusable", "--evidence", "production", "--json"]),
		).length,
		0,
	);
	const retrieved = (await call("memory_search", { query: "reusable" }))
		.claims[0];
	assert.deepEqual(retrieved.source, source);
	assert.deepEqual(retrieved.tags, ["verified"]);
	assert.equal(retrieved.timestamp, claim.timestamp);
	assert.equal(
		JSON.parse(run(["list", "--memory-dir", explicit, "--json"])).length,
		0,
	);
	assert.equal((await call("memory_list")).count, 2);
	const legacyOnly = JSON.parse(
		command([process.execPath, cli, "memory", "list", "--json"], {
			cwd: sprint,
			env: { GRAINULATOR_MEMORY_DIR: "", SILO_STORE: memory },
		}),
	);
	assert.equal(legacyOnly.length, 2);
});

test("memory path precedence preserves existing legacy data without migration or startup writes", (t) => {
	const dir = fixture(t);
	const options = { homeDir: dir, env: {} };
	const canonical = path.join(dir, ".grainulator", "memory");
	const legacy = path.join(dir, ".silo");
	assert.equal(resolveMemoryDir(undefined, options), canonical);
	assert.deepEqual(fs.readdirSync(dir), []);
	fs.mkdirSync(legacy);
	fs.writeFileSync(path.join(legacy, "index.json"), "{}");
	assert.equal(resolveMemoryDir(undefined, options), legacy);
	assert.equal(fs.existsSync(canonical), false);
	fs.mkdirSync(canonical, { recursive: true });
	fs.writeFileSync(path.join(canonical, "index.json"), "{}");
	assert.equal(resolveMemoryDir(undefined, options), canonical);
	const env = {
		GRAINULATOR_MEMORY_DIR: path.join(dir, "configured"),
		SILO_STORE: legacy,
	};
	assert.equal(
		resolveMemoryDir(undefined, { ...options, env }),
		env.GRAINULATOR_MEMORY_DIR,
	);
	assert.equal(
		resolveMemoryDir(path.join(dir, "explicit"), { ...options, env }),
		path.join(dir, "explicit"),
	);
	assert.equal(
		resolveMemoryDir(undefined, { ...options, env: { SILO_STORE: legacy } }),
		legacy,
	);
});
