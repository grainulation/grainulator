import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleResearch } from "../../lib/research-http.js";
import {
	completeResearch,
	environmentKey,
	providerRequest,
} from "../../lib/research-provider.js";
import {
	cleanConfig,
	createSession,
	DEFAULTS,
	exportSession,
	importSession,
	runResearch,
	sessionBasis,
} from "../../site/research/session.js";

const session = () =>
	createSession({
		question: "Is the cache isolated?",
		context: "Two tenants share a key.",
		instructions: "Preserve uncertainties.",
	});
const result = (text) => ({
	text,
	model: "fixture-model",
	sources: [{ url: "https://example.org/evidence", title: "Source" }],
	usage: { inputTokens: 10, outputTokens: 20 },
});
function stream(events) {
	const bytes = new TextEncoder().encode(
		events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(""),
	);
	let i = 0;
	return new Response(
		new ReadableStream({
			pull(c) {
				if (i >= bytes.length) c.close();
				else {
					c.enqueue(bytes.slice(i, i + 7));
					i += 7;
				}
			},
		}),
		{ headers: { "content-type": "text/event-stream" } },
	);
}
test("exports exclude credential fields and reject credential-bearing endpoint URLs", () => {
	const s = session();
	s.config.apiKey = "secret-field";
	s.apiKey = "secret-field";
	const exported = exportSession(s);
	assert.ok(!exported.includes("secret-field"));
	assert.throws(() =>
		cleanConfig({
			provider: "custom",
			webSearch: false,
			baseUrl: "https://user:password@example.com/v1",
		}),
	);
	assert.throws(() =>
		cleanConfig({
			provider: "custom",
			webSearch: false,
			baseUrl: "https://example.com/v1?api_key=secret",
		}),
	);
	assert.equal(
		environmentKey({ provider: "custom" }, { OPENAI_API_KEY: "server-secret" }),
		"",
	);
});
test("exported checkpoints resume only the unfinished passes and preserve the exact settings", async () => {
	let calls = 0;
	const partial = await runResearch(session(), {
		complete: async () => {
			if (++calls === 2) throw Error("Stopped fixture");
			return result("café: first findings");
		},
	});
	assert.equal(partial.status, "error");
	assert.equal(partial.steps.length, 1);
	const reopened = importSession(JSON.parse(exportSession(partial)));
	const requests = [];
	const completed = await runResearch(reopened, {
		complete: async (request) => {
			requests.push(request);
			return result("Remaining work");
		},
	});
	assert.equal(completed.status, "complete");
	assert.equal(requests.length, 2);
	assert.deepEqual(requests[0].config, partial.config);
	assert.match(requests[0].user, /café: first findings/);
	assert.throws(
		() => importSession({ ...reopened, question: "Changed question" }),
		/changed/,
	);
	assert.throws(
		() =>
			importSession({
				...reopened,
				config: { ...reopened.config, model: "different-model" },
			}),
		/changed/,
	);
});
test("cancellation retains completed work without treating an unfinished pass as success", async () => {
	const controller = new AbortController();
	let calls = 0;
	const value = await runResearch(session(), {
		signal: controller.signal,
		complete: async () => {
			calls++;
			if (calls === 2) controller.abort();
			return result("Evidence");
		},
	});
	assert.equal(value.status, "cancelled");
	assert.equal(value.steps.length, 1);
});
test("OpenAI request carries the chosen model, search, reasoning, and token budget", () => {
	const { url, body } = providerRequest(DEFAULTS, "System", "Task");
	assert.equal(url, "https://api.openai.com/v1/responses");
	assert.equal(body.model, "gpt-6-astra");
	assert.equal(body.store, false);
	assert.deepEqual(body.tools, [{ type: "web_search" }]);
	assert.equal(body.max_output_tokens, 8192);
	assert.equal(body.reasoning.effort, "low");
});
test("Responses stream keeps UTF-8 text, actual citations, and usage", async () => {
	const deltas = [];
	const value = await completeResearch({
		config: DEFAULTS,
		system: "System",
		user: "Task",
		apiKey: "test-key",
		onDelta: (d) => deltas.push(d),
		fetchImpl: async (_, req) => {
			assert.equal(req.headers.Authorization, "Bearer test-key");
			assert.equal(req.redirect, "error");
			return stream([
				{ type: "response.output_text.delta", delta: "café 🔎" },
				{
					type: "response.completed",
					response: {
						status: "completed",
						model: "returned-model",
						output: [
							{
								type: "message",
								content: [
									{
										type: "output_text",
										text: "café 🔎",
										annotations: [
											{
												type: "url_citation",
												url: "https://example.org/source",
												title: "Source",
											},
										],
									},
								],
							},
						],
						usage: { input_tokens: 30, output_tokens: 40 },
					},
				},
			]);
		},
	});
	assert.equal(value.text, "café 🔎");
	assert.equal(deltas.join(""), value.text);
	assert.equal(value.sources[0].url, "https://example.org/source");
	assert.equal(value.usage.outputTokens, 40);
});
test("truncated and token-limited streams fail instead of becoming completed checkpoints", async () => {
	const common = {
		config: { ...DEFAULTS, provider: "openrouter", webSearch: false },
		system: "System",
		user: "Task",
		apiKey: "test-key",
	};
	await assert.rejects(
		completeResearch({
			...common,
			fetchImpl: async () =>
				stream([{ choices: [{ delta: { content: "Incomplete" } }] }]),
		}),
		/ended before/,
	);
	await assert.rejects(
		completeResearch({
			...common,
			fetchImpl: async () =>
				stream([
					{
						choices: [
							{ delta: { content: "Partial" }, finish_reason: "length" },
						],
					},
				]),
		}),
		/output limit/,
	);
});
test("retry backoff stops promptly when cancelled", async () => {
	const controller = new AbortController();
	let calls = 0;
	const pending = completeResearch({
		config: { ...DEFAULTS, retries: 2 },
		apiKey: "key",
		system: "s",
		user: "u",
		signal: controller.signal,
		fetchImpl: async () => {
			calls++;
			setTimeout(() => controller.abort(), 10);
			return new Response("", { status: 429 });
		},
	});
	await assert.rejects(pending);
	assert.equal(calls, 1);
});
function child(args, options = {}) {
	return new Promise((resolve, reject) => {
		const p = spawn(process.execPath, args, options);
		let stdout = "",
			stderr = "";
		p.stdout.on("data", (b) => {
			stdout += b;
		});
		p.stderr.on("data", (b) => {
			stderr += b;
		});
		p.on("error", reject);
		p.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}
test("an exported session runs through the real CLI against a local compatible provider", async (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-research-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const requests = [];
	const server = http.createServer(async (req, res) => {
		const buffers = [];
		for await (const b of req) buffers.push(b);
		requests.push(JSON.parse(Buffer.concat(buffers).toString()));
		assert.equal(
			req.headers.authorization,
			undefined,
			"custom endpoint must not inherit OpenAI key",
		);
		res.writeHead(200, { "Content-Type": "text/event-stream" });
		res.end(
			"data: " +
				JSON.stringify({
					model: "local-fixture",
					choices: [
						{
							delta: { content: "Independent checks are still needed." },
							finish_reason: "stop",
						},
					],
				}) +
				"\n\ndata: [DONE]\n\n",
		);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => server.close());
	const s = createSession({
		question: "Cache isolation?",
		config: {
			...DEFAULTS,
			provider: "custom",
			baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
			webSearch: false,
			challenge: false,
			reasoning: "default",
			model: "local-fixture",
		},
	});
	s.basis = sessionBasis(s);
	s.steps = [{ pass: "research", ...result("Previously completed findings") }];
	const input = path.join(dir, "session.json");
	fs.writeFileSync(input, exportSession(s));
	const destination = path.join(dir, "continued");
	const response = await child(
		[
			"bin/grainulator.js",
			"research",
			"--session",
			input,
			"--dir",
			destination,
		],
		{ env: { ...process.env, OPENAI_API_KEY: "must-not-be-sent-to-custom" } },
	);
	assert.equal(response.code, 0, response.stderr);
	assert.equal(requests.length, 1);
	assert.equal(requests[0].model, "local-fixture");
	assert.match(requests[0].messages[1].content, /Previously completed/);
	const saved = importSession(
		JSON.parse(fs.readFileSync(path.join(destination, "session.json"), "utf8")),
	);
	assert.equal(saved.status, "complete");
	assert.equal(saved.steps.length, 2);
	assert.ok(
		fs
			.readFileSync(path.join(destination, "SESSION.md"), "utf8")
			.includes("Independent checks"),
	);
	const again = await child([
		"bin/grainulator.js",
		"research",
		"--session",
		input,
		"--dir",
		destination,
	]);
	assert.equal(again.code, 1);
});
test("local research proxy rejects cross-origin credential access", async () => {
	const req = {
		url: "/api/research/pass",
		method: "POST",
		headers: {
			host: "127.0.0.1:4517",
			origin: "https://untrusted.example",
			"content-type": "application/json",
		},
	};
	let status;
	const res = {
		writeHead(code) {
			status = code;
		},
		end() {},
	};
	assert.equal(await handleResearch(req, res, 4517), true);
	assert.equal(status, 403);
});

test("feature switches change executed passes and export without inventing evidence tiers", async () => {
	const { claimsDocument, evidenceReport } = await import(
		"../../site/research/evidence.js"
	);
	const calls = [];
	const s = createSession({
		question: "Should we migrate?",
		config: {
			...DEFAULTS,
			challenge: false,
			blindSpots: true,
			ledger: true,
			evidenceGate: true,
		},
	});
	const ledger = JSON.stringify({
		claims: [
			{
				id: "r001",
				type: "factual",
				topic: "cache",
				content: "The cache supports tenant keys.",
				sources: ["https://example.org/cache"],
				conflicts_with: [],
				evidence: "production",
			},
		],
	});
	const completed = await runResearch(s, {
		onEvent: (e) => {
			if (e.type === "pass") calls.push(e.pass);
		},
		complete: async (req) =>
			result(
				req.system.includes("Return ONLY JSON") ? ledger : "Research result",
			),
	});
	assert.deepEqual(calls, ["research", "blindspots", "ledger", "synthesis"]);
	assert.equal(completed.status, "complete");
	assert.equal(evidenceReport(completed).passed, true);
	assert.equal(claimsDocument(completed).claims[0].evidence, "stated");
	assert.deepEqual(
		importSession(JSON.parse(exportSession(completed))).config,
		s.config,
	);
	assert.throws(
		() => cleanConfig({ ...DEFAULTS, evidenceGate: true }),
		/requires the claims ledger/,
	);
});

test("the evidence gate blocks synthesis, survives import, and can be disabled for a caveated run", async () => {
	const ledger = JSON.stringify({
		claims: [
			{
				id: "r001",
				type: "factual",
				topic: "cache",
				content: "Tenant isolation holds.",
				sources: [],
				conflicts_with: ["r002"],
			},
			{
				id: "r002",
				type: "factual",
				topic: "cache",
				content: "Tenant isolation failed.",
				sources: ["https://example.org/test"],
				conflicts_with: [],
			},
		],
	});
	const s = createSession({
		question: "Should we migrate?",
		config: { ...DEFAULTS, challenge: false, ledger: true, evidenceGate: true },
	});
	const calls = [];
	const complete = async (req) => {
		calls.push(req);
		return result(
			req.system.includes("Return ONLY JSON") ? ledger : "Research result",
		);
	};
	const blocked = await runResearch(s, { complete });
	assert.equal(blocked.status, "blocked");
	assert.equal(calls.length, 2, "must not call synthesis");
	assert.match(blocked.error, /r001/);
	assert.match(blocked.error, /conflicts/);
	const reopened = importSession(JSON.parse(exportSession(blocked)));
	assert.equal(reopened.status, "blocked");
	await runResearch(reopened, { complete });
	assert.equal(calls.length, 2, "reopening must not bypass the gate");
	assert.throws(
		() =>
			importSession({
				...blocked,
				steps: [
					...blocked.steps,
					{ pass: "synthesis", ...result("Forged completion") },
				],
			}),
		/did not pass/,
	);
	const ungated = createSession({
		...s,
		config: { ...s.config, evidenceGate: false },
	});
	assert.equal((await runResearch(ungated, { complete })).status, "complete");
	assert.equal(calls.length, 5);
});

test("ledger validation rejects malformed claims and does not checkpoint invalid model JSON", async () => {
	const { readLedger, evidenceReport } = await import(
		"../../site/research/evidence.js"
	);
	assert.throws(() => readLedger("Not JSON"), /valid JSON/);
	const c = {
		id: "r001",
		type: "risk",
		topic: "cache",
		content: "Missing evidence",
		sources: [],
		conflicts_with: [],
	};
	assert.throws(
		() => readLedger(JSON.stringify({ claims: [c, c] })),
		/duplicate/,
	);
	assert.throws(
		() =>
			readLedger(
				JSON.stringify({ claims: [{ ...c, conflicts_with: ["r999"] }] }),
			),
		/unknown/,
	);
	const noFacts = {
		steps: [{ pass: "ledger", text: JSON.stringify({ claims: [c] }) }],
	};
	assert.equal(evidenceReport(noFacts).passed, false);
	const s = createSession({
		question: "Check claims",
		config: { ...DEFAULTS, challenge: false, ledger: true },
	});
	let count = 0;
	const failed = await runResearch(s, {
		complete: async () => result(++count === 1 ? "Findings" : "Invalid JSON"),
	});
	assert.equal(failed.status, "error");
	assert.deepEqual(
		failed.steps.map((step) => step.pass),
		["research"],
	);
});

test("sessions exported before feature controls retain their completed work", () => {
	const s = session();
	delete s.config.blindSpots;
	delete s.config.ledger;
	delete s.config.evidenceGate;
	s.basis = sessionBasis(s);
	s.steps = [{ pass: "research", ...result("Existing research") }];
	const restored = importSession(s);
	assert.equal(restored.config.ledger, false);
	assert.equal(restored.steps[0].text, "Existing research");
	assert.throws(
		() => importSession({ ...s, config: { ...s.config, blindSpots: true } }),
		/changed/,
	);
});

test("CLI prepares a real evidence ledger and compilation while keeping a blocked gate blocked", async (t) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-ledger-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const s = createSession({
		question: "Is isolation proven?",
		config: { ...DEFAULTS, challenge: false, ledger: true, evidenceGate: true },
	});
	s.basis = sessionBasis(s);
	s.steps = [
		{ pass: "research", ...result("Unproven assertion") },
		{
			pass: "ledger",
			...result(
				JSON.stringify({
					claims: [
						{
							id: "r001",
							type: "factual",
							topic: "isolation",
							content: "Isolation holds.",
							sources: [],
							conflicts_with: [],
						},
					],
				}),
			),
		},
	];
	const source = path.join(dir, "input.json");
	fs.writeFileSync(source, exportSession(s));
	const dest = path.join(dir, "prepared");
	const prepared = await child([
		"bin/grainulator.js",
		"research",
		"--session",
		source,
		"--dir",
		dest,
		"--prepare-only",
	]);
	assert.equal(prepared.code, 0, prepared.stderr);
	const claims = JSON.parse(fs.readFileSync(path.join(dest, "claims.json")));
	assert.equal(claims.claims[0].evidence, "stated");
	const compilation = JSON.parse(
		fs.readFileSync(path.join(dest, "compilation.json")),
	);
	assert.ok(compilation.compilation_certificate);
	assert.equal(
		importSession(JSON.parse(fs.readFileSync(path.join(dest, "session.json"))))
			.status,
		"blocked",
	);
});

test("a valid long Unicode session can be exported and reopened by the real CLI", async (t) => {
	const dir = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-large-session-"),
	);
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const s = createSession({
		question: "Large transcript",
		config: { ...DEFAULTS, blindSpots: true },
	});
	s.basis = sessionBasis(s);
	s.steps = ["research", "challenge", "blindspots", "synthesis"].map(
		(pass) => ({ pass, ...result("界".repeat(70000)) }),
	);
	const serialized = exportSession(s);
	assert.ok(
		Buffer.byteLength(serialized) > 768 * 1024,
		"fixture must exceed the old import ceiling",
	);
	const file = path.join(dir, "session.json");
	fs.writeFileSync(file, serialized);
	const dest = path.join(dir, "reopened");
	const prepared = await child([
		"bin/grainulator.js",
		"research",
		"--session",
		file,
		"--dir",
		dest,
		"--prepare-only",
	]);
	assert.equal(prepared.code, 0, prepared.stderr);
	const restored = importSession(
		JSON.parse(fs.readFileSync(path.join(dest, "session.json"))),
	);
	assert.equal(restored.steps[3].text, s.steps[3].text);
	assert.equal(restored.status, "complete");
});
