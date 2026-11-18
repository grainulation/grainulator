import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	previewRemoteMigration,
	applyRemoteMigration,
	reconcileRemoteMigration,
} from "./remote.mjs";
function fixture(t, format = "snapshot") {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-remote-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	let current = {
		id: "42",
		version: 3,
		title: "Wheat: research",
		labels: [
			format === "snapshot" ? "wheat-active" : "silo-claims",
			"team-private",
		],
		body:
			format === "snapshot"
				? "<p>A claim says Wheat, Silo and Mill.</p>"
				: "<table><th>Content</th><th>Tags</th></table><!-- silo-meta: historical -->",
	};
	const calls = [];
	let failAfter = false;
	const adapter = {
		read: async (dest) => {
			assert.equal(dest.pageId, "42");
			return structuredClone(current);
		},
		update: async (request) => {
			const receipt = JSON.parse(
				fs.readFileSync(path.join(dir, "receipt.json")),
			);
			assert.equal(receipt.pages[0].state, "sent");
			assert.equal(request.expected_version, current.version);
			calls.push(request);
			current = {
				id: current.id,
				version: request.version,
				title: request.title,
				labels: request.labels,
				body: request.body,
			};
			if (failAfter) throw new Error("Lost response");
			return { id: current.id, version: current.version };
		},
	};
	return {
		adapter,
		calls,
		receiptFile: path.join(dir, "receipt.json"),
		pages: [
			{ site: "https://wiki.example", space: "ENG", pageId: "42", format },
		],
		get page() {
			return current;
		},
		set page(value) {
			current = value;
		},
		loseResponse() {
			failAfter = true;
		},
	};
}
test("preview is read-only and explicit-ID; metadata changes preserve exact evidence bytes and unrelated labels", async (t) => {
	const f = fixture(t);
	const original = structuredClone(f.page);
	const plan = await previewRemoteMigration(f);
	assert.equal(f.calls.length, 0);
	assert.equal(fs.existsSync(f.receiptFile), false);
	assert.equal(plan.entries[0].after.body, original.body);
	assert.equal(plan.entries[0].after.title, "Grainulator: research");
	assert.deepEqual(plan.entries[0].after.labels, [
		"grainulator-active",
		"team-private",
	]);
	await assert.rejects(
		previewRemoteMigration({
			...f,
			pages: [{ site: "x", space: "y", pageId: "A title", format: "snapshot" }],
		}),
	);
});
test("apply requires authorization, uses exact CAS, journals sent before write, and known-confirmed repeats never update", async (t) => {
	const f = fixture(t);
	const plan = await previewRemoteMigration(f);
	await assert.rejects(applyRemoteMigration({ ...f, plan }), /authorization/);
	await applyRemoteMigration({ ...f, plan, authorized: true });
	assert.equal(f.calls.length, 1);
	await applyRemoteMigration({ ...f, plan, authorized: true });
	assert.equal(f.calls.length, 1);
	assert.equal(
		JSON.parse(fs.readFileSync(f.receiptFile)).pages[0].state,
		"confirmed",
	);
});
test("stale body/title/labels/version refuse before remote update", async (t) => {
	for (const field of ["version", "body", "title", "labels"]) {
		const f = fixture(t);
		const plan = await previewRemoteMigration(f);
		f.page = {
			...f.page,
			[field]:
				field === "version"
					? 4
					: field === "labels"
						? ["wheat-active", "other"]
						: "edited",
		};
		await assert.rejects(
			applyRemoteMigration({ ...f, plan, authorized: true }),
			/changed/,
		);
		assert.equal(f.calls.length, 0);
	}
});
test("lost response is uncertain, repeat refuses, explicit reconciliation confirms exact existing page without replay", async (t) => {
	const f = fixture(t);
	const plan = await previewRemoteMigration(f);
	f.loseResponse();
	await assert.rejects(
		applyRemoteMigration({ ...f, plan, authorized: true }),
		/uncertain/,
	);
	await assert.rejects(
		applyRemoteMigration({ ...f, plan, authorized: true }),
		/Reconcile/,
	);
	assert.equal(f.calls.length, 1);
	await reconcileRemoteMigration({ ...f, plan });
	await applyRemoteMigration({ ...f, plan, authorized: true });
	assert.equal(f.calls.length, 1);
});
test("canonical memory table supports metadata-only migration and preserves historical comment/claim bytes", async (t) => {
	const f = fixture(t, "memory-table"),
		bytes = f.page.body;
	const plan = await previewRemoteMigration(f);
	await applyRemoteMigration({ ...f, plan, authorized: true });
	assert.equal(f.page.body, bytes);
	assert.deepEqual(f.page.labels, ["grainulator-claims", "team-private"]);
	assert.equal(f.page.title, "Wheat: research");
});
test("contradictory formats, duplicate IDs and tampered plan refuse", async (t) => {
	const f = fixture(t);
	await assert.rejects(
		previewRemoteMigration({ ...f, pages: [...f.pages, ...f.pages] }),
		/Duplicate/,
	);
	f.page.labels.push("silo-claims");
	await assert.rejects(previewRemoteMigration(f), /Contradictory/);
	f.page.labels = ["wheat-active"];
	const plan = await previewRemoteMigration(f);
	plan.entries[0].after.title = "Injected";
	await assert.rejects(
		applyRemoteMigration({ ...f, plan, authorized: true }),
		/integrity/,
	);
	assert.equal(f.calls.length, 0);
});

