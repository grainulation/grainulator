import fs from "node:fs";
import path from "node:path";
import { execute } from "../../lib/runner.js";
import type {
	HostCall,
	HostEvent,
	HostOptions,
	TokenUsage,
	UnknownRecord,
} from "../contracts.mjs";
export function hostArgs(
	host: string,
	{
		cwd,
		model,
		mcpConfig,
		sessionId,
		resume = false,
		hooks = false,
	}: HostOptions = {},
) {
	if (host === "codex") {
		const args = [
			"codex",
			"exec",
			"--ignore-user-config",
			"--skip-git-repo-check",
			"--json",
			"-c",
			"project_doc_max_bytes=0",
			"-c",
			"features.shell_tool=false",
		];
		if (model) args.push("--model", model);
		for (const [name, server] of Object.entries(mcpConfig?.mcpServers || {})) {
			args.push(
				"-c",
				`mcp_servers.${name}.command=${JSON.stringify(server.command)}`,
				"-c",
				`mcp_servers.${name}.args=${JSON.stringify(server.args)}`,
			);
			if (server.enabledTools) {
				args.push(
					"-c",
					`mcp_servers.${name}.enabled_tools=${JSON.stringify(server.enabledTools)}`,
				);
				args.push(
					"-c",
					`mcp_servers.${name}.tools={${server.enabledTools.map((tool) => `${JSON.stringify(tool)}={approval_mode="approve"}`).join(",")}}`,
				);
			}
		}
		if (resume) args.push("resume", sessionId!, "-");
		else
			args.push(
				"--sandbox",
				"read-only",
				"--cd",
				cwd!,
				...(sessionId ? [] : ["--ephemeral"]),
				"-",
			);
		return args;
	}
	if (host === "claude") {
		const args = [
			"claude",
			"-p",
			"--output-format",
			"json",
			"--strict-mcp-config",
			"--mcp-config",
			JSON.stringify(mcpConfig || { mcpServers: {} }),
			"--setting-sources",
			"",
			"--tools",
			"",
			"--max-turns",
			"5",
		];
		if (!hooks) args.push("--settings", '{"disableAllHooks":true}');
		if (model) args.push("--model", model);
		if (resume) args.push("--resume", sessionId!);
		else if (sessionId) args.push("--session-id", sessionId);
		else args.push("--no-session-persistence");
		if (mcpConfig)
			args.push(
				"--allowedTools",
				...Object.keys(mcpConfig.mcpServers).map((name) => `mcp__${name}__*`),
			);
		return args;
	}
	throw Error(`Unsupported host: ${host}`);
}
export async function callHost(
	host: string,
	prompt: string,
	opts: HostOptions = {},
): Promise<HostCall> {
	const started = Date.now();
	const argv = hostArgs(host, opts);
	const raw = await execute(argv, prompt, {
		...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
		timeoutMs: opts.timeoutMs || 90000,
		...(opts.signal === undefined ? {} : { signal: opts.signal }),
		maxBytes: 4 * 1024 * 1024,
	});
	const record: Omit<
		HostCall,
		"answer" | "usage" | "costUsd" | "sessionId" | "toolCalls"
	> = {
		host,
		model: opts.model || "host default",
		durationMs: Date.now() - started,
		exitCode: raw.code,
		failure: raw.failure || null,
	};
	if (opts.log) {
		fs.mkdirSync(path.dirname(opts.log), { recursive: true });
		fs.writeFileSync(
			opts.log,
			JSON.stringify(
				{ record, stdout: raw.stdout, stderr: raw.stderr },
				null,
				2,
			),
			{ mode: 0o600 },
		);
	}
	if (raw.failure || raw.code !== 0)
		throw Error(
			`${host}: ${raw.failure || raw.stderr.slice(-1000) || raw.stdout.slice(-1000)}`,
		);
	let answer = "",
		usage: TokenUsage | null = null,
		costUsd: number | null = null,
		sessionId: string | null = null,
		toolCalls: UnknownRecord[] = [];
	if (host === "claude") {
		const parsed: unknown = JSON.parse(String(raw.stdout));
		const events: HostEvent[] = (
			Array.isArray(parsed) ? parsed : [parsed]
		).filter(
			(item): item is HostEvent => Boolean(item) && typeof item === "object",
		);
		const data =
			events
				.slice()
				.reverse()
				.find((e) => e.type === "result") || events[0];
		if (!data) throw Error("Missing host result");
		if (data.is_error) throw Error(data.result || JSON.stringify(data));
		answer = data.result || "";
		usage = data.usage || null;
		costUsd = data.total_cost_usd ?? null;
		sessionId = data.session_id || null;
		record.actualModels = Object.keys(data.modelUsage || {});
		toolCalls = events.flatMap((e) =>
			(e.message?.content || []).filter(
				(c: UnknownRecord) => c.type === "tool_use",
			),
		);
		record.permissionDenials = data.permission_denials || [];
	} else {
		const events: HostEvent[] = raw.stdout
			.split("\n")
			.filter(Boolean)
			.flatMap((line) => {
				try {
					const value: unknown = JSON.parse(String(line));
					return value && typeof value === "object" ? [value as HostEvent] : [];
				} catch {
					return [];
				}
			});
		for (const event of events) {
			if (event.type === "thread.started") sessionId = event.thread_id || null;
			if (event.type === "turn.completed") usage = event.usage || null;
			if (
				event.type === "item.completed" &&
				event.item?.type === "agent_message"
			)
				answer = event.item.text || "";
			if (
				event.type === "item.completed" &&
				["mcp_tool_call", "command_execution", "web_search"].includes(
					event.item?.type || "",
				)
			)
				toolCalls.push(event.item!);
		}
	}
	if (!answer?.trim()) throw Error(`${host}: no final answer`);
	return { ...record, answer, usage, costUsd, sessionId, toolCalls };
}
