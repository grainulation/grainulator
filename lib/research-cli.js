import fs from "node:fs";
import path from "node:path";
import { compile } from "../packages/evidence/compiler/wheat-compiler.js";
import { claimsDocument, evidenceReport } from "../site/research/evidence.js";
import {
	createSession,
	exportSession,
	importSession,
	runResearch,
	SESSION_MAX_BYTES,
	sessionMarkdown,
} from "../site/research/session.js";
import { completeResearch, environmentKey } from "./research-provider.js";
export async function researchCLI(args) {
	const option = (name) => {
		const i = args.indexOf(name);
		return i < 0 ? undefined : args[i + 1];
	};
	if (args.includes("--help") || !option("--session")) {
		console.log(
			"grainulator research --session session.json --dir ./research-session [--restart] [--prepare-only]\n\nResumes completed passes using the exported model, sources, and settings.\n--restart discards completed passes and reruns the question.\n--prepare-only writes the session and SESSION.md without calling a model.\nKeys: OPENAI_API_KEY, OPENROUTER_API_KEY, or --api-key-env VARIABLE for a custom endpoint.\nThe destination must be new; existing sessions are never overwritten.",
		);
		if (!args.includes("--help")) process.exitCode = 1;
		return;
	}
	const source = option("--session");
	if (fs.statSync(source).size > SESSION_MAX_BYTES)
		throw Error("Session file is too large");
	let session = importSession(JSON.parse(fs.readFileSync(source, "utf8")));
	if (args.includes("--restart")) session = createSession(session);
	const dir = path.resolve(option("--dir") || "./research-session");
	fs.mkdirSync(dir, { mode: 0o700 });
	const file = path.join(dir, "session.json");
	const save = (value) => {
		fs.writeFileSync(file + ".tmp", exportSession(value), { mode: 0o600 });
		fs.renameSync(file + ".tmp", file);
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
	if (args.includes("--prepare-only")) {
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
