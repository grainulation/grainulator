import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHandler } from "../../lib/grainulator-mcp.js";
import { calibrate } from "../../packages/analytics/lib/calibration.js";
import { checkDecay, decayAlerts } from "../../packages/analytics/lib/decay.js";
import { convert as csv } from "../../packages/exports/lib/formats/csv.mjs";
import { convert as jira } from "../../packages/exports/lib/formats/jira-csv.mjs";
import { convert as yaml } from "../../packages/exports/lib/formats/yaml.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const base = {
	type: "factual",
	topic: "audit",
	content: "A supported finding",
	evidence: "documented",
};
function fixture(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-audit-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const handle = createHandler({ dir, memoryDir: path.join(dir, "memory") });
	const call = async (name, args = {}) => {
		const rpc = JSON.parse(
			await handle("tools/call", { name, arguments: { dir, ...args } }, 1),
		);
		assert.ok(!rpc.error, JSON.stringify(rpc));
		return JSON.parse(rpc.result.content[0].text);
	};
	const read = () => JSON.parse(fs.readFileSync(path.join(dir, "claims.json")));
	return { dir, call, read };
}
async function init(call) {
	assert.equal(
		(await call("init", { question: "Audit contracts" })).status,
		"ok",
	);
}

test("exact ID lookup returns full evidence and lifecycle; one-sided conflicts resolve without overwriting", async (t) => {
	const { call, read } = fixture(t);
	await init(call);
	const content = `${"long evidence ".repeat(30)}IMPORTANT CAVEAT`;
	await call("add_claim", { ...base, id: "id-only-731", content });
	await call("add_claim", { ...base, id: "id-only-7310" });
	const original = read().claims[0];
	const got = await call("search", { id: original.id });
	assert.deepEqual(got.claims, [original]);
	assert.equal(
		(await call("search", { full: true })).claims[0].content,
		content,
	);
	assert.equal((await call("search")).claims[0].truncated, true);
	await call("add_claim", {
		...base,
		id: "x001",
		type: "feedback",
		conflicts_with: [original.id],
	});
	assert.deepEqual(read().claims[0], original);
	assert.equal((await call("compile")).compilation_status, "blocked");
	assert.deepEqual((await call("status")).conflicts, [["x001", original.id]]);
	assert.equal(
		(await call("resolve", { winner: "x001", loser: original.id })).status,
		"ok",
	);
	assert.equal((await call("search", { id: original.id })).count, 0);
	assert.equal(
		(await call("search", { id: original.id, include_inactive: true }))
			.claims[0].resolved_by,
		"x001",
	);
	const status = await call("status");
	assert.equal(status.total_claims, 3);
	assert.equal(status.active_claims, 2);
	assert.equal(status.type_distribution.feedback, 1);
	assert.deepEqual(status.topic_list, ["audit"]);
	assert.equal(status.evidence_distribution.documented, 2);
});

