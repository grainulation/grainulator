import {
	claimsDocument,
	FEATURES,
	featureConfig,
	featureUI,
	mountFeatures,
	renderGate,
	renderLedger,
} from "./features.js";
import { renderText } from "./render-text.js";
import {
	createSession,
	DEFAULTS,
	exportSession,
	importSession,
	passNames,
	runResearch,
	SESSION_MAX_BYTES,
	sessionBasis,
	sessionMarkdown,
} from "./session.js";

const $ = (id) => document.getElementById(id);
let session = null,
	controller = null,
	serviceReady = false;
const staticMode =
	document.querySelector('meta[name="research-mode"]')?.content === "static";
let activeProvider = "openai";
const keys = new Map();
const serverKeys = {};
mountFeatures();
const starter = $("result-content").innerHTML;
function sizeTextareas() {
	document.querySelectorAll(".settings textarea").forEach((field) => {
		if (!field.getClientRects().length) return;
		field.style.height = "auto";
		field.style.height = `${field.scrollHeight + 2}px`;
	});
}
let resizeFrame = null;
function queueTextareaSize() {
	if (resizeFrame !== null) return;
	resizeFrame = requestAnimationFrame(() => {
		resizeFrame = null;
		sizeTextareas();
	});
}
$("research-form").addEventListener("input", queueTextareaSize);
document.querySelectorAll(".settings details").forEach((details) => {
	details.addEventListener("toggle", queueTextareaSize);
});
window.addEventListener("resize", queueTextareaSize, { passive: true });
queueTextareaSize();

