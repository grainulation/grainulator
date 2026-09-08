import {
	cleanConfig,
	cleanSources,
	PROVIDERS,
} from "../site/research/session.js";

export function providerRequest(raw, system, user) {
	const config = cleanConfig(raw);
	const endpoint = config.baseUrl || PROVIDERS[config.provider].baseUrl;
	if (config.provider === "openai") {
		return {
			url: `${endpoint}/responses`,
			body: {
				model: config.model,
				instructions: system,
				input: user,
				stream: true,
				store: false,
				max_output_tokens: config.maxOutputTokens,
				...(config.reasoning !== "default"
					? { reasoning: { effort: config.reasoning } }
					: {}),
				...(config.webSearch ? { tools: [{ type: "web_search" }] } : {}),
			},
		};
	}
	return {
		url: `${endpoint}/chat/completions`,
		body: {
			model: config.model,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
			max_tokens: config.maxOutputTokens,
			stream: true,
			...(config.provider === "openrouter" && config.reasoning !== "default"
				? { reasoning: { effort: config.reasoning } }
				: {}),
		},
	};
}
export function environmentKey(config, env = process.env) {
	// Custom/imported endpoints never receive a server environment credential.
	const variable = PROVIDERS[config.provider]?.keyEnv;
	return variable ? env[variable] || "" : "";
}
export async function* lines(body, maxBytes = 2 * 1024 * 1024) {
	if (!body) throw Error("The provider returned no response body");
	const reader = body.getReader(),
		decoder = new TextDecoder();
	let buffer = "",
		bytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				buffer += decoder.decode();
				break;
			}
			bytes += value.byteLength;
			if (bytes > maxBytes)
				throw Error("Provider response exceeded the size limit");
			buffer += decoder.decode(value, { stream: true });
			let index = buffer.indexOf("\n");
			while (index >= 0) {
				yield buffer.slice(0, index).replace(/\r$/, "");
				buffer = buffer.slice(index + 1);
				index = buffer.indexOf("\n");
			}
		}
		if (buffer) yield buffer.replace(/\r$/, "");
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
async function* events(body) {
	let data = [];
	for await (const line of lines(body)) {
		if (!line) {
			if (data.length) yield data.join("\n");
			data = [];
		} else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
	}
	if (data.length) yield data.join("\n");
}
function unpack(response, provider) {
	if (provider === "openai") {
		if (response.status !== "completed")
			throw Error(
				"The provider stopped before completing the pass. Increase the output budget or retry.",
			);
		const content = (response.output || []).flatMap(
			(item) => item.content || [],
		);
		return {
			text: content
				.filter((c) => c.type === "output_text")
				.map((c) => c.text)
				.join("\n"),
			sources: cleanSources(content.flatMap((c) => c.annotations || [])),
			model: response.model || "",
			usage: {
				inputTokens: response.usage?.input_tokens,
				outputTokens: response.usage?.output_tokens,
			},
		};
	}
	const choice = response.choices?.[0];
	if (choice?.finish_reason !== "stop")
		throw Error(
			"The provider stopped before completing the pass. Increase the output budget or retry.",
		);
	return {
		text: choice.message?.content || "",
		sources: cleanSources(
			(choice.message?.annotations || []).map((a) => a.url_citation || a),
		),
		model: response.model || "",
		usage: {
			inputTokens: response.usage?.prompt_tokens,
			outputTokens: response.usage?.completion_tokens,
		},
	};
}
async function readCompletion(response, provider, onDelta) {
	if (!response.headers.get("content-type")?.includes("text/event-stream")) {
		let raw = "";
		for await (const line of lines(response.body)) raw += line + "\n";
		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw Error("The provider returned an invalid response");
		}
		const result = unpack(parsed, provider);
		if (result.text) onDelta(result.text);
		return result;
	}
	let output = "",
		complete = false,
		model = "",
		sources = [],
		usage = {};
	for await (const raw of events(response.body)) {
		if (raw === "[DONE]") break;
		let event;
		try {
			event = JSON.parse(raw);
		} catch {
			throw Error("The provider returned an invalid stream");
		}
		if (
			event.error ||
			["error", "response.failed", "response.incomplete"].includes(event.type)
		)
			throw Error(
				"The provider could not finish this pass. Check your model access and output budget.",
			);
		if (provider === "openai") {
			if (event.type === "response.output_text.delta") {
				output += event.delta;
				onDelta(event.delta);
			}
			if (event.type === "response.completed") {
				const result = unpack(event.response, provider);
				return result;
			}
		} else {
			model = event.model || model;
			const choice = event.choices?.[0];
			const delta = choice?.delta?.content;
			if (typeof delta === "string") {
				output += delta;
				onDelta(delta);
			}
			sources.push(
				...(choice?.delta?.annotations || []).map((a) => a.url_citation || a),
			);
			if (event.usage)
				usage = {
					inputTokens: event.usage.prompt_tokens,
					outputTokens: event.usage.completion_tokens,
				};
			if (choice?.finish_reason) {
				if (choice.finish_reason !== "stop")
					throw Error(
						"The provider reached its output limit or could not complete. Increase the output budget or retry.",
					);
				complete = true;
			}
		}
	}
	if (!complete)
		throw Error(
			"The connection ended before the pass completed. Retry to continue from the last completed pass.",
		);
	return { text: output, model, sources: cleanSources(sources), usage };
}
function wait(ms, signal) {
	return new Promise((resolve, reject) => {
		signal?.throwIfAborted();
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", abort);
			resolve();
		}, ms);
		signal?.addEventListener("abort", abort, { once: true });
	});
}
export async function completeResearch({
	config: raw,
	system,
	user,
	apiKey = "",
	signal,
	onDelta = () => {},
	fetchImpl = fetch,
}) {
	const config = cleanConfig(raw);
	if (config.provider !== "custom" && !apiKey)
		throw Error(
			`Add a ${PROVIDERS[config.provider].label} API key to run research`,
		);
	if (
		typeof apiKey !== "string" ||
		apiKey.length > 4096 ||
		/[\r\n]/.test(apiKey)
	)
		throw Error("Invalid API key");
	if (
		typeof system !== "string" ||
		typeof user !== "string" ||
		system.length > 10000 ||
		user.length > 450000
	)
		throw Error("Research input exceeds the supported size");
	const request = providerRequest(config, system, user);
	// The deadline covers the entire pass, including retries and stream consumption.
	const deadline = AbortSignal.timeout(config.timeoutMs);
	const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
	try {
		for (let attempt = 0; attempt <= config.retries; attempt++) {
			const response = await fetchImpl(request.url, {
				method: "POST",
				redirect: "error",
				headers: {
					"Content-Type": "application/json",
					...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
				},
				body: JSON.stringify(request.body),
				signal: combined,
			});
			if (!response.ok) {
				await response.body?.cancel();
				if (
					[429, 502, 503].includes(response.status) &&
					attempt < config.retries
				) {
					await wait(1000 * (attempt + 1), combined);
					continue;
				}
				throw Error(
					response.status === 401 || response.status === 403
						? "The provider rejected this API key or model access."
						: `Provider request failed (HTTP ${response.status}). Check the model, settings, and account limits.`,
				);
			}
			const result = await readCompletion(response, config.provider, onDelta);
			if (!result.text?.trim())
				throw Error(
					"The provider returned no usable text. Increase the output budget or choose another model.",
				);
			if (result.text.length > 120000)
				throw Error("The pass exceeded the supported output size");
			return result;
		}
	} catch (error) {
		if (signal?.aborted) throw signal.reason;
		if (deadline.aborted)
			throw Error(
				"This pass timed out. Increase the timeout or choose a faster model.",
			);
		// Fetch errors can contain endpoint details; never serialize request headers or credentials.
		if (error instanceof TypeError)
			throw Error(
				"Could not connect to the provider. Check the endpoint and network.",
			);
		throw error;
	}
}