test("public calibration schema persists correct/wrong/partial/unknown outcomes; scorer excludes unknown binary scores", async (t) => {
	const { call, read, dir } = fixture(t);
	await init(call);
	for (const [i, verdict] of [
		"correct",
		"wrong",
		"partial",
		"unknown",
	].entries()) {
		await call("add_claim", {
			...base,
			id: `e${i}`,
			type: ["estimate", "risk", "recommendation", "estimate"][i],
		});
		assert.equal(
			(
				await call("add_claim", {
					...base,
					id: `cal${i}`,
					calibration: {
						prediction_id: `e${i}`,
						verdict,
						outcome: "Observed outcome",
						delta: i,
					},
				})
			).status,
			"ok",
		);
	}
	const before = fs.readFileSync(path.join(dir, "claims.json"), "utf8");
	assert.equal(
		(
			await call("add_claim", {
				...base,
				id: "bad",
				calibration: {
					prediction_id: "missing",
					verdict: "wrong",
					outcome: "x",
				},
			})
		).status,
		"error",
	);
	assert.equal(fs.readFileSync(path.join(dir, "claims.json"), "utf8"), before);
	const result = calibrate([{ name: "one", claims: read().claims }]);
	assert.equal(result.summary.matched, 4);
	assert.equal(result.summary.accuracyRate, 50);
	assert.equal(result.summary.partial, 1);
	assert.equal(result.summary.unknown, 1);
	assert.deepEqual(
		result.scored.map((c) => c.delta),
		[0, 1, 2, 3],
	);
	assert.equal(result.scored[0].estimateText, base.content);
	const cross = calibrate([
		{ name: "one", claims: read().claims },
		{ name: "two", claims: [{ ...base, id: "e0", type: "estimate" }] },
	]);
	assert.equal(cross.summary.matched, 4);
	assert.equal(cross.summary.unmatched, 1);
	const unknown = calibrate([
		{
			name: "one",
			claims: read().claims.filter((c) => ["e3", "cal3"].includes(c.id)),
		},
	]);
	assert.equal(unknown.summary.accuracyRate, null);
	assert.deepEqual(unknown.calibrationByConfidence, {});
	const cli = spawnSync(
		process.execPath,
		[
			path.join(root, "bin/grainulator.js"),
			"add",
			"--dir",
			dir,
			"--id",
			"cli-outcome",
			"--type",
			"factual",
			"--topic",
			"audit",
			"--content",
			"Actual eight vs predicted five",
			"--calibration",
			JSON.stringify({
				prediction_id: "e0",
				verdict: "wrong",
				outcome: "8 days",
				delta: 3,
			}),
			"--json",
		],
		{ encoding: "utf8" },
	);
	assert.equal(cli.status, 0, cli.stderr + cli.stdout);
	assert.equal(JSON.parse(cli.stdout).claim.calibration.delta, 3);
});

test("document imports are atomic, conservative, idempotent and do not resurrect historical or locally rejected findings", async (t) => {
	const { call, read, dir } = fixture(t);
	await init(call);
	const claims = [
		{
			...base,
			id: "a",
			evidence: "production",
			source: { origin: "publisher", artifact: "evidence" },
			conflicts_with: ["b"],
		},
		{ ...base, id: "b", status: "active" },
		{ ...base, id: "old", status: "superseded", resolved_by: "a" },
	];
	const args = { source: "https://example.com/page/123", claims };
	const first = await call("import_claims", args);
	assert.equal(first.imported, 2);
	assert.equal(first.skipped_inactive, 1);
	assert.equal(read().claims[0].evidence, "stated");
	assert.deepEqual(read().claims[0].source.imported_source, claims[0].source);
	assert.deepEqual(read().claims[0].conflicts_with, [first.id_map.b]);
	assert.equal((await call("compile")).compilation_status, "blocked");
	await call("resolve", { winner: first.id_map.a, loser: first.id_map.b });
	const before = fs.readFileSync(path.join(dir, "claims.json"), "utf8");
	const repeat = await call("import_claims", args);
	assert.equal(repeat.imported, 0);
	assert.equal(repeat.existing, 2);
	assert.equal(fs.readFileSync(path.join(dir, "claims.json"), "utf8"), before);
	const changed = await call("import_claims", {
		...args,
		claims: [
			{ ...base, id: "new" },
			{ ...claims[0], content: "Changed" },
		],
	});
	assert.equal(changed.status, "error");
	assert.equal(fs.readFileSync(path.join(dir, "claims.json"), "utf8"), before);
	const source = path.join(dir, "source.json");
	fs.writeFileSync(source, JSON.stringify(claims));
	const cli = spawnSync(
		process.execPath,
		[
			path.join(root, "bin/grainulator.js"),
			"import",
			"--dir",
			dir,
			"--file",
			source,
			"--source",
			args.source,
		],
		{ encoding: "utf8" },
	);
	assert.equal(cli.status, 0, cli.stderr + cli.stdout);
	assert.equal(JSON.parse(cli.stdout).existing, 2);
});

