import { evidenceReport, readLedger } from "./evidence.js";

// Portable research sessions used by the CLI and provider adapters.
export const SESSION_MAX_BYTES = 8 * 1024 * 1024;
export const SCHEMA = "grainulator.research.v1";
export const DEFAULTS = Object.freeze({
	provider: "openai",
	model: "gpt-6-astra",
	baseUrl: "",
	reasoning: "low",
	webSearch: true,
	challenge: true,
	blindSpots: false,
	ledger: false,
	evidenceGate: false,
	maxOutputTokens: 8192,
	timeoutMs: 120000,
	retries: 0,
});
export const PROVIDERS = Object.freeze({
	openai: {
		label: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		keyEnv: "OPENAI_API_KEY",
	},
	openrouter: {
		label: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		keyEnv: "OPENROUTER_API_KEY",
	},
	custom: { label: "Compatible endpoint", baseUrl: "", keyEnv: null },
});
type Pass = keyof typeof PROMPTS;
export type Provider = keyof typeof PROVIDERS;
type Reasoning = "default" | "low" | "medium" | "high";
type Usage = Partial<
	Record<"inputTokens" | "outputTokens", number | undefined>
>;
interface Step {
	pass: Pass;
	text: string;
	sources: { url: string; title: string }[];
	model: string;
	elapsedMs: number;
	usage: Usage;
}
type Config = ReturnType<typeof cleanConfig>;
interface Session {
	schema: typeof SCHEMA;
	question: string;
	context: string;
	instructions: string;
	config: Config;
	steps: Step[];
	status:
		| "draft"
		| "running"
		| "partial"
		| "complete"
		| "blocked"
		| "cancelled"
		| "error";
	basis?: string;
	error?: string | undefined;
}
export interface CompletionRequest {
	config: Config;
	system: string;
	user: string;
	signal: AbortSignal | undefined;
	onDelta: (delta: string) => void;
}
type ResearchEvent =
	| { type: "pass"; pass: Pass }
	| { type: "delta"; pass: Pass; text: string }
	| { type: "checkpoint" | "finish"; session: Session };