test("finalization requires inspected marker hash and bound confirmed receipt; ambiguity remains blocked", async (t) => {
	const { completeRemoteMigration } = await import("./remote.mjs");
	const crypto = await import("node:crypto");
	const { default: gate } = await import(
		"../packages/shared/lib/remote-migration.cjs"
	);
	const f = fixture(t);
	const state = path.join(
		path.dirname(f.receiptFile),
		".grainulator",
		"evidence",
	);
	fs.mkdirSync(state, { recursive: true });
	f.receiptFile = path.join(state, "receipt.json");
	const adapter = {
		...f.adapter,
		update: async (request) => {
			f.calls.push(request);
			f.page = {
				id: "42",
				version: request.version,
				title: request.title,
				body: request.body,
				labels: request.labels,
			};
			return { id: "42", version: request.version };
		},
	};
	const markerFile = path.join(state, "remote-migration.json");
	const marker = {
		schema: "grainulator.remote-migration.v1",
		state: "pending",
		ambiguity: false,
		pages: [{ pageId: "42", format: "snapshot" }],
		sync_sources: [{ state: { opaque: "preserved" } }],
	};
	fs.writeFileSync(markerFile, JSON.stringify(marker));
	assert.throws(
		() => gate.assertRemoteMigrationReady(path.dirname(path.dirname(state))),
		/migration/i,
	);
	const plan = await previewRemoteMigration({
		...f,
		adapter,
		pages: f.pages.map((page) => ({
			...page,
			inventory: marker.pages[0],
			sourceId: "sprint-a:claims",
		})),
	});
	await applyRemoteMigration({ ...f, adapter, plan, authorized: true });
	const expectedMarkerSha256 = crypto
		.createHash("sha256")
		.update(fs.readFileSync(markerFile))
		.digest("hex");
	assert.throws(
		() =>
			completeRemoteMigration({
				plan,
				receiptFile: f.receiptFile,
				markerFile,
				expectedMarkerSha256: "0".repeat(64),
			}),
		/hash/,
	);
	const completed = completeRemoteMigration({
		plan,
		receiptFile: f.receiptFile,
		markerFile,
		expectedMarkerSha256,
	});
	assert.deepEqual(completed.sync_sources, marker.sync_sources);
	assert.equal(completed.state, "complete");
	gate.assertRemoteMigrationReady(path.dirname(path.dirname(state)));
	fs.writeFileSync(markerFile, JSON.stringify({ ...marker, ambiguity: true }));
	assert.throws(
		() =>
			completeRemoteMigration({
				plan,
				receiptFile: f.receiptFile,
				markerFile,
				expectedMarkerSha256: crypto
					.createHash("sha256")
					.update(fs.readFileSync(markerFile))
					.digest("hex"),
			}),
		/Ambiguous/,
	);
});