test("fresh full-support witness renews age; partial/contradictory or another sprint witness does not", () => {
	const now = "2026-09-22T00:00:00Z";
	const old = {
		...base,
		id: "old",
		timestamp: "2026-01-01T00:00:00Z",
		evidence: "web",
	};
	const witness = {
		...base,
		id: "w",
		timestamp: now,
		source: { witnessed_claim: "old", relationship: "full_support" },
	};
	assert.equal(
		checkDecay([{ name: "a", claims: [old, witness] }], {
			now,
			thresholdDays: 7,
		}).summary.decayingCount,
		0,
	);
	assert.equal(
		decayAlerts([{ name: "a", claims: [old, witness] }], { now }).summary
			.totalAlerts,
		0,
	);
	for (const relationship of ["partial_support", "contradicts"]) {
		const result = checkDecay(
			[
				{
					name: "a",
					claims: [
						old,
						{ ...witness, source: { ...witness.source, relationship } },
					],
				},
			],
			{ now, thresholdDays: 7 },
		);
		assert.equal(result.decaying[0].text, old.content);
	}
	assert.equal(
		checkDecay(
			[
				{ name: "a", claims: [old] },
				{ name: "b", claims: [witness] },
			],
			{ now },
		).summary.decayingCount,
		1,
	);
});

test("analytics report creates missing destination directories from unrelated cwd", async (t) => {
	const { dir, call } = fixture(t);
	await init(call);
	const output = path.join(dir, "output", "analytics.html");
	const cli = spawnSync(
		process.execPath,
		[
			path.join(root, "bin/grainulator.js"),
			"analytics",
			"report",
			dir,
			"-o",
			output,
		],
		{ cwd: os.tmpdir(), encoding: "utf8" },
	);
	assert.equal(cli.status, 0, cli.stderr + cli.stdout);
	assert.match(fs.readFileSync(output, "utf8"), /<!DOCTYPE html>/i);
});

test("Codex patch guard checks add/update/delete/rename and allows ordinary patches", () => {
	for (const header of [
		"Add File: claims.json",
		"Update File: nested/compilation.json",
		"Delete File: claims.json",
		"Update File: ordinary.md\n*** Move to: claims.json",
	]) {
		const result = spawnSync(
			process.execPath,
			[path.join(root, "hooks/write-guard.cjs")],
			{
				input: JSON.stringify({
					tool_name: "apply_patch",
					tool_input: {
						command: `*** Begin Patch\n*** ${header}\n+x\n*** End Patch`,
					},
				}),
				encoding: "utf8",
			},
		);
		assert.equal(result.status, 2, header);
	}
	const allowed = spawnSync(
		process.execPath,
		[path.join(root, "hooks/write-guard.cjs")],
		{
			input: JSON.stringify({
				tool_input: {
					command:
						"*** Begin Patch\n*** Add File: ordinary.md\n+claims.json\n*** End Patch",
				},
			}),
		},
	);
	assert.equal(allowed.status, 0);
});

test("CSV carriage returns/formulas preserve row boundaries in independent parser; YAML roundtrips all JSON types", async (t) => {
	const content = "before\rafter\nlast\n";
	const input = {
		meta: { question: "yes", "a:b": "2026-01-01" },
		claims: [
			{ ...base, id: "a", content },
			{ ...base, id: "b", content: "=1+2" },
		],
		nested: [[{ "a\nb": "\u0000\t\r\n\u0085\u2028\u2029" }], [], {}],
		scalars: ["ON", "-1", "null", true, false, 1, null],
	};
	const csvParsed = spawnSync(
		"python3",
		[
			"-c",
			"import csv,json,sys,io; d=json.load(sys.stdin); print(json.dumps([list(csv.reader(io.StringIO(s,newline=''))) for s in d]))",
		],
		{ input: JSON.stringify([csv(input), jira(input)]), encoding: "utf8" },
	);
	assert.equal(csvParsed.status, 0, csvParsed.stderr);
	const [normal, issues] = JSON.parse(csvParsed.stdout);
	assert.equal(normal.length, 3);
	assert.equal(issues.length, 3);
	assert.equal(normal[1][3], content);
	assert.equal(issues[1][1], content);
	assert.equal(normal[2][3], "'=1+2");
	assert.equal(issues[2][1], "'=1+2");
	await t.test("independent YAML parser preserves values", (yt) => {
		// A YAML parser is an optional local acceptance dependency, not required by the runtime.
		const parsed = spawnSync(
			"python3",
			[
				"-c",
				"import yaml,json,sys; print(json.dumps(yaml.safe_load(sys.stdin.read())))",
			],
			{ input: yaml(input), encoding: "utf8" },
		);
		if (parsed.status !== 0 && /No module named 'yaml'/.test(parsed.stderr)) {
			yt.skip("Install PyYAML for independent YAML parsing");
			return;
		}
		assert.equal(parsed.status, 0, parsed.stderr);
		assert.deepEqual(JSON.parse(parsed.stdout), input);
	});
});

