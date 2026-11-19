import fs from "node:fs";
import path from "node:path";
import { compile } from "../packages/evidence/compiler/evidence-compiler.js";
import { atomicWrite } from "../packages/shared/lib/atomic.js";
import { readRegularFile } from "../packages/shared/lib/fs-safe.cjs";
import { claimsDocument, evidenceReport } from "./research/evidence.js";
import {
	createSession,
	exportSession,
	importSession,
	runResearch,
	SESSION_MAX_BYTES,
	sessionMarkdown,
} from "./research/session.js";
import { completeResearch, environmentKey } from "./research-provider.js";
export async function researchCLI(args) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`grainulator research --question TEXT [--context TEXT] --dir ./research-session [--prepare-only]
grainulator research --session session.json --dir ./continued-session [--restart] [--prepare-only]

New sessions: --provider openai|openrouter|custom, --model ID, --base-url URL,
--no-web-search, --no-challenge. Custom endpoints require --base-url; non-OpenAI
providers require an explicit --model. Imported sessions keep their exact settings.
--restart discards imported completed passes and reruns the question.
--prepare-only writes session.json and SESSION.md without calling a model.
Keys: OPENAI_API_KEY, OPENROUTER_API_KEY, or --api-key-env VARIABLE.
The destination must be new; existing sessions are never overwritten.`);
		return;
	}
	const valued = new Set([
		"--session",
		"--question",
		"--context",
		"--dir",
		"--api-key-env",
		"--provider",
		"--model",
		"--base-url",
	]);
	const flags = new Set([
		"--restart",
		"--prepare-only",
		"--no-web-search",
		"--no-challenge",
	]);
	const options = new Map();
	for (let i = 0; i < args.length; i++) {
		const name = args[i];
		if ((!valued.has(name) && !flags.has(name)) || options.has(name))
			throw Error(`Unknown or duplicate research option: ${name}`);
		if (flags.has(name)) options.set(name, true);
		else {
			const value = args[++i];
			if (
				value === undefined ||
				(value === "" && name !== "--context") ||
				value.startsWith("--")
			)
				throw Error(`Missing value for ${name}`);
			options.set(name, value);
		}
	}
	const option = (name) => options.get(name);
	const source = option("--session");
	const fresh = options.has("--question");
	if (options.has("--session") === fresh)
		throw Error("Choose exactly one of --session or --question");
	const creation = [
		"--context",
		"--provider",
		"--model",
		"--base-url",
		"--no-web-search",
		"--no-challenge",
	];
	if (options.has("--session") && creation.some((name) => options.has(name)))
		throw Error(
			"Session settings cannot be changed with creation options; prepare a new --question session",
		);
	if (fresh && option("--restart")) throw Error("--restart requires --session");
	if (
		option("--api-key-env") &&
		!/^[A-Za-z_][A-Za-z0-9_]*$/.test(option("--api-key-env"))
	)
		throw Error(
			"--api-key-env requires an environment variable name, never a credential value",
		);
	let session;
	if (options.has("--session")) {
		session = importSession(
			JSON.parse(readRegularFile(source, "utf8", SESSION_MAX_BYTES)),
		);
		if (option("--restart")) session = createSession(session);
	} else {
		if (!option("--question").trim())
			throw Error("The research question must not be empty");
		const provider = option("--provider") || "openai";
		if (provider !== "openai" && !option("--model"))
			throw Error("This provider requires an explicit --model");
		if (option("--base-url") && provider !== "custom")
			throw Error("--base-url requires --provider custom");
		session = createSession({
			question: option("--question"),
			context: option("--context") || "",
			config: {
				provider,
				...(option("--model") ? { model: option("--model") } : {}),
				baseUrl: option("--base-url") || "",
				reasoning: provider === "custom" ? "default" : "low",
				webSearch: provider === "openai" && !option("--no-web-search"),
				challenge: !option("--no-challenge"),
			},
		});
	}
	const dir = path.resolve(option("--dir") || "./research-session");
	fs.mkdirSync(dir, { mode: 0o700 });
	const file = path.join(dir, "session.json");
	const save = (value) => {
		atomicWrite(file, exportSession(value));
		fs.writeFileSync(path.join(dir, "SESSION.md"), sessionMarkdown(value), {
			mode: 0o600,
		});
		if (evidenceReport(value)) {
			const claimsPath = path.join(dir, "claims.json");
			fs.writeFileSync(
				claimsPath,
				JSON.stringify(claimsDocument(value), null, 2),
				{ mode: 0o600 },
			);
			compile(claimsPath, path.join(dir, "compilation.json"), dir, {
				skipSprintDetection: true,
			});
		}
	};
	save(session);
	if (option("--prepare-only")) {
		console.log(
			`Session prepared: ${dir}\nOpen SESSION.md in your agent, or resume session.json with grainulator research.`,
		);
		return;
	}
	const controller = new AbortController();
	const abort = () => controller.abort();
	process.once("SIGINT", abort);
	process.once("SIGTERM", abort);
	const apiKey = option("--api-key-env")
		? process.env[option("--api-key-env")] || ""
		: environmentKey(session.config);
	try {
		const result = await runResearch(session, {
			signal: controller.signal,
			complete: (request) => completeResearch({ ...request, apiKey }),
			onEvent: (event) => {
				if (event.type === "pass")
					console.error(`Starting ${event.pass} (${session.config.model})`);
				if (event.type === "checkpoint") save(event.session);
			},
		});
		save(result);
		console.log(`${result.status}: ${file}`);
		if (result.error) console.error(result.error);
		process.exitCode = result.status === "complete" ? 0 : 2;
	} finally {
		process.removeListener("SIGINT", abort);
		process.removeListener("SIGTERM", abort);
	}
}