test("explicit local inventory resolution requires CAS and complete documented sources, preserves original bytes and never calls an adapter", async (t) => {
	const { resolveRemoteInventory } = await import("./remote.mjs");
	const crypto = await import("node:crypto");
	const f = fixture(t);
	const markerFile = path.join(
			path.dirname(f.receiptFile),
			"remote-migration.json",
		),
		source = {
			source_relative_path: "sync-state.json",
			state: { sprints: { a: { pages: {} } } },
		};
	const original = JSON.stringify({
		schema: "grainulator.remote-migration.v1",
		state: "pending",
		ambiguity: true,
		pages: [],
		sync_sources: [source],
	});
	fs.writeFileSync(markerFile, original);
	const sha = (value) =>
		crypto.createHash("sha256").update(value).digest("hex");
	const args = {
		markerFile,
		expectedMarkerSha256: sha(original),
		completeInventory: true,
		reason: "Reviewed owned page records",
		evidence: ["audit:existing-page-42"],
		mappings: [
			{
				source_sha256: sha(JSON.stringify(source)),
				sourceId: "a:claims",
				role: "claims",
				site: "https://wiki.example",
				space: "ENG",
				pageId: "42",
				format: "snapshot",
			},
		],
	};
	assert.throws(
		() =>
			resolveRemoteInventory({ ...args, expectedMarkerSha256: "0".repeat(64) }),
		/hash/,
	);
	assert.deepEqual(fs.readdirSync(path.dirname(markerFile)).sort(), [
		"remote-migration.json",
	]);
	assert.throws(
		() => resolveRemoteInventory({ ...args, mappings: [] }),
		/Every owned source/,
	);
	const result = resolveRemoteInventory(args);
	assert.equal(result.ambiguity, false);
	assert.equal(result.state, "pending");
	assert.equal(result.pages[0].pageId, "42");
	assert.equal(
		fs.readFileSync(
			path.join(
				path.dirname(markerFile),
				"remote-history",
				sha(original) + ".json",
			),
			"utf8",
		),
		original,
	);
	assert.deepEqual(result.sync_sources, [source]);
	assert.equal(f.calls.length, 0);
});
test("documented not-configured review unblocks an empty inventory without assuming missing IDs mean absence", async (t) => {
	const { resolveRemoteInventory } = await import("./remote.mjs");
	const crypto = await import("node:crypto");
	const { default: gate } = await import(
		"../packages/shared/lib/remote-migration.cjs"
	);
	const f = fixture(t),
		project = path.dirname(f.receiptFile),
		state = path.join(project, ".grainulator", "evidence");
	fs.mkdirSync(state, { recursive: true });
	const markerFile = path.join(state, "remote-migration.json"),
		source = { source_relative_path: "sync-state.json", state: {} };
	const original = JSON.stringify({
		schema: "grainulator.remote-migration.v1",
		state: "pending",
		ambiguity: true,
		pages: [],
		sync_sources: [source],
	});
	fs.writeFileSync(markerFile, original);
	assert.throws(() => gate.assertRemoteMigrationReady(project), /migration/);
	const sha = (value) =>
		crypto.createHash("sha256").update(value).digest("hex");
	const result = resolveRemoteInventory({
		markerFile,
		expectedMarkerSha256: sha(original),
		completeInventory: true,
		reason: "Owned scope was reviewed and never configured",
		evidence: ["audit:tenant-export"],
		notConfigured: [
			{
				source_sha256: sha(JSON.stringify(source)),
				reason: "Reviewed tenant inventory and local ownership records",
				evidence: ["audit:tenant-export"],
			},
		],
	});
	assert.equal(result.state, "complete");
	assert.equal(result.pages.length, 0);
	gate.assertRemoteMigrationReady(project);
	assert.equal(f.calls.length, 0);
});