test("format catalogue excludes helpers; memory search labels supersession", async (t) => {
	const { call, dir } = fixture(t);
	await init(call);
	const formats = await call("exports_formats");
	assert.doesNotMatch(JSON.stringify(formats), /_shared/);
	await call("add_claim", {
		...base,
		id: "old",
		content: "uniquememorymarker",
	});
	await call("add_claim", {
		...base,
		id: "new",
		content: "uniquememorymarker",
		conflicts_with: ["old"],
	});
	await call("resolve", { winner: "new", loser: "old" });
	const push = await call("memory_store", {
		from: path.join(dir, "claims.json"),
		name: "audit",
	});
	assert.equal(push.status, "ok", JSON.stringify(push));
	const search = await call("memory_search", { query: "uniquememorymarker" });
	const old = search.claims.find((c) => c.id === "old");
	assert.equal(old.status, "superseded");
	assert.equal(old.resolved_by, "new");
});

test("Markdown-family exports render raw HTML as text without changing source records", async () => {
	const data = {
		meta: { question: "<img src=x onerror=alert(1)>" },
		claims: [
			{
				...base,
				id: "hostile",
				content: "<script>alert(1)</script> & <img src=x onerror=alert(1)>",
			},
		],
	};
	const before = JSON.stringify(data);
	for (const name of ["markdown", "github-issues", "changelog", "obsidian"]) {
		const { convert } = await import(
			`../../packages/exports/lib/formats/${name}.mjs`
		);
		const output = convert(data);
		assert.doesNotMatch(output, /<script|<img/i, name);
		assert.match(output, /&lt;/, name);
	}
	assert.equal(JSON.stringify(data), before);
});

