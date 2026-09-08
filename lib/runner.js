import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const hash = (value) => createHash("sha256").update(value).digest("hex");

// Capture known credentials once. Keep operational adapter/verifier traffic
// intact; redact only the result surfaces that can be retained or displayed.
function resultRedactor(env) {
	const secrets = [
		...new Set(
			Object.entries(env)
				.filter(
					([name, value]) =>
						/(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|AUTHORIZATION)(?:_|$)/i.test(
							name,
						) &&
						typeof value === "string" &&
						value.length >= 8,
				)
				.map(([, value]) => value),
		),
	].sort((a, b) => b.length - a.length);
	const redact = (value) => {
		if (typeof value === "string") {
			for (const secret of secrets)
				value = value.replaceAll(secret, "[REDACTED]");
			return value;
		}
		if (Array.isArray(value)) return value.map(redact);
		if (value && typeof value === "object")
			return Object.fromEntries(
				Object.entries(value).map(([key, item]) => [redact(key), redact(item)]),
			);
		return value;
	};
	return redact;
}

// Adapter v1: one JSON request on stdin, one JSON response on stdout. Logs belong
// on stderr. Execute argv directly so model output never becomes shell syntax.
export function execute(
	argv,
	request,
	{ cwd, timeoutMs = 60000, signal, maxBytes = 1024 * 1024, env } = {},
) {
	return new Promise((resolve, reject) => {
		if (
			!Array.isArray(argv) ||
			!argv.length ||
			argv.some((a) => typeof a !== "string")
		)
			return reject(new Error("Command must be a nonempty array of strings"));
		if (signal?.aborted) return reject(new Error("Run cancelled"));
		const child = spawn(argv[0], argv.slice(1), {
			cwd,
			env,
			stdio: ["pipe", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		let stdout = "",
			stderr = "",
			bytes = 0,
			failure,
			killTimer;
		const kill = (sig) => {
			try {
				process.platform === "win32"
					? child.kill(sig)
					: process.kill(-child.pid, sig);
			} catch {}
		};
		const stop = (reason) => {
			if (failure) return;
			failure = reason;
			kill("SIGTERM");
			killTimer = setTimeout(() => kill("SIGKILL"), 300);
			// Keep escalation alive even if the parent exits before its descendants.
		};
		const abort = () => stop("Run cancelled");
		const timer = setTimeout(() => stop("Command timed out"), timeoutMs);
		signal?.addEventListener("abort", abort, { once: true });
		const collect = (stream) => (data) => {
			bytes += Buffer.byteLength(data);
			if (bytes > maxBytes) stop("Command output exceeded 1 MiB");
			else if (stream === "out") stdout += data;
			else stderr += data;
		};
		child.stdout.on("data", collect("out"));
		child.stderr.on("data", collect("err"));
		child.stdin.on("error", () => {});
		child.on("error", (error) => {
			clearTimeout(timer);
			clearTimeout(killTimer);
			signal?.removeEventListener("abort", abort);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (!failure) clearTimeout(killTimer);
			signal?.removeEventListener("abort", abort);
			resolve({ code, stdout, stderr, failure });
		});
		child.stdin.end(
			typeof request === "string" ? request : `${JSON.stringify(request)}\n`,
		);
	});
}

export async function runTask({
	task,
	adapter,
	verifier,
	cwd = process.cwd(),
	maxRounds = 3,
	timeoutMs = 60000,
	signal,
	adapterFormat = "json",
	onRound = () => {},
}) {
	if (!["json", "text"].includes(adapterFormat))
		throw new Error("adapterFormat must be json or text");
	if (typeof task !== "string" || !task.trim())
		throw new Error("A task is required");
	if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 20)
		throw new Error("maxRounds must be 1–20");
	if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000)
		throw new Error("timeoutMs must be 100–600000");
	const redact = resultRedactor(process.env);
	const runId = randomUUID(),
		runDir = path.join(cwd, ".grainulator/runs", runId);
	fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
	const result = {
		schema_version: "grainulator.run.v1",
		runId,
		task,
		status: "running",
		startedAt: new Date().toISOString(),
		rounds: [],
	};
	let feedback = null,
		previousAnswerHash;
	const save = () => {
		const dest = path.join(runDir, "result.json");
		fs.writeFileSync(`${dest}.tmp`, JSON.stringify(redact(result), null, 2), {
			mode: 0o600,
		});
		fs.renameSync(`${dest}.tmp`, dest);
	};
	save();
	try {
		for (let round = 1; round <= maxRounds; round++) {
			if (signal?.aborted) {
				result.status = "cancelled";
				break;
			}
			const request = {
				protocol: "grainulator.adapter.v1",
				runId,
				round,
				task,
				feedback,
				remainingRounds: maxRounds - round,
			};
			const execution = await execute(
				adapter,
				adapterFormat === "text"
					? `Task: ${task}\n\n${feedback ? `Previous verification feedback:\n${feedback}\n\nCorrect the result using this feedback.` : "Complete the task and return your result."}\n`
					: request,
				{ cwd, timeoutMs, signal },
			);
			if (execution.failure || execution.code !== 0)
				throw new Error(
					execution.failure ||
						`Adapter exited ${execution.code}: ${execution.stderr.slice(0, 2000)}`,
				);
			let response;
			try {
				response =
					adapterFormat === "text"
						? { answer: execution.stdout.trim() }
						: JSON.parse(execution.stdout);
			} catch {
				throw new Error(
					"Adapter must return one JSON object with a nonempty answer string",
				);
			}
			if (typeof response?.answer !== "string" || !response.answer.trim())
				throw new Error("Adapter response requires a nonempty answer string");
			const answerHash = hash(response.answer);
			const record = {
				round,
				answer: response.answer,
				answerHash,
				verification: null,
			};
			result.rounds.push(record);
			// An assertion of success from the adapter never substitutes for a verifier.
			if (!verifier) {
				result.status = "unverified";
				onRound(redact(record));
				break;
			}
			const check = await execute(
				verifier,
				{ ...request, answer: response.answer, answerHash },
				{ cwd, timeoutMs, signal },
			);
			record.verification = {
				passed: check.code === 0 && !check.failure,
				exitCode: check.code,
				feedback: (check.stdout + check.stderr).slice(0, 16000),
				failure: check.failure || null,
				answerHash,
			};
			onRound(redact(record));
			save();
			if (signal?.aborted) {
				result.status = "cancelled";
				break;
			}
			if (record.verification.passed) {
				result.status = "verified";
				break;
			}
			if (check.failure) {
				result.status = "verification_error";
				break;
			}
			if (
				answerHash === previousAnswerHash &&
				feedback === record.verification.feedback
			) {
				result.status = "stalled";
				break;
			}
			previousAnswerHash = answerHash;
			feedback = record.verification.feedback;
			if (round === maxRounds) result.status = "budget_exhausted";
		}
	} catch (error) {
		result.status = signal?.aborted ? "cancelled" : "error";
		result.error = error.message;
	}
	result.finishedAt = new Date().toISOString();
	save();
	return redact({ ...result, trace: path.join(runDir, "result.json") });
}