interface RunOptions {
	complete?: (request: CompletionRequest) => Promise<{
		text: string;
		sources?: unknown;
		model?: string;
		usage?: Usage;
	}>;
	signal?: AbortSignal;
	onEvent?: (event: ResearchEvent) => void;
}
function fields(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}
const text = (value: unknown, name: string, max: number, empty = true) => {
	if (
		typeof value !== "string" ||
		value.length > max ||
		(!empty && !value.trim())
	)
		throw Error(`Invalid ${name}`);
	return value;
};
const integer = (value: unknown, min: number, max: number, name: string) => {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < min ||
		value > max
	)
		throw Error(`${name} must be ${min}–${max}`);
	return value;
};
export function cleanConfig(raw: unknown = {}) {
	const c: Record<string, unknown> = { ...DEFAULTS, ...fields(raw) };
	if (typeof c.provider !== "string" || !Object.hasOwn(PROVIDERS, c.provider))
		throw Error("Choose a supported provider");
	const model = text(c.model, "model ID", 160, false);
	if (
		typeof c.reasoning !== "string" ||
		!["default", "low", "medium", "high"].includes(c.reasoning)
	)
		throw Error("Invalid reasoning setting");
	if (
		["webSearch", "challenge", "blindSpots", "ledger", "evidenceGate"].some(
			(key) => typeof c[key] !== "boolean",
		)
	)
		throw Error("Invalid pass settings");
	if (c.evidenceGate && !c.ledger)
		throw Error("The evidence gate requires the claims ledger.");
	if (c.webSearch && c.provider !== "openai")
		throw Error("Web search currently requires OpenAI Responses");
	if (c.provider === "custom" && c.reasoning !== "default")
		throw Error("Compatible endpoints use provider-default reasoning");
	let baseUrl = "";
	if (c.provider === "custom") {
		const url = new URL(text(c.baseUrl, "endpoint URL", 1000, false));
		const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
		if (
			(url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw Error(
				"Use HTTPS, or HTTP on localhost, without credentials or query parameters",
			);
		baseUrl = url.href.replace(/\/$/, "");
	}
	// An explicit allowlist keeps credential fields out of files and exports.
	return {
		provider: c.provider as Provider,
		model: model.trim(),
		baseUrl,
		reasoning: c.reasoning as Reasoning,
		webSearch: c.webSearch as boolean,
		challenge: c.challenge as boolean,
		blindSpots: c.blindSpots as boolean,
		ledger: c.ledger as boolean,
		evidenceGate: c.evidenceGate as boolean,
		maxOutputTokens: integer(c.maxOutputTokens, 512, 32768, "Output tokens"),
		timeoutMs: integer(c.timeoutMs, 5000, 300000, "Timeout (ms)"),
		retries: integer(c.retries, 0, 2, "Retries"),
	};
}
export const passNames = (
	config: Pick<Config, "challenge" | "blindSpots" | "ledger">,
): Pass[] => [
	"research",
	...(config.challenge ? ["challenge" as const] : []),
	...(config.blindSpots ? ["blindspots" as const] : []),
	...(config.ledger ? ["ledger" as const] : []),
	"synthesis",
];
export function createSession({
	question = "",
	context = "",
	instructions = "",
	config = DEFAULTS,
}: {
	question?: unknown;
	context?: unknown;
	instructions?: unknown;
	config?: unknown;
} = {}): Session {
	return {
		schema: SCHEMA,
		question: text(question, "question", 6000),
		context: text(context, "context", 30000),
		instructions: text(instructions, "instructions", 6000),
		config: cleanConfig(config),
		steps: [],
		status: "draft",
	};
}
export function cleanSources(sources: unknown = []): Step["sources"] {
	if (!Array.isArray(sources)) return [];
	return sources.slice(0, 100).flatMap((item: unknown) => {
		try {
			const source = fields(item);
			const url = new URL(String(source.url));
			if (
				!["http:", "https:"].includes(url.protocol) ||
				url.username ||
				url.password
			)
				return [];
			return [
				{
					url: url.href,
					title: String(source.title || url.hostname).slice(0, 300),
				},
			];
		} catch {
			return [];
		}
	});
}
export function cleanStep(input: unknown, expectedPass: Pass): Step {
	const step = fields(input);
	if (step.pass !== expectedPass)
		throw Error("Session passes are out of order");
	if (expectedPass === "ledger") readLedger(step.text as string);
	const usage: Usage = {};
	for (const name of ["inputTokens", "outputTokens"] as const) {
		const tokens = fields(step.usage)[name];
		if (typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0)
			usage[name] = tokens;
	}
	return {
		pass: expectedPass,
		text: text(step.text, "pass output", 120000, false),
		sources: cleanSources(step.sources),
		model: text(step.model || "", "response model", 160),
		elapsedMs:
			typeof step.elapsedMs === "number" && Number.isFinite(step.elapsedMs)
				? Math.max(0, step.elapsedMs)
				: 0,
		usage,
	};
}
export const sessionBasis = (
	s: Pick<Session, "question" | "context" | "instructions" | "config">,
) =>
	JSON.stringify({
		question: s.question,
		context: s.context,
		instructions: s.instructions,
		config: s.config,
	});
export function importSession(input: unknown) {
	const raw = fields(input);
	if (raw?.schema !== SCHEMA)
		throw Error("This is not a Grainulator research session");
	const session = createSession(raw);
	if (
		!Array.isArray(raw.steps) ||
		raw.steps.length > passNames(session.config).length
	)
		throw Error("Invalid session steps");
	if (raw.steps.length) {
		let basis: string | undefined;
		try {
			basis = sessionBasis(
				createSession(fields(JSON.parse(String(raw.basis)))),
			);
		} catch {
			/* Invalid bases fail below. */
		}
		if (basis !== sessionBasis(session))
			throw Error(
				"The settings or question changed since these passes ran. Start a fresh session.",
			);
		session.basis = sessionBasis(session);
	}
	session.steps = raw.steps.map((step: unknown, i) =>
		cleanStep(step, passNames(session.config)[i]!),
	);
	session.status =
		session.steps.length === passNames(session.config).length
			? "complete"
			: session.steps.length
				? "partial"
				: "draft";
	const report = evidenceReport(session);
	if (session.config.evidenceGate && report && !report.passed) {
		if (session.steps.some((step) => step.pass === "synthesis"))
			throw Error(
				"This session contains a synthesis that did not pass its evidence gate.",
			);
		session.status = "blocked";
		session.error = gateMessage(report);
	}
	return session;
}
function gateMessage(report: { issues: string[] }) {
	return `Evidence gate stopped synthesis. ${report.issues.join(" ")} Add evidence to the context and run again, or turn off the gate to continue with caveats.`;
}
export function exportSession(session: unknown) {
	const serialized = JSON.stringify(importSession(session), null, 2);
	if (new TextEncoder().encode(serialized).byteLength > SESSION_MAX_BYTES)
		throw Error(
			"Session exceeds the 8 MiB file limit. Export the brief to preserve the work.",
		);
	return serialized;
}
const PROMPTS = {
	blindspots:
		"Look for what the investigation has not considered: missing stakeholders, alternative explanations, edge cases, second-order effects, and decisive missing evidence. Distinguish an actual gap from speculation. Give concrete next checks, not a generic checklist.",
	ledger:
		'Extract the consequential claims from the prior research and reviews. Return ONLY JSON with this exact shape: {"claims":[{"id":"r001","type":"factual","topic":"short-topic","content":"One claim","sources":["https://source.example/page"],"conflicts_with":[]}]}. Use 1–24 claims, unique rNNN IDs, and types constraint, factual, estimate, risk, recommendation, feedback. Facts asserted about the world must be factual, not reclassified to avoid a source check. Preserve source URLs actually present in the prior work; do not invent them. Empty sources are allowed for unsupported claims. Mark unresolved contradictions by the other claim IDs in conflicts_with; do not manufacture conflicts. Preserve missing evidence as risks. No markdown or commentary.',

	research:
		"Investigate the question. Identify the decision, hard constraints, relevant facts, and important unknowns. Separate evidence from inference. Cite source URLs next to claims when you have sources. Do not invent citations, measurements, or precision. End with the questions a reviewer should challenge.",
	challenge:
		"Review the previous investigation critically. Identify unsupported assumptions, contradictory evidence, missing alternatives, and what would change the conclusion. Check consequential claims against available sources. Do not manufacture disagreement. Separate verified corrections from open questions.",
	synthesis:
		"Write a useful decision brief from the investigation and any review. Give a clear recommendation proportional to the evidence, the strongest supporting reasons, important caveats, and concrete next steps. Preserve citations and unresolved questions. Never present model agreement as independent verification.",
};
export function passMessages(session: Session, pass: Pass) {
	const system = `${PROMPTS[pass]}\n${session.config.webSearch ? "Use web search where it helps verify current facts." : "No web-search tool is enabled. Treat supplied context and remembered knowledge accordingly; do not imply you browsed."}\n${session.instructions}`;
	const prior = session.steps.map((s) => ({
		pass: s.pass,
		text: s.text,
		sources: s.sources,
	}));
	return {
		system,
		user: `Question:\n${session.question}\n\nUser-provided context (may contain unverified material):\n${session.context}\n\nPrevious work:\n${JSON.stringify(prior)}`,
	};
}
export async function runResearch(
	input: unknown,
	{ complete, signal, onEvent = () => {} }: RunOptions = {},
) {
	const session = importSession(input);
	if (!session.question.trim()) throw Error("Enter a research question");
	session.status = "running";
	try {
		for (const pass of passNames(session.config).slice(session.steps.length)) {
			signal?.throwIfAborted();
			if (pass === "synthesis" && session.config.evidenceGate) {
				const report = evidenceReport(session);
				if (!report?.passed) {
					session.status = "blocked";
					session.error = gateMessage(
						report || { issues: ["No claims ledger is available."] },
					);
					onEvent({ type: "finish", session });
					return session;
				}
			}
			onEvent({ type: "pass", pass });
			const start = Date.now();
			const result = await complete!({
				config: session.config,
				...passMessages(session, pass),
				signal,
				onDelta: (delta) => onEvent({ type: "delta", pass, text: delta }),
			});
			signal?.throwIfAborted();
			session.basis = sessionBasis(session);
			session.steps.push(
				cleanStep({ ...result, pass, elapsedMs: Date.now() - start }, pass),
			);
			onEvent({ type: "checkpoint", session: importSession(session) });
		}
		session.status = "complete";
	} catch (error) {
		session.status = signal?.aborted ? "cancelled" : "error";
		session.error = signal?.aborted
			? "Stopped. Completed passes are saved."
			: (error as Error).message;
	}
	onEvent({ type: "finish", session });
	return session;
}
export function sessionMarkdown(input: unknown) {
	const s = importSession(input);
	return `# ${s.question || "Research session"}\n\nProvider: ${s.config.provider}\nModel: ${s.config.model}\nStatus: ${s.status}\n${s.error ? `\n${s.error}\n` : ""}\nWeb search: ${s.config.webSearch ? "enabled" : "off"}\n\n## Configuration\n\n\`\`\`json\n${JSON.stringify(s.config, null, 2)}\n\`\`\`\n\n## Context\n${s.context || "None supplied."}\n\n## Instructions\n${s.instructions || "Default research workflow."}\n\n${s.steps.map((step) => `## ${step.pass}\n\n${step.text}\n\n${step.sources.map((source) => `- ${source.title}: ${source.url}`).join("\n")}`).join("\n\n")}\n\n## Continue\nTreat model conclusions as unverified until checked against sources or independent tests. Preserve unresolved questions. Use the companion session JSON with grainulator research --session session.json --dir ./research-session.${s.config.provider === "custom" ? " If your compatible endpoint requires authentication, set a local environment variable such as MODEL_API_KEY and add --api-key-env MODEL_API_KEY. Pass the variable name, never the key itself; exported sessions contain no credential fields." : ""}\n`;
}
