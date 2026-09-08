import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

test("service worker excludes model requests and produces a valid offline response", async () => {
	const handlers = {};
	vm.runInNewContext(
		fs.readFileSync(new URL("../../site/sw.js", import.meta.url), "utf8"),
		{
			URL,
			Response,
			self: {
				location: { origin: "https://grainulator.app" },
				addEventListener: (name, fn) => (handlers[name] = fn),
			},
			caches: { open: async () => ({ match: async () => undefined }) },
			fetch: async () => {
				throw Error("offline");
			},
		},
	);
	for (const request of [
		{ method: "POST", url: "https://grainulator.app/" },
		{ method: "GET", url: "https://provider.example/prompt" },
		{ method: "GET", url: "https://grainulator.app/?question=private" },
	]) {
		handlers.fetch({
			request,
			respondWith: () => assert.fail("dynamic request must bypass cache"),
		});
	}
	let response;
	handlers.fetch({
		request: { method: "GET", url: "https://grainulator.app/index.html" },
		respondWith: (promise) => (response = promise),
	});
	assert.equal((await response).status, 503);
});
