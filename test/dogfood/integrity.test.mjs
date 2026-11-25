// Generated from typescript/test/dogfood/integrity.test.mts; edit that source and run npm run build:types.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { compile } from "../../packages/evidence/compiler/evidence-compiler.js";
import {
	addClaim,
	resolveClaim,
} from "../../packages/evidence/lib/claims-ops.js";
import { guard } from "../../packages/evidence/lib/guard.js";
import { loadClaims } from "../../packages/evidence/lib/load-claims.js";
import { ImportExport } from "../../packages/memory/lib/import-export.js";
import { Store } from "../../packages/memory/lib/store.js";
function sprint(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-integrity-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	fs.writeFileSync(
		path.join(dir, "claims.json"),
		JSON.stringify({
			schema_version: "1.0",
			meta: { question: "Dogfood", phase: "research" },
			claims: [],
		}),
	);
	return dir;
}
const claim = (id) => ({
	id,
	type: "factual",
	topic: "integrity",
	content: `Evidence ${id}`,
	evidence: "tested",
});
function snapshot(file) {
	const descriptor = fs.openSync(
		file,
		fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
	);
	try {
		const stat = fs.fstatSync(descriptor, { bigint: true });
		assert.ok(stat.isFile());
		return {
			bytes: fs.readFileSync(descriptor),
			dev: stat.dev,
			ino: stat.ino,
			mtimeNs: stat.mtimeNs,
		};
	} finally {
		fs.closeSync(descriptor);
	}
}
const read = (dir) =>
	JSON.parse(fs.readFileSync(path.join(dir, "claims.json"), "utf8"));
test("acknowledged concurrent mutations all survive", async (t) => {
	const dir = sprint(t);
	const module = new URL(
		"../../packages/evidence/lib/claims-ops.js",
		import.meta.url,
	).href;
	await Promise.all(
		Array.from(
			{ length: 12 },
			(_, i) =>
				new Promise((resolve, reject) => {
					const code = `import {addClaim} from ${JSON.stringify(module)}; for(let n=0;n<5;n++){const r=addClaim(${JSON.stringify(dir)}, {id:'p${i}-'+n,type:'factual',topic:'integrity',content:'evidence',evidence:'tested'});if(r.status!=='ok')throw Error(r.message);}`;
					const child = spawn(process.execPath, [
						"--input-type=module",
						"-e",
						code,
					]);
					let error = "";
					child.stderr.on("data", (data) => (error += data));
					child.on("error", reject);
					child.on("close", (status) =>
						status === 0 ? resolve() : reject(Error(error)),
					);
				}),
		),
	);
	assert.equal(read(dir).claims.length, 60);
	assert.equal(new Set(read(dir).claims.map((c) => c.id)).size, 60);
});
test("reads leave original bytes and timestamps unchanged", (t) => {
	const dir = sprint(t),
		file = path.join(dir, "claims.json");
	const before = snapshot(file);
	loadClaims(dir);
	loadClaims(dir);
	assert.deepEqual(snapshot(file), before);
});
test("resolution rationale survives reloading", (t) => {
	const dir = sprint(t);
	addClaim(dir, claim("a"));
	addClaim(dir, claim("b"));
	const doc = read(dir);
	doc.claims[0].conflicts_with = ["b"];
	fs.writeFileSync(path.join(dir, "claims.json"), JSON.stringify(doc));
	assert.equal(
		resolveClaim(dir, {
			winner: "a",
			loser: "b",
			reason: "Independent test supports a",
		}).status,
		"ok",
	);
	assert.equal(
		read(dir).claims[1].resolution.reason,
		"Independent test supports a",
	);
});
test("guard rejects missing status and stale input even with preserved timestamps", (t) => {
	const dir = sprint(t),
		file = path.join(dir, "claims.json"),
		output = path.join(dir, "compilation.json");
	const input = JSON.stringify({
		file_path: path.join(dir, "output/brief.md"),
	});
	fs.writeFileSync(output, "{}");
	assert.equal(guard(dir, input).allow, false);
	addClaim(dir, claim("a"));
	const descriptor = fs.openSync(
		file,
		fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
	);
	try {
		// Whole-second timestamps can be restored exactly through futimes on every host.
		const timestamp = new Date("2026-01-01T00:00:00Z");
		fs.futimesSync(descriptor, timestamp, timestamp);
		const before = fs.fstatSync(descriptor, { bigint: true });
		assert.ok(before.isFile());
		compile(file, output, dir, { skipSprintDetection: true });
		assert.equal(guard(dir, input).allow, true);
		const doc = JSON.parse(fs.readFileSync(descriptor, "utf8"));
		doc.claims[0].content = "Changed evidence";
		const changed = JSON.stringify(doc);
		fs.ftruncateSync(descriptor, 0);
		fs.writeSync(descriptor, changed, 0, "utf8");
		fs.futimesSync(descriptor, timestamp, timestamp);
		const after = snapshot(file);
		assert.equal(after.bytes.toString("utf8"), changed);
		assert.equal(after.dev, before.dev);
		assert.equal(after.ino, before.ino);
		assert.equal(after.mtimeNs, before.mtimeNs);
		assert.equal(guard(dir, input).allow, false);
	} finally {
		fs.closeSync(descriptor);
	}
});
test("memory imports preserve metadata and do not reuse existing IDs", (t) => {
	const dir = sprint(t),
		file = path.join(dir, "claims.json");
	addClaim(dir, claim("imp001"));
	const importer = new ImportExport(new Store(path.join(dir, "memory")));
	importer._resolveSource = () => [
		{ ...claim("source1"), content: "Imported evidence" },
	];
	assert.equal(importer.pull("fixture", file).imported, 1);
	assert.equal(read(dir).meta.question, "Dogfood");
	assert.equal(read(dir).schema_version, "1.0");
	assert.deepEqual(
		read(dir).claims.map((c) => c.id),
		["imp001", "imp002"],
	);
	assert.equal(importer.pull("fixture", file).imported, 0);
});
