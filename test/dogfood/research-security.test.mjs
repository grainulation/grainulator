import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import { handleResearch } from "../../lib/research-http.js";
import { completeResearch } from "../../lib/research-provider.js";
import { DEFAULTS } from "../../site/research/session.js";

async function listen(t, listener) {
	const server = http.createServer(listener);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => {
		server.closeAllConnections();
		server.close();
	});
	return server;
}
function get(server, target, headers = {}) {
	return new Promise((resolve, reject) => {
		const req = http.get(
			{ host: "127.0.0.1", port: server.address().port, path: target, headers },
			(res) => {
				let body = "";
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () => resolve({ status: res.statusCode, body }));
			},
		);
		req.on("error", reject);
	});
}
const custom = (server) => ({
	...DEFAULTS,
	provider: "custom",
	baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
	webSearch: false,
	reasoning: "default",
	retries: 0,
});

test("malformed cross-origin request targets return 400 and leave the preview handler alive", {
	timeout: 5000,
}, async (t) => {
	const server = await listen(t, async (req, res) => {
		if (!(await handleResearch(req, res, server.address().port)))
			res.end("static");
	});
	for (const target of ["//[", "http://["]) {
		const response = await get(server, target, {
			Origin: "https://untrusted.example",
		});
		assert.equal(response.status, 400);
		assert.match(response.body, /Invalid request URL/);
	}
	assert.equal((await get(server, "/api/research/capabilities")).status, 200);
});

test("research endpoints reject forged hosts and cross-origin or opaque origins", async (t) => {
	const server = await listen(t, async (req, res) => {
		await handleResearch(req, res, server.address().port);
	});
	for (const headers of [
		{ Host: `rebound.example:${server.address().port}` },
		{ Origin: "https://untrusted.example" },
		{ Origin: "null" },
		{ Origin: `http://127.0.0.1:${server.address().port + 1}` },
	])
		assert.equal(
			(await get(server, "/api/research/capabilities", headers)).status,
			403,
		);
});

test("oversized research uploads are rejected before provider access and release concurrency slots", async () => {
	for (let i = 0; i < 6; i++) {
		const req = Readable.from([Buffer.alloc(768 * 1024 + 1, "x")]);
		req.url = "/api/research/pass";
		req.method = "POST";
		req.headers = {
			host: "127.0.0.1:4517",
			origin: "http://127.0.0.1:4517",
			"content-type": "application/json",
		};
		const res = new EventEmitter();
		let status, body;
		res.writeHead = (value) => {
			status = value;
		};
		res.end = (value) => {
			body = value;
		};
		await handleResearch(req, res, 4517);
		assert.equal(status, 400);
		assert.match(body, /Invalid research request/);
	}
});

test("authenticated provider redirects are not followed and response errors do not expose credentials", async (t) => {
	let targetCalls = 0;
	const target = await listen(t, (_req, res) => {
		targetCalls++;
		res.end("unexpected");
	});
	const key = "fixture-provider-secret";
	const redirect = await listen(t, (req, res) => {
		assert.equal(req.headers.authorization, `Bearer ${key}`);
		res.writeHead(307, {
			Location: `http://127.0.0.1:${target.address().port}/collect`,
		});
		res.end(key);
	});
	await assert.rejects(
		completeResearch({
			config: custom(redirect),
			system: "s",
			user: "u",
			apiKey: key,
		}),
		(error) => {
			assert.ok(!error.message.includes(key));
			assert.match(error.message, /Could not connect/);
			return true;
		},
	);
	assert.equal(targetCalls, 0);
	await assert.rejects(
		completeResearch({
			config: DEFAULTS,
			system: "s",
			user: "u",
			apiKey: key,
			fetchImpl: async () =>
				new Response(`Authorization: Bearer ${key}`, { status: 401 }),
		}),
		(error) => {
			assert.ok(!error.message.includes(key));
			assert.match(error.message, /rejected this API key/);
			return true;
		},
	);
});

test("cancelling a streaming provider request closes its upstream connection", {
	timeout: 5000,
}, async (t) => {
	let closed;
	const disconnected = new Promise((resolve) => {
		closed = resolve;
	});
	const provider = await listen(t, (_req, res) => {
		res.on("close", closed);
		res.writeHead(200, { "Content-Type": "text/event-stream" });
		res.write(
			`data: ${JSON.stringify({ choices: [{ delta: { content: "Partial" } }] })}\n\n`,
		);
	});
	const controller = new AbortController();
	await assert.rejects(
		completeResearch({
			config: custom(provider),
			system: "s",
			user: "u",
			signal: controller.signal,
			onDelta: () => controller.abort(),
		}),
		{ name: "AbortError" },
	);
	await disconnected;
});

test("oversized provider bodies are cancelled before becoming session results", async () => {
	let cancelled = false;
	const body = new ReadableStream({
		pull(controller) {
			controller.enqueue(new Uint8Array(256 * 1024));
		},
		cancel() {
			cancelled = true;
		},
	});
	await assert.rejects(
		completeResearch({
			config: DEFAULTS,
			system: "s",
			user: "u",
			apiKey: "fixture-key",
			fetchImpl: async () => new Response(body),
		}),
		/Provider response exceeded the size limit/,
	);
	assert.equal(cancelled, true);
});
