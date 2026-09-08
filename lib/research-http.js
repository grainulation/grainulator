import { cleanConfig } from "../site/research/session.js";
import { completeResearch, environmentKey } from "./research-provider.js";

let active = 0;
let catalog = null;
export async function handleResearch(req, res, port) {
	const url = new URL(req.url, "http://localhost");
	if (!url.pathname.startsWith("/api/research/")) return false;
	const origins = ["127.0.0.1", "localhost", "[::1]"].map(
		(host) => `http://${host}:${port}`,
	);
	const origin = `http://${req.headers.host}`;
	const send = (code, value) => {
		res.writeHead(code, { "Content-Type": "application/json" });
		res.end(JSON.stringify(value));
	};
	if (
		!origins.includes(origin) ||
		(req.headers.origin && req.headers.origin !== origin)
	) {
		send(403, { error: "Use the local playground origin" });
		return true;
	}
	if (url.pathname === "/api/research/capabilities" && req.method === "GET") {
		send(200, {
			available: true,
			credentials: {
				openai: Boolean(process.env.OPENAI_API_KEY),
				openrouter: Boolean(process.env.OPENROUTER_API_KEY),
			},
		});
		return true;
	}
	if (url.pathname === "/api/research/models" && req.method === "GET") {
		try {
			if (!catalog || Date.now() - catalog.at > 300000) {
				const response = await fetch("https://openrouter.ai/api/v1/models", {
					signal: AbortSignal.timeout(10000),
					redirect: "error",
				});
				if (!response.ok) throw Error("Model catalog unavailable");
				const data = await response.json();
				catalog = {
					at: Date.now(),
					models: data.data
						.filter(
							(m) =>
								m.architecture?.output_modalities?.includes("text") &&
								!m.id.includes(":batch"),
						)
						.map((m) => ({ id: m.id, name: m.name })),
				};
			}
			send(200, { models: catalog.models });
		} catch {
			send(502, {
				error: "Model catalog unavailable. Enter a model ID directly.",
			});
		}
		return true;
	}
	if (url.pathname !== "/api/research/pass" || req.method !== "POST") {
		send(404, { error: "Unknown research route" });
		return true;
	}
	if (
		req.headers.origin !== origin ||
		!req.headers["content-type"]?.startsWith("application/json")
	) {
		send(403, {
			error: "Research requests must come from the local playground",
		});
		return true;
	}
	if (active >= 4) {
		send(429, {
			error:
				"Four research passes are already running. Try again after one finishes.",
		});
		return true;
	}
	active++;
	const controller = new AbortController();
	res.once("close", () => controller.abort());
	try {
		const chunks = [];
		let bytes = 0;
		for await (const chunk of req) {
			bytes += chunk.length;
			if (bytes > 768 * 1024) throw Error("Request exceeds the supported size");
			chunks.push(chunk);
		}
		const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		const config = cleanConfig(input.config);
		const apiKey = input.apiKey || environmentKey(config);
		res.writeHead(200, {
			"Content-Type": "application/x-ndjson",
			"X-Accel-Buffering": "no",
		});
		res.flushHeaders();
		const emit = (event) => {
			if (!res.destroyed) res.write(JSON.stringify(event) + "\n");
		};
		try {
			const result = await completeResearch({
				config,
				system: input.system,
				user: input.user,
				apiKey,
				signal: controller.signal,
				onDelta: (text) => emit({ type: "delta", text }),
			});
			emit({ type: "result", result });
		} catch (error) {
			if (!controller.signal.aborted)
				emit({ type: "error", error: error.message });
		}
		res.end();
	} catch {
		if (!res.headersSent) send(400, { error: "Invalid research request" });
		else res.end();
	} finally {
		active--;
	}
	return true;
}
