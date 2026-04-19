#!/usr/bin/env node
/**
 * sprint-status-notifier.cjs -- PostToolUse hook that POSTs sprint state to farmer.
 *
 * Invoked after mcp__wheat__wheat_add-claim. Reads claims.json and compilation.json
 * from process.cwd(), builds a compact sprint-status payload, and POSTs it to
 * farmer's /hooks/sprint-status endpoint. Failures are silent -- farmer is optional.
 *
 * Env overrides:
 *   FARMER_PORT  -- port where farmer is listening (default: 9090). Set this if you
 *                   run farmer on a non-default port so sprint status still reaches
 *                   the dashboard.
 *   FARMER_HOST  -- host (default: 127.0.0.1). Leave as 127.0.0.1 in normal use;
 *                   override for unusual multi-machine setups.
 *   CLAUDE_SESSION_ID -- Claude Code's session identifier, passed through so
 *                        farmer can correlate this hook post with the agent session.
 *
 * This file exists because embedding the HTTP request, JSON body, and env reads
 * as `node -e "..."` inside hooks.json makes it Windows-fragile -- cmd.exe parses
 * nested quotes, backticks, and escapes differently than zsh/bash, so the POST can
 * silently fail on Windows.
 *
 * Zero dependencies -- uses only Node.js built-ins. Matches prior inline behavior
 * exactly (fire-and-forget, 2s timeout, all errors swallowed).
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const FARMER_PORT = Number.parseInt(process.env.FARMER_PORT, 10) || 9090;
const FARMER_HOST = process.env.FARMER_HOST || "127.0.0.1";

/**
 * Read the hook-auth token paired with bs-19 / farmer's opportunistic Bearer
 * auth on /hooks/*. Precedence:
 *
 *   1. FARMER_TOKEN env var (explicit override — useful for tests and CI)
 *   2. <FARMER_DATA_DIR or ~/.farmer>/.farmer-token (JSON with `hook` field,
 *      or plain-text fallback from the old single-token format)
 *
 * Returns "" if no token is available; farmer will still accept the POST
 * in its opportunistic-auth mode (loopback + one-time stderr warning).
 * Never throws — hook failures must never block the agent.
 */
function readFarmerHookToken() {
  if (process.env.FARMER_TOKEN) return process.env.FARMER_TOKEN;
  try {
    const dataDir =
      process.env.FARMER_DATA_DIR || path.join(os.homedir(), ".farmer");
    const raw = fs.readFileSync(path.join(dataDir, ".farmer-token"), "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        // Prefer the narrow-scope hook token; fall back to admin for
        // pre-bs-19 farmer installs where `hook` doesn't exist yet.
        return parsed.hook || parsed.admin || "";
      } catch {
        return "";
      }
    }
    return trimmed;
  } catch {
    return "";
  }
}

try {
	const cwd = process.cwd();
	const claims = JSON.parse(
		fs.readFileSync(path.join(cwd, "claims.json"), "utf8"),
	);
	const meta = claims.meta || {};
	const active = claims.claims
		? claims.claims.filter((x) => x.status === "active").length
		: 0;

	const conflicts = (() => {
		try {
			const comp = JSON.parse(
				fs.readFileSync(path.join(cwd, "compilation.json"), "utf8"),
			);
			return (
				(comp.conflict_graph &&
					comp.conflict_graph.unresolved &&
					comp.conflict_graph.unresolved.length) ||
				0
			);
		} catch {
			return 0;
		}
	})();

	const status = (() => {
		try {
			return (
				JSON.parse(
					fs.readFileSync(path.join(cwd, "compilation.json"), "utf8"),
				).status || "unknown"
			);
		} catch {
			return "unknown";
		}
	})();

	const payload = JSON.stringify({
		session_id: process.env.CLAUDE_SESSION_ID || "unknown",
		sprint: {
			question: (meta.question || "").slice(0, 120),
			claim_count: active,
			phase: meta.phase || "unknown",
			conflict_count: conflicts,
			compile_status: status,
			timestamp: Date.now(),
		},
	});

	const headers = {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload),
	};
	const hookToken = readFarmerHookToken();
	if (hookToken) {
		headers.Authorization = `Bearer ${hookToken}`;
	}

	const req = http.request(
		{
			hostname: FARMER_HOST,
			port: FARMER_PORT,
			path: "/hooks/sprint-status",
			method: "POST",
			headers,
			timeout: 2000,
		},
		() => {},
	);
	req.on("error", () => {});
	req.write(payload);
	req.end();
} catch {
	// Any failure -- swallow. Farmer is optional; the hook must never block.
}