test("smart fetch reports degraded/error/concise/full/truncated results without claiming complete evidence", async (t) => {
	const { createServer } = await import("node:http");
	const { smartFetch } = await import(
		"../../packages/memory/lib/smart-fetch.js"
	);
	const server = createServer((req, res) => {
		res.setHeader("content-type", "text/html");
		res.end(
			req.url === "/short"
				? "<main><p>This short passage has no corroborating detail.</p></main>"
				: req.url === "/truncated"
					? `<script>${"x".repeat(2000)}</script><main><p>Unseen caveat</p></main>`
					: `<main><p>${"Evidence paragraph. ".repeat(150)}</p><p>${"More evidence. ".repeat(50)}</p></main>`,
		);
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	t.after(() => {
		server.closeAllConnections();
		server.close();
	});
	const url = `http://127.0.0.1:${server.address().port}`;
	const options = { allowPrivate: true, cache: false, privacy: true };
	const degraded = await smartFetch(`${url}/short`, options);
	assert.equal(degraded.quality, "degraded");
	assert.equal(degraded.mode_used, "concise");
	assert.ok(!degraded.warnings.some((w) => w.startsWith("auto-retry:")));
	const concise = await smartFetch(`${url}/long`, options);
	assert.equal(concise.content.length, 2048);
	assert.equal(concise.truncated, true);
	const full = await smartFetch(`${url}/long`, { ...options, mode: "full" });
	assert.ok(full.content.length > 2048);
	assert.equal(full.truncated, false);
	const truncated = await smartFetch(`${url}/truncated`, {
		...options,
		maxBytes: 100,
	});
	assert.equal(truncated.quality, "failed");
	assert.equal(truncated.truncated, true);
	assert.ok(truncated.warnings.some((w) => w.startsWith("auto-retry:")));
	const invalid = await smartFetch("file:///etc/passwd", options);
	assert.equal(invalid.ok, false);
});

test("Confluence snapshot preserves blocked findings visibly and hostile CDATA roundtrips", async () => {
	const { buildBriefPageBody, buildJsonCodeBlock } = await import(
		"../../lib/confluence-sync.js"
	);
	const { extractJsonFromStorage } = await import(
		"../../lib/confluence-pull.js"
	);
	const compilation = {
		status: "blocked",
		errors: [{ code: "E_CONFLICT", message: "a contradicts b <script>" }],
		claims: [{ ...base, content: "]]> <script>alert(1)</script>" }],
	};
	const body = buildBriefPageBody(compilation, Date.now());
	assert.match(body, /Compilation status: blocked/);
	assert.match(body, /a contradicts b &lt;script&gt;/);
	assert.deepEqual(
		extractJsonFromStorage(buildJsonCodeBlock(compilation)),
		compilation,
	);
});

test("publication coordinator uses discovered formats, authorizes destination, preserves blockers and never retries ambiguous writes", async () => {
	const { publishSnapshot } = await import("../../lib/confluence-sync.js");
	let writes = 0;
	let sent;
	const destination = {
		site: "https://example.atlassian.net",
		space: "TEST",
		pageId: "123",
	};
	const compilation = {
		status: "blocked",
		errors: [{ message: "a conflicts with b" }],
		claims: [],
	};
	const connector = {
		formats: ["adf"],
		read: async () => ({ id: "123", version: 4 }),
		write: async (payload) => {
			writes++;
			sent = payload;
			return {
				status: "ok",
				id: "123",
				url: "https://example.atlassian.net/wiki/123",
			};
		},
	};
	const args = { destination, compilation, connector };
	assert.equal((await publishSnapshot(args)).written, false);
	assert.equal(
		(
			await publishSnapshot({
				...args,
				authorized: true,
				destination: [destination, destination],
			})
		).written,
		false,
	);
	assert.equal(writes, 0);
	const result = await publishSnapshot({ ...args, authorized: true });
	assert.equal(result.status, "ok");
	assert.equal(result.compilation_status, "blocked");
	assert.equal(sent.format, "adf");
	assert.equal(sent.version, 5);
	assert.match(JSON.stringify(sent.body), /Compilation status: blocked/);
	assert.match(JSON.stringify(sent.body), /a conflicts with b/);
	for (const failure of [
		() => {
			throw new Error("409 conflict SECRET");
		},
		() => ({
			status: "error",
			id: "123",
			url: "https://example.atlassian.net/wiki/123",
		}),
		() => ({ status: "ok", id: "wrong" }),
	]) {
		const before = writes;
		const failed = await publishSnapshot({
			...args,
			authorized: true,
			connector: {
				...connector,
				write: async () => {
					writes++;
					return failure();
				},
			},
		});
		assert.equal(failed.status, "error");
		assert.equal(failed.written, "unknown");
		assert.equal(writes, before + 1);
		assert.equal(failed.url, undefined);
		assert.doesNotMatch(JSON.stringify(failed), /SECRET/);
	}
});

test("document conflict IDs cannot resolve through object prototypes", async (t) => {
	const { call, read } = fixture(t);
	await init(call);
	const result = await call("import_claims", {
		source: "document",
		claims: [{ ...base, id: "a", conflicts_with: ["__proto__"] }],
	});
	assert.equal(result.status, "error");
	assert.deepEqual(read().claims, []);
});

test("CSV formula protection covers whitespace and line-feed prefixes", () => {
	for (const content of ["\n=1+2", "  =1+2", "\uFEFF@SUM(1,2)", "\t-1+2"]) {
		const text = csv({ claims: [{ ...base, id: "a", content }] });
		const parsed = spawnSync(
			"python3",
			[
				"-c",
				"import csv,sys,json,io; print(json.dumps(list(csv.reader(io.StringIO(sys.stdin.read(),newline='')))))",
			],
			{ input: text, encoding: "utf8" },
		);
		assert.equal(parsed.status, 0, parsed.stderr);
		assert.equal(JSON.parse(parsed.stdout)[1][3], `'${content}`);
	}
});
