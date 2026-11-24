// Generated from typescript/test/dogfood/migration-boundaries.test.mts; edit that source and run npm run build:types.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { publishSnapshot } from "../../lib/confluence-sync.js";
import { createHandler } from "../../lib/grainulator-mcp.js";
import {
	applyRemoteMigration,
	completeRemoteMigration,
	previewRemoteMigration,
} from "../../migration/remote.mjs";
import protection from "../../packages/exports/lib/output-safety.js";
import { Confluence } from "../../packages/memory/lib/confluence.js";
import remoteGate from "../../packages/shared/lib/remote-migration.cjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const digest = (bytes) =>
	crypto.createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-boundaries-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}
function file(target, data) {
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(
		target,
		typeof data === "string" ? data : JSON.stringify(data),
	);
}
function parseToolResponse(response) {
	assert.ok(typeof response === "string");
	return JSON.parse(response);
}
function evidence(dir) {
	file(path.join(dir, "claims.json"), {
		schema_version: "1.0",
		meta: { question: "Boundary fixture" },
		claims: [
			{
				id: "r1",
				type: "factual",
				topic: "scope",
				content: "Preserve all private originals",
				evidence: "stated",
				status: "active",
				source: { origin: "fixture" },
			},
		],
	});
}
test("both nested sprint layouts see the project remote marker before any connector operation", async (t) => {
	const dir = fixture(t);
	file(path.join(dir, ".grainulator/evidence/remote-migration.json"), {
		schema: "grainulator.remote-migration.v1",
		state: "pending",
		pages: [{ pageId: "42", format: "snapshot" }],
	});
	for (const relative of ["sprints/a", ".grainulator/evidence/sprints/a"]) {
		const sprint = path.join(dir, relative);
		evidence(sprint);
		let calls = 0;
		const connector = {
			formats: ["storage"],
			read: async () => {
				calls++;
			},
			write: async () => {
				calls++;
			},
		};
		const result = await publishSnapshot({
			dir: sprint,
			workspace: dir,
			authorized: true,
			destination: { site: "https://wiki.example", space: "ENG", pageId: "42" },
			compilation: { status: "ready" },
			connector,
		});
		assert.equal(result.written, false);
		const api = new Confluence({
			baseUrl: "https://wiki.example",
			token: "fixture",
			email: "fixture",
			spaceKey: "ENG",
		});
		api._request = async () => {
			calls++;
			throw new Error("must not execute");
		};
		await assert.rejects(
			api.publish("Title", [], { dir: sprint, workspace: dir, pageId: "42" }),
			/migration/i,
		);
		await assert.rejects(
			api.listPages({ dir: sprint, workspace: dir }),
			/migration/i,
		);
		assert.equal(calls, 0);
		assert.throws(
			() => remoteGate.assertRemoteMigrationReady(sprint),
			/migration/i,
		);
	}
});
test("confirmed receipt binds site, space, page ID and exact source/role inventory", async (t) => {
	const dir = fixture(t),
		state = path.join(dir, ".grainulator/evidence");
	const inventory = {
		pageId: "42",
		format: "snapshot",
		site: "https://wiki.example",
		space: "ENG",
		scope: { slug: "sprint-a", role: "claims", source: "sync-state" },
	};
	const markerFile = path.join(state, "remote-migration.json");
	file(markerFile, {
		schema: "grainulator.remote-migration.v1",
		state: "pending",
		ambiguity: false,
		pages: [inventory],
	});
	let page = {
		id: "42",
		version: 1,
		title: "Wheat: a",
		labels: ["wheat-active"],
		body: "Immutable user evidence",
	};
	const adapter = {
		read: async () => structuredClone(page),
		update: async (request) => {
			page = {
				...page,
				version: request.version,
				title: request.title,
				labels: request.labels,
			};
			return { id: "42", version: page.version };
		},
	};
	const plan = await previewRemoteMigration({
		adapter,
		pages: [
			{
				site: inventory.site,
				space: inventory.space,
				pageId: "42",
				format: "snapshot",
				inventory,
				sourceId: "sprint-a:claims",
			},
		],
	});
	const receiptFile = path.join(state, "receipt.json");
	await applyRemoteMigration({ plan, adapter, receiptFile, authorized: true });
	completeRemoteMigration({
		plan,
		receiptFile,
		markerFile,
		expectedMarkerSha256: digest(fs.readFileSync(markerFile)),
	});
	const destination = {
		site: inventory.site,
		space: inventory.space,
		pageId: "42",
	};
	remoteGate.assertRemoteMigrationReady(dir, {
		destination,
		sourceId: "sprint-a:claims",
	});
	assert.throws(
		() =>
			remoteGate.assertRemoteMigrationReady(dir, {
				destination: { site: destination.site, space: destination.space },
				sourceId: "sprint-a:claims",
				newSource: "new-collection",
			}),
		/Known migrated source/,
	);
	remoteGate.assertRemoteMigrationReady(dir, {
		destination: { site: destination.site, space: destination.space },
		newSource: "new-collection",
	});
	let writes = 0;
	const api = new Confluence({
		baseUrl: destination.site,
		spaceKey: destination.space,
		token: "fixture",
		email: "fixture",
	});
	api._request = async (method) => {
		assert.equal(method, "POST");
		writes++;
		return {
			id: "99",
			title: "New collection",
			version: { number: 1 },
			_links: { webui: "/99" },
		};
	};
	const created = await api.publish("New collection", [], {
		dir,
		newSource: "new-collection",
	});
	assert.equal(created.id, "99");
	assert.equal(writes, 1);
	await assert.rejects(
		api.publish("Known collection", [], { dir, sourceId: "sprint-a:claims" }),
		/Known migrated source/,
	);
	await assert.rejects(
		api.publish("Wrong space", [], { dir, spaceKey: "OTHER", pageId: "42" }),
		/reconciled/,
	);
	assert.equal(writes, 1);
	for (const different of [
		{ ...destination, space: "OTHER" },
		{ ...destination, site: "https://other.example" },
		{ ...destination, pageId: "43" },
	])
		assert.throws(
			() =>
				remoteGate.assertRemoteMigrationReady(dir, { destination: different }),
			/reconciled/,
		);
	const changed = JSON.parse(fs.readFileSync(markerFile, "utf8"));
	changed.pages[0].scope.role = "brief";
	file(markerFile, changed);
	assert.throws(
		() => remoteGate.assertRemoteMigrationReady(dir, { destination }),
		/association/,
	);
});
test("CLI and MCP exports refuse migration journals, original state and configured arbitrary ledger filenames", async (t) => {
	const dir = fixture(t);
	evidence(dir);
	file(path.join(dir, "grainulator.config.json"), {
		schema_version: 1,
		evidence: {
			compiler: {
				claims: "private-ledger.data",
				compilation: "private-compiled.data",
			},
		},
	});
	for (const name of [
		"private-ledger.data",
		"private-compiled.data",
		".grainulator-migrations/transaction/journal.json",
		".wheat/original.data",
	])
		file(path.join(dir, name), "ORIGINAL");
	const handler = createHandler({ dir });
	for (const output of [
		"private-ledger.data",
		"private-compiled.data",
		".grainulator-migrations/transaction/journal.json",
		".wheat/original.data",
	]) {
		const target = path.join(dir, output);
		const cli = spawnSync(
			process.execPath,
			[
				path.join(root, "bin/grainulator.js"),
				"export",
				"export",
				"--format",
				"markdown",
				"claims.json",
				"--dir",
				dir,
				"-o",
				output,
			],
			{ encoding: "utf8" },
		);
		assert.equal(cli.status, 1, cli.stdout + cli.stderr);
		assert.equal(fs.readFileSync(target, "utf8"), "ORIGINAL");
		const response = parseToolResponse(
			await handler(
				"tools/call",
				{
					name: "exports_convert",
					arguments: { format: "markdown", source: "claims.json", output },
				},
				1,
			),
		);
		assert.equal(response.result.isError, true);
		assert.equal(fs.readFileSync(target, "utf8"), "ORIGINAL");
	}
});
test("custom original roots from canonical migration receipt remain protected", (t) => {
	const dir = fixture(t),
		original = path.join(dir, "old-custom-store");
	evidence(dir);
	file(path.join(original, "entry.data"), "ORIGINAL");
	const transaction = path.join(dir, ".grainulator-migrations", "fixture");
	file(path.join(transaction, "journal.json"), {
		plan: { operations: [{ source: original }] },
	});
	file(path.join(dir, ".grainulator/migration.json"), {
		schema: "grainulator.migration.v1",
		state: "complete",
		transaction_directory: transaction,
	});
	assert.throws(
		() =>
			protection.assertSafeOutput(path.join(original, "entry.data"), [
				path.join(dir, "claims.json"),
			]),
		/migration original/,
	);
	assert.equal(
		fs.readFileSync(path.join(original, "entry.data"), "utf8"),
		"ORIGINAL",
	);
});
test("MCP remote publication keeps trusted project scope and never calls the connector through a nested sprint", async (t) => {
	const dir = fixture(t),
		sprint = path.join(dir, "sprints", "a");
	evidence(sprint);
	file(path.join(dir, ".grainulator/evidence/remote-migration.json"), {
		schema: "grainulator.remote-migration.v1",
		state: "pending",
		pages: [],
	});
	const previous = Object.fromEntries(
		[
			"CONFLUENCE_BASE_URL",
			"CONFLUENCE_TOKEN",
			"CONFLUENCE_EMAIL",
			"CONFLUENCE_SPACE_KEY",
		].map((key) => [key, process.env[key]]),
	);
	Object.assign(process.env, {
		CONFLUENCE_BASE_URL: "https://wiki.example",
		CONFLUENCE_TOKEN: "fixture-only",
		CONFLUENCE_EMAIL: "fixture-only",
		CONFLUENCE_SPACE_KEY: "ENG",
	});
	const request = Confluence.prototype._request;
	let calls = 0;
	Confluence.prototype._request = async () => {
		calls++;
		throw new Error("Network must not be attempted");
	};
	try {
		const handler = createHandler({ dir });
		const response = parseToolResponse(
			await handler(
				"tools/call",
				{
					name: "memory_confluence",
					arguments: {
						action: "publish",
						title: "Do not create",
						dir: "sprints/a",
					},
				},
				1,
			),
		);
		assert.equal(response.result.isError, true);
		assert.match(
			JSON.parse(response.result.content[0].text).message,
			/migration/i,
		);
		assert.equal(calls, 0);
		const saved = process.cwd();
		try {
			process.chdir(sprint);
			const api = new Confluence({
				baseUrl: "https://wiki.example",
				token: "fixture",
				email: "fixture",
				spaceKey: "ENG",
			});
			await assert.rejects(api.publish("No scope override", []), /migration/i);
			assert.equal(calls, 0);
		} finally {
			process.chdir(saved);
		}
	} finally {
		Confluence.prototype._request = request;
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});
