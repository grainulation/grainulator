/**
 * install-prompt.js — Track npx usage and suggest global/local install
 *
 * Two exports:
 *   track(command)       — Increment invocation count (sync, <5ms)
 *   maybePrompt(command) — Print install suggestion if thresholds met
 *
 * Usage data stored in ~/.grainulation/usage.json
 * Respects --quiet flag, WHEAT_NO_INSTALL_PROMPT=1 env var.
 * Fails silently on any I/O error — never blocks the CLI.
 *
 * Based on research claim r129: no existing CLI tool does npx-to-install
 * nudging. This is an unclaimed UX innovation.
 */

import { mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import { atomicWriteJSON } from "../../shared/lib/atomic.js";
import { env } from "./defaults.js";

const USAGE_DIR = path.join(homedir(), ".grainulation");
const USAGE_FILE = path.join(USAGE_DIR, "usage.json");

const THRESHOLDS = {
	suggest_global: 3,
	suggest_local: 5,
	prominent: 10,
};

// ─── Internal helpers ────────────────────────────────────────────────────────

function readUsage() {
	try {
		return JSON.parse(readFileSync(USAGE_FILE, "utf8"));
	} catch {
		return { commands: {}, prompted: false, installed: false };
	}
}

function writeUsage(data) {
	try {
		mkdirSync(USAGE_DIR, { recursive: true });
		atomicWriteJSON(USAGE_FILE, data, 2);
	} catch {
		// fail silently
	}
}

/**
 * Detect whether wheat was invoked via npx.
 * npx stores executables in a temporary _npx cache directory.
 */
function isNpxInvocation() {
	const execPath = process.argv[1] || "";
	return execPath.includes("_npx");
}

/**
 * Detect if wheat is installed globally or locally (not via npx).
 *
 * Local install: process.argv[1] contains node_modules
 * Global install: process.argv[1] is in a known global bin path
 *   (no _npx, no node_modules — resolves to /usr/local/bin, nvm, volta, etc.)
 *
 * We intentionally do NOT detect "running from source" (node bin/wheat.js)
 * as installed, since that's a dev workflow where the prompt is also irrelevant
 * (isNpxInvocation returns false, so prompts are already suppressed).
 */
function isInstalled() {
	const execPath = process.argv[1] || "";

	// Local install: running from node_modules
	if (execPath.includes("node_modules") && !execPath.includes("_npx")) {
		return true;
	}

	// Global install: binary is in a well-known global prefix
	// (not npx, not node_modules — must be a permanent install)
	if (!execPath.includes("_npx") && !execPath.includes("node_modules")) {
		const knownGlobalDirs = [
			"/usr/local/bin",
			"/usr/bin",
			path.join(homedir(), ".npm-global"),
			path.join(homedir(), ".nvm"),
			path.join(homedir(), ".volta"),
			path.join(homedir(), ".local", "bin"),
		];
		for (const prefix of knownGlobalDirs) {
			if (execPath.startsWith(prefix)) return true;
		}
	}

	return false;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Track an npx invocation of the given command.
 * No-op if already installed or not running via npx.
 * Designed to add <5ms overhead — all sync I/O on a small JSON file.
 */
export function track(command) {
	try {
		if (!command) return;

		// If user has permanently installed wheat, record that and stop
		if (isInstalled()) {
			const data = readUsage();
			if (!data.installed) {
				data.installed = true;
				writeUsage(data);
			}
			return;
		}

		// Only count npx invocations
		if (!isNpxInvocation()) return;

		const data = readUsage();
		if (data.installed) return;

		if (!data.commands) data.commands = {};
		data.commands[command] = (data.commands[command] || 0) + 1;
		writeUsage(data);
	} catch {
		// fail silently — never interfere with the command
	}
}

/**
 * Print an install suggestion if usage thresholds are met.
 * No-op if:
 *   - Already installed (globally or locally)
 *   - --quiet flag is present
 *   - WHEAT_NO_INSTALL_PROMPT=1 env var is set
 *   - Not running via npx
 *   - Below threshold
 *
 * Messages go to stderr so they don't pollute stdout (piped output stays clean).
 * Never blocks, never prompts interactively, never forces.
 */
export function maybePrompt(command) {
	try {
		if (env.WHEAT_NO_INSTALL_PROMPT === "1") return;
		if (process.argv.includes("--quiet")) return;
		if (isInstalled()) return;
		if (!isNpxInvocation()) return;
		if (!command) return;

		const data = readUsage();
		if (data.installed) return;

		const count = (data.commands && data.commands[command]) || 0;
		const total = Object.values(data.commands || {}).reduce((a, b) => a + b, 0);

		// Use the higher of per-command and total count for threshold comparison.
		// A user who runs 2x init + 2x compile = 4 total should start seeing prompts
		// even though neither command alone hit 3.
		const effective = Math.max(count, total);

		if (effective >= THRESHOLDS.prominent) {
			// 10+ invocations: more visible, but still non-blocking
			process.stderr.write(
				`\n  wheat: You've used npx ${total} times (${command}: ${count}).` +
					`\n         Install for instant startup and offline use:` +
					`\n           npm i -g @grainulation/wheat    (global)` +
					`\n           npm i -D @grainulation/wheat    (project dev dep)\n\n`,
			);
		} else if (effective >= THRESHOLDS.suggest_local) {
			// 5-9 invocations: suggest both global and local
			process.stderr.write(
				`  wheat: You've run wheat via npx ${total} times. ` +
					`For instant startup: npm i -g @grainulation/wheat\n` +
					`  Or add to this project: npm i -D @grainulation/wheat\n`,
			);
		} else if (effective >= THRESHOLDS.suggest_global) {
			// 3-4 invocations: one-liner, suggest global only
			process.stderr.write(
				`  wheat: You've run wheat via npx ${count} times. ` +
					`For instant startup: npm i -g @grainulation/wheat\n`,
			);
		}
	} catch {
		// fail silently
	}
}
