/**
 * hints.js — Ecosystem cross-promotion hints
 *
 * Contextual, one-line, non-blocking hints that surface Grainulation
 * ecosystem tools at the moment the user's workflow makes them relevant.
 *
 * Shows max 1 hint per invocation on stderr.
 * Tracks shown hints in ~/.grainulation/hints.json
 * Fails silently on any I/O error — never blocks the CLI.
 *
 * Zero dependencies.
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import { env } from "./defaults.js";

const HINTS_DIR = path.join(homedir(), ".grainulation");
const HINTS_FILE = path.join(HINTS_DIR, "hints.json");
const MAX_SHOWS = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// ─── State I/O (sync, fail-silent) ──────────────────────────────────────────

function readHints() {
	try {
		return JSON.parse(readFileSync(HINTS_FILE, "utf8"));
	} catch {
		return { shown: {}, dismissed: [], installed: [] };
	}
}

function writeHints(data) {
	try {
		mkdirSync(HINTS_DIR, { recursive: true });
		writeFileSync(HINTS_FILE, JSON.stringify(data, null, 2) + "\n");
	} catch {
		// fail silently
	}
}

function shouldSuppress(product, state) {
	if ((state.dismissed || []).includes(product)) return true;
	if ((state.installed || []).includes(product)) return true;
	const record = (state.shown || {})[product];
	if (!record) return false;
	if (record.count >= MAX_SHOWS) return true;
	if (record.last && Date.now() - new Date(record.last).getTime() < COOLDOWN_MS)
		return true;
	return false;
}

// ─── Triggers (ordered by priority, first match wins) ────────────────────────

const TRIGGERS = [
	// 1. >20 claims → harvest
	function detectHarvestFromClaims(compilation) {
		const count = compilation?.claims?.length || 0;
		if (count > 20) {
			return {
				product: "harvest",
				message:
					"btw: harvest can visualize claim growth across sprints (npx @grainulation/harvest)",
			};
		}
		return null;
	},

	// 2. >3 topics → orchard
	function detectOrchardFromTopics(compilation) {
		const claims = compilation?.claims || [];
		const topics = new Set(claims.map((c) => c.topic).filter(Boolean));
		if (topics.size > 3) {
			return {
				product: "orchard",
				message:
					"btw: orchard can run multiple research sprints in parallel (npx @grainulation/orchard)",
			};
		}
		return null;
	},

	// 3. brief/present context → mill
	function detectMillFromBrief(compilation, context) {
		if (context === "brief" || context === "present") {
			return {
				product: "mill",
				message:
					"btw: mill can export this as PDF, slides, or Confluence (npx @grainulation/mill)",
			};
		}
		return null;
	},

	// 5. >5 sprints → silo
	function detectSiloFromSprints(compilation) {
		const sprintCount = compilation?.sprints?.length || 0;
		if (sprintCount > 5) {
			return {
				product: "silo",
				message:
					"btw: silo stores reusable claim libraries across projects (npx @grainulation/silo)",
			};
		}
		return null;
	},
];

// ─── Format ──────────────────────────────────────────────────────────────────

function formatHint(message) {
	return `  \x1b[2m${message}\x1b[0m`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate trigger conditions and return a formatted hint string,
 * or null if no hint should be shown.
 *
 * @param {object} compilation - The compilation.json data
 * @param {object} opts
 * @param {string} opts.context - "compile" | "init" | "brief" | "present"
 * @returns {string|null} Formatted hint for stderr, or null
 */
export function maybeHint(compilation, opts = {}) {
	try {
		// Global suppression
		if (env.WHEAT_BTW === "off") return null;
		if (env.WHEAT_NO_HINTS === "1") return null;
		if (env.CI) return null;
		if (process.argv.includes("--quiet")) return null;
		if (process.argv.includes("--json")) return null;
		if (!process.stderr.isTTY) return null;

		const state = readHints();

		for (const trigger of TRIGGERS) {
			const result = trigger(compilation, opts.context);
			if (!result) continue;
			if (shouldSuppress(result.product, state)) continue;

			// Record the show
			if (!state.shown) state.shown = {};
			if (!state.shown[result.product])
				state.shown[result.product] = { count: 0 };
			state.shown[result.product].count++;
			state.shown[result.product].last = new Date().toISOString();
			writeHints(state);

			return formatHint(result.message);
		}
	} catch {
		// fail silently — never block the main output
	}
	return null;
}

/**
 * Record that a product has been installed/connected.
 * @param {string} product
 */
export function markInstalled(product) {
	try {
		const state = readHints();
		if (!state.installed) state.installed = [];
		if (!state.installed.includes(product)) {
			state.installed.push(product);
			writeHints(state);
		}
	} catch {
		// fail silently
	}
}

/**
 * Record that the user dismissed hints for a product.
 * @param {string} product
 */
export function dismiss(product) {
	try {
		const state = readHints();
		if (!state.dismissed) state.dismissed = [];
		if (!state.dismissed.includes(product)) {
			state.dismissed.push(product);
			writeHints(state);
		}
	} catch {
		// fail silently
	}
}

/**
 * Reset all hint state (for testing).
 */
export function reset() {
	writeHints({ shown: {}, dismissed: [], installed: [] });
}