const configFromForm = () => ({
	provider: $("provider").value,
	model: $("model").value,
	baseUrl: $("base-url").value,
	reasoning: $("reasoning").value,
	webSearch: $("web-search").checked,
	...featureConfig(),
	maxOutputTokens: Number($("max-tokens").value),
	timeoutMs: Number($("timeout").value) * 1000,
	retries: Number($("retries").value),
});
function draft() {
	return createSession({
		question: $("question").value,
		context: $("context").value,
		instructions: $("instructions").value,
		config: configFromForm(),
	});
}
function error(message) {
	$("run-error").textContent = message || "";
	$("run-error").hidden = !message;
}
function readyButtons() {
	const finished = session?.steps.length === passNames(configFromForm()).length;
	$("run").disabled =
		Boolean(controller) ||
		!serviceReady ||
		finished ||
		session?.status === "blocked";
	$("run").textContent =
		session?.status === "blocked"
			? "Evidence needed"
			: session?.steps.length && !finished
				? "Continue research →"
				: finished
					? "Research complete"
					: "Start research →";
	$("stop").hidden = !controller;
	$("restart").hidden = Boolean(controller);
	$("rerun").hidden = Boolean(controller) || !session?.steps.length;
	$("setup-fields").disabled = Boolean(controller);
	$("import-session").disabled = Boolean(controller);
}
function renderResults() {
	const target = $("result-content");
	target.replaceChildren();
	for (const step of session?.steps || []) {
		const article = document.createElement("article");
		article.className = "pass-result";
		const title = document.createElement("h3");
		title.textContent = step.pass;
		const meta = document.createElement("p");
		meta.className = "pass-meta";
		const tokens = step.usage?.outputTokens;
		meta.textContent = `${step.model || session.config.model} · ${(step.elapsedMs / 1000).toFixed(1)}s${tokens !== undefined ? ` · ${tokens} output tokens` : ""}`;
		const content = document.createElement("div");
		content.className = "pass-text";
		if (step.pass === "ledger") renderLedger(content, session);
		else renderText(content, step.text);
		article.append(title, meta, content);
		if (step.sources.length) {
			const list = document.createElement("ul");
			list.className = "source-list";
			list.setAttribute("aria-label", "Provider-returned sources");
			for (const source of step.sources) {
				const li = document.createElement("li"),
					link = document.createElement("a");
				link.href = source.url;
				link.textContent = source.title;
				li.append(link);
				list.append(li);
			}
			article.append(list);
		}
		target.append(article);
	}
	document.querySelectorAll("[data-pass]").forEach((item) => {
		item.hidden = !passNames(configFromForm()).includes(item.dataset.pass);
		item.dataset.status = session?.steps.some(
			(s) => s.pass === item.dataset.pass,
		)
			? "complete"
			: "";
	});
	renderGate(session);
	featureUI(configFromForm());
}
function invalidate() {
	if (controller) return;
	session = null;
	document.querySelectorAll("[data-pass]").forEach((item) => {
		item.dataset.status = "";
	});
	error("");
	$("run-status").textContent = "Ready";
	$("result-content").innerHTML = starter;
	bindSample();
	readyButtons();
	featureUI(configFromForm());
	renderGate(null);
}
$("setup-fields").addEventListener("input", (event) => {
	if (event.target.id === "ledger" && !$("ledger").checked)
		$("evidence-gate").checked = false;
	if (event.target.id !== "api-key") invalidate();
});
function providerUI(resetModel) {
	const provider = $("provider").value;
	$("handoff-auth").hidden = provider !== "custom";
	$("endpoint-field").hidden = provider !== "custom";
	$("web-search").disabled = provider !== "openai";
	$("reasoning").disabled = provider === "custom";
	if (resetModel) {
		$("web-search").checked = provider === "openai";
		$("model").value =
			provider === "openai"
				? "gpt-6-astra"
				: provider === "openrouter"
					? "anthropic/claude-fable-5.1"
					: "";
		$("reasoning").value = provider === "custom" ? "default" : "low";
	}
	$("api-key").disabled = !serviceReady;
	$("key-hint").textContent = !serviceReady
		? "Configure your key when you open this session locally. This page does not accept credentials."
		: provider === "custom"
			? "Optional for a local model. A key entered here is sent only to this endpoint."
			: serverKeys[provider]
				? "A key is configured on the local server. Leave this blank to use it."
				: `Uses ${provider === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY"} from the local server, or the key you enter above.`;
	$("model-hint").textContent =
		provider === "openai"
			? "Astra is the starting model. You can choose another model ID supported by your API account."
			: provider === "openrouter"
				? serviceReady
					? "Choose Fable, Astra, or another model by ID. Suggestions load from the current catalog."
					: "Choose Fable, Astra, or another model by ID. Live model discovery is available in the local playground."
				: "Use the exact model name served by your endpoint.";
	$("search-hint").textContent = $("web-search").checked
		? "Search is available to the model. Provider-returned citations appear with each pass."
		: "Web search is off. Research uses supplied context and model knowledge.";
	const ids =
		provider === "openai"
			? ["gpt-6-astra", "gpt-5.6-sol"]
			: provider === "openrouter"
				? [
						"anthropic/claude-fable-5.1",
						"openai/gpt-6-astra",
						"openai/gpt-5.6-sol",
					]
				: [];
	$("model-list").replaceChildren(
		...ids.map((id) => {
			const option = document.createElement("option");
			option.value = id;
			return option;
		}),
	);
	if (provider === "openrouter" && serviceReady) loadModels();
}
async function loadModels() {
	try {
		const response = await fetch("/api/research/models");
		if (!response.ok) return;
		const data = await response.json();
		if ($("provider").value !== "openrouter") return;
		$("model-list").replaceChildren(
			...data.models.map((model) => {
				const option = document.createElement("option");
				option.value = model.id;
				option.label = model.name;
				return option;
			}),
		);
	} catch {
		/* Manual model IDs remain usable when discovery is offline. */
	}
}
$("provider").addEventListener("change", () => {
	keys.set(activeProvider, $("api-key").value);
	activeProvider = $("provider").value;
	$("api-key").value = keys.get(activeProvider) || "";
	providerUI(true);
	invalidate();
});
$("web-search").addEventListener("change", () => providerUI(false));
async function complete(request) {
	const response = await fetch("/api/research/pass", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			config: request.config,
			system: request.system,
			user: request.user,
			apiKey: $("api-key").value,
		}),
		signal: request.signal,
	});
	if (!response.ok)
		throw Error(
			`The local research connection failed (HTTP ${response.status}).`,
		);
	const reader = response.body.getReader(),
		decoder = new TextDecoder();
	let buffer = "",
		result = null,
		size = 0;
	function consume(line) {
		if (!line.trim()) return;
		const event = JSON.parse(line);
		if (event.type === "error") throw Error(event.error);
		if (event.type === "delta") request.onDelta(event.text);
		if (event.type === "result") result = event.result;
	}
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				buffer += decoder.decode();
				break;
			}
			size += value.byteLength;
			if (size > 2 * 1024 * 1024)
				throw Error("Research response exceeded the size limit");
			buffer += decoder.decode(value, { stream: true });
			while (buffer.includes("\n")) {
				const index = buffer.indexOf("\n");
				consume(buffer.slice(0, index));
				buffer = buffer.slice(index + 1);
			}
		}
		if (buffer) consume(buffer);
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	if (!result)
		throw Error(
			"The connection ended before this pass completed. Continue to retry the unfinished pass.",
		);
	return result;
}
$("research-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	if (controller) return;
	try {
		session = session || draft();
	} catch (e) {
		error(e.message);
		return;
	}
	error("");
	controller = new AbortController();
	readyButtons();
	renderResults();
	let live = null,
		pending = "",
		paint = null,
		progressTimer = null;
	session = await runResearch(session, {
		complete,
		signal: controller.signal,
		onEvent: (event) => {
			if (event.type === "pass") {
				$("run-status").textContent = event.pass;
				document.querySelector(`[data-pass="${event.pass}"]`).dataset.status =
					"active";
				const article = document.createElement("article");
				article.className = "pass-result";
				const title = document.createElement("h3");
				title.textContent = `${event.pass} · running`;
				live = document.createElement("div");
				live.className = "pass-text";
				pending = "";
				const progress = document.createElement("p");
				progress.className = "pass-meta";
				const began = Date.now();
				const updateProgress = () => {
					progress.textContent = `${pending ? "Receiving text" : "Waiting for model response"} · ${Math.floor((Date.now() - began) / 1000)}s elapsed · ${session.config.timeoutMs / 1000}s limit`;
				};
				updateProgress();
				clearInterval(progressTimer);
				progressTimer = setInterval(updateProgress, 1000);
				article.append(title, progress, live);
				$("result-content").append(article);
			}
			if (event.type === "delta") {
				pending += event.text;
				if (!paint)
					paint = requestAnimationFrame(() => {
						live.textContent = pending;
						paint = null;
					});
			}
			if (event.type === "checkpoint") {
				clearInterval(progressTimer);
				if (paint) cancelAnimationFrame(paint);
				paint = null;
				session = event.session;
				renderResults();
			}
		},
	});
	clearInterval(progressTimer);
	if (paint) cancelAnimationFrame(paint);
	if (live?.isConnected) {
		live.textContent = pending;
		live.closest("article").querySelector("h3").textContent =
			"Incomplete output · not included in the session";
		if (!pending) live.closest("article").remove();
	}
	document.querySelectorAll('[data-status="active"]').forEach((item) => {
		item.dataset.status = "stopped";
	});
	controller = null;
	$("run-status").textContent = session.status;
	error(session.error);
	readyButtons();
});
$("stop").addEventListener("click", () => controller?.abort());
$("restart").addEventListener("click", () => {
	$("research-form").reset();
	$("api-key").value = "";
	$("base-url").value = "";
	keys.clear();
	activeProvider = "openai";
	$("provider").value = "openai";
	providerUI(true);
	invalidate();
	$("file-status").textContent =
		"Started fresh. Inputs and keys cleared; settings reset.";
	queueTextareaSize();
	$("question").focus();
});
$("rerun").addEventListener("click", () => {
	invalidate();
	$("research-form").requestSubmit();
});
function populate(input) {
	session = importSession(input);
	for (const name of ["question", "context", "instructions"]) {
		$(name).value = session[name];
		$(name).scrollTop = 0;
	}
	const c = session.config;
	$("provider").value = c.provider;
	activeProvider = c.provider;
	$("api-key").value = "";
	keys.clear();
	$("model").value = c.model;
	$("base-url").value = c.baseUrl;
	$("reasoning").value = c.reasoning;
	$("web-search").checked = c.webSearch;
	for (const f of FEATURES) $(f.id).checked = c[f.key];
	$("max-tokens").value = c.maxOutputTokens;
	$("timeout").value = c.timeoutMs / 1000;
	$("retries").value = c.retries;
	providerUI(false);
	queueTextareaSize();
	renderResults();
	error("");
	$("run-status").textContent = session.status;
	readyButtons();
}
$("import-session").addEventListener("change", async (event) => {
	const file = event.target.files[0];
	if (!file) return;
	try {
		if (file.size > SESSION_MAX_BYTES) throw Error("Session file is too large");
		populate(JSON.parse(await file.text()));
		$("file-status").textContent =
			"Session opened. Add your provider key to continue.";
	} catch (e) {
		error(e.message);
	} finally {
		event.target.value = "";
	}
});
function download(name, content, type) {
	const url = URL.createObjectURL(new Blob([content], { type })),
		a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export-session").addEventListener("click", () => {
	try {
		download(
			"session.json",
			exportSession(session || draft()),
			"application/json",
		);
		$("file-status").textContent =
			"Session exported. The API key field is excluded.";
	} catch (e) {
		error(e.message);
	}
});
$("export-claims").addEventListener("click", () => {
	try {
		download(
			"claims.json",
			JSON.stringify(claimsDocument(session), null, 2),
			"application/json",
		);
		$("file-status").textContent =
			"Claims exported for the evidence compiler. All claims remain stated until independently verified.";
	} catch (e) {
		error(e.message);
	}
});
$("export-brief").addEventListener("click", () => {
	try {
		download(
			"SESSION.md",
			sessionMarkdown(session || draft()),
			"text/markdown",
		);
	} catch (e) {
		error(e.message);
	}
});
$("copy-handoff").addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(sessionMarkdown(session || draft()));
		$("file-status").textContent =
			"Copied. Paste into your agent to continue with the same context.";
	} catch {
		$("file-status").textContent =
			"Clipboard unavailable. Export the brief instead.";
	}
});
function bindSample() {
	$("sample")?.addEventListener("click", () => {
		const example = createSession({
			question: "Example session: should we migrate the shared cache?",
			context:
				"Illustrative fixture. These findings were written for the example, not generated by a live model.",
			config: {
				...DEFAULTS,
				webSearch: false,
				ledger: true,
				evidenceGate: true,
			},
		});
		example.basis = sessionBasis(example);
		example.steps = [
			{
				pass: "research",
				text: "The migration depends on tenant isolation, expiry behavior, and rollback support. We need independent regression results for each before deciding.",
			},
			{
				pass: "challenge",
				text: "A successful migration test alone does not prove isolation. Exercise identical cache keys for two tenants and the exact TTL boundary.",
			},
			{
				pass: "ledger",
				text: JSON.stringify({
					claims: [
						{
							id: "r001",
							type: "constraint",
							topic: "isolation",
							content: "Tenant data must remain isolated after migration.",
							sources: [],
							conflicts_with: [],
						},
						{
							id: "r002",
							type: "factual",
							topic: "isolation",
							content:
								"The proposed cache preserves tenant isolation. This assertion has no supporting test or source in the supplied material.",
							sources: [],
							conflicts_with: [],
						},
						{
							id: "r003",
							type: "risk",
							topic: "expiry",
							content:
								"TTL boundary behavior has not been independently tested.",
							sources: [],
							conflicts_with: [],
						},
					],
				}),
			},
		];
		populate(example);
		$("run-status").textContent = "Example · no model called";
	});
}
bindSample();
try {
	if (location.hash.startsWith("#q="))
		$("question").value = decodeURIComponent(location.hash.slice(3));
} catch {
	/* Ignore malformed shared URLs. */
}
try {
	if (staticMode) throw Error("Static configuration mode");
	const response = await fetch("/api/research/capabilities", {
		signal: AbortSignal.timeout(3000),
	});
	if (!response.ok) throw Error("No local connection");
	const capabilities = await response.json();
	serviceReady = capabilities.available === true;
	if (!serviceReady) throw Error("Local connection unavailable");
	Object.assign(serverKeys, capabilities.credentials);
	$("service-status").textContent =
		"Connected to your local research server. Choose a model and use your own provider account.";
} catch {
	$("service-status").textContent =
		"Configure here. Run on your machine. Export a session to use your chosen model locally, or open the example to explore the workflow.";
	$("local-setup").hidden = false;
}
providerUI(false);
featureUI(configFromForm());
readyButtons();
if (new URLSearchParams(location.search).has("offline")) $("sample")?.click();