test("mixed ambiguous sources retain every known page/role and cannot be waived at file level", async (t) => {
	const { resolveRemoteInventory } = await import("./remote.mjs");
	const crypto = await import("node:crypto");
	const sha = (value) =>
		crypto.createHash("sha256").update(value).digest("hex");
	const f = fixture(t),
		folder = path.dirname(f.receiptFile),
		markerFile = path.join(folder, "remote-migration.json");
	const source = {
		source_relative_path: "sync-state.json",
		state: {
			a: { pages: { claims: { pageId: "42" }, brief: { pageId: "43" } } },
			b: { pages: {} },
		},
	};
	const known = [
		{
			pageId: "42",
			format: "snapshot",
			site: "https://wiki.example",
			space: "ENG",
			source_relative_path: "sync-state.json",
			scope: ["a", "pages", "claims"],
		},
		{
			pageId: "43",
			format: "snapshot",
			site: "https://wiki.example",
			space: "ENG",
			source_relative_path: "sync-state.json",
			scope: ["a", "pages", "brief"],
		},
	];
	const original = JSON.stringify({
		schema: "grainulator.remote-migration.v1",
		state: "pending",
		ambiguity: true,
		pages: known,
		sync_sources: [source],
	});
	fs.writeFileSync(markerFile, original);
	const base = {
		markerFile,
		expectedMarkerSha256: sha(original),
		completeInventory: true,
		reason: "Explicit per-page review",
		evidence: ["audit:owned-existing-pages"],
	};
	const mappings = known.map((page, index) => ({
		source_sha256: sha(JSON.stringify(source)),
		sourceId: "a:" + index,
		role: index ? "brief" : "claims",
		site: page.site,
		space: page.space,
		pageId: page.pageId,
		format: page.format,
		inventory: page,
	}));
	assert.throws(
		() =>
			resolveRemoteInventory({
				...base,
				notConfigured: [
					{
						source_sha256: sha(JSON.stringify(source)),
						reason: "Not configured",
						evidence: ["audit:incomplete"],
					},
				],
			}),
		/known pages/,
	);
	assert.throws(
		() => resolveRemoteInventory({ ...base, mappings: mappings.slice(0, 1) }),
		/Every retained/,
	);
	assert.throws(
		() =>
			resolveRemoteInventory({
				...base,
				mappings: mappings.map((m, index) =>
					index ? { ...m, pageId: "99" } : m,
				),
			}),
		/identity mapping differs/,
	);
	assert.throws(
		() =>
			resolveRemoteInventory({
				...base,
				mappings: mappings.map((m, index) =>
					index ? { ...m, space: "OTHER" } : m,
				),
			}),
		/scope differs/,
	);
	assert.equal(fs.readFileSync(markerFile, "utf8"), original);
	const discovered = {
		source_sha256: sha(JSON.stringify(source)),
		sourceId: "b:claims",
		role: "claims",
		site: "https://wiki.example",
		space: "ENG",
		pageId: "44",
		format: "snapshot",
		supplemental: true,
		scope: ["b", "pages"],
		reason:
			"Review located an owned existing page missing from old local metadata",
		evidence: ["audit:existing-page-44"],
	};
	assert.throws(
		() =>
			resolveRemoteInventory({
				...base,
				mappings: [...mappings, { ...discovered, evidence: [] }],
			}),
		/documentary evidence/,
	);
	assert.throws(
		() =>
			resolveRemoteInventory({
				...base,
				mappings: [...mappings, { ...discovered, scope: ["missing"] }],
			}),
		/not present/,
	);
	assert.equal(fs.readFileSync(markerFile, "utf8"), original);
	const result = resolveRemoteInventory({
		...base,
		mappings: [...mappings, discovered],
	});
	assert.equal(result.pages.length, 3);
	assert.equal(result.ambiguity, false);
	assert.deepEqual(
		result.pages.slice(0, 2).map((page) => page.scope),
		known.map((page) => page.scope),
	);
	assert.deepEqual(result.pages[2].source_reference.scope, ["b", "pages"]);
	assert.deepEqual(result.pages[2].source_reference.evidence, [
		"audit:existing-page-44",
	]);
	assert.equal(result.state, "pending");
	assert.equal(f.calls.length, 0);
});
