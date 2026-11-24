import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import type {
	CommandOptions,
	MCPClient,
	MCPMethodResult,
	ToolEnvelope,
	ToolResult,
	UnknownRecord,
} from "../contracts.mjs";
export function command(
	argv: string[],
	{ cwd, env = {}, input, timeout = 60000 }: CommandOptions = {},
) {
	const result = spawnSync(argv[0]!, argv.slice(1), {
		cwd,
		env: { ...process.env, NODE_PATH: "", ...env },
		input,
		encoding: "utf8",
		timeout,
		maxBuffer: 8 * 1024 * 1024,
	});
	if (result.status !== 0)
		throw Error(
			`${argv.slice(0, 3).join(" ")} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`,
		);
	return result.stdout;
}
export function mcp(
	argv: string[],
	{ cwd, env = {} }: CommandOptions = {},
): MCPClient {
	const child = spawn(argv[0]!, argv.slice(1), {
		cwd,
		env: { ...process.env, NODE_PATH: "", ...env },
		stdio: ["pipe", "pipe", "pipe"],
	});
	let seq = 0,
		stderr = "";
	const pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	child.stderr.on("data", (chunk) => {
		stderr = (stderr + chunk).slice(-4000);
	});
	child.stdin.on("error", () => {});
	readline.createInterface({ input: child.stdout }).on("line", (line) => {
		let msg: UnknownRecord;
		try {
			const parsed: unknown = JSON.parse(String(line));
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
				return;
			msg = parsed as UnknownRecord;
		} catch {
			return;
		}
		if (typeof msg.id !== "number") return;
		const entry = pending.get(msg.id);
		if (!entry) return;
		pending.delete(msg.id);
		clearTimeout(entry.timer);
		if (msg.error) entry.reject(Error(JSON.stringify(msg.error)));
		else entry.resolve(msg.result);
	});
	const fail = (err: Error) => {
		for (const item of pending.values()) {
			clearTimeout(item.timer);
			item.reject(err);
		}
		pending.clear();
	};
	child.on("error", fail);
	child.on("exit", () => fail(Error(`MCP exited: ${stderr}`)));
	return {
		async request<K extends string>(method: K, params: UnknownRecord = {}) {
			const id = ++seq;
			const value = await new Promise<unknown>((resolve, reject) => {
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(Error(`MCP timeout: ${method}: ${stderr}`));
				}, 10000);
				pending.set(id, { resolve, reject, timer });
				child.stdin.write(
					JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
				);
			});
			if (
				value &&
				typeof value === "object" &&
				"isError" in value &&
				value.isError
			)
				throw Error(JSON.stringify(value));
			return value as MCPMethodResult<K>;
		},
		notify(method: string, params: UnknownRecord = {}) {
			child.stdin.write(
				JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
			);
		},
		async close() {
			child.stdin.end();
			child.kill("SIGTERM");
			if (child.exitCode !== null) return;
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					child.kill("SIGKILL");
					resolve();
				}, 1000);
				child.once("exit", () => {
					clearTimeout(timer);
					resolve();
				});
			});
		},
	};
}
export function toolJSON(result: ToolEnvelope): ToolResult {
	const text = result.content?.find((c) => c.type === "text")?.text;
	const parsed: unknown = JSON.parse(String(text));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw Error("Invalid MCP tool result");
	const value = parsed as ToolResult;
	if (value.status === "error") throw Error(text);
	return value;
}
