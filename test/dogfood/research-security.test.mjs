import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { DEFAULTS } from "../../lib/research/session.js";
import { completeResearch } from "../../lib/research-provider.js";

async function listen(t, listener) {
	const server = http.createServer(listener);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => {
		server.closeAllConnections();
		server.close();
	});
	return server;
}
const custom = (server) => ({
	...DEFAULTS,
	provider: "custom",
	baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
	webSearch: false,
	reasoning: "default",
	retries: 0,
});

test("oversized research input is rejected before provider access", async () => {
	let calls = 0;
	await assert.rejects(
		completeResearch({
			config: DEFAULTS,
			system: "s",
			user: "x".repeat(450001),
			apiKey: "fixture-key",
			fetchImpl: async () => {
				calls++;
				throw Error("unexpected provider access");
			},
		}),
		/input exceeds/,
	);
	assert.equal(calls, 0);
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
