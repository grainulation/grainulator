/**
 * wheat guard — PreToolUse hook for Claude Code
 *
 * Blocks writes to output/ unless compilation is fresh and ready.
 * Blocks malformed claims.json writes.
 *
 * Resolves all paths relative to the TARGET repo (via --dir or cwd),
 * not the package directory.
 *
 * Exit codes:
 *   0 = allow
 *   2 = block (with reason on stderr)
 *
 * Zero npm dependencies.
 */

import fs from "fs";
import path from "path";
import { generateCertificate, COMPILER_VERSION } from "../compiler/wheat-compiler.js";

// ─── Config ──────────────────────────────────────────────────────────────────

function loadConfig(dir) {
	const configPath = path.join(dir, "wheat.config.json");
	const defaults = {
		dirs: { output: "output" },
		compiler: { claims: "claims.json", compilation: "compilation.json" },
	};
	try {
		const raw = fs.readFileSync(configPath, "utf8");
		const config = JSON.parse(raw);
		return {
			dirs: { ...defaults.dirs, ...(config.dirs || {}) },
			compiler: { ...defaults.compiler, ...(config.compiler || {}) },
		};
	} catch {
		return defaults;
	}
}

// ─── Guard logic ─────────────────────────────────────────────────────────────

export function guard(dir, toolInput) {
	const config = loadConfig(dir);

	let input;
	try {
		input = JSON.parse(toolInput);
	} catch {
		// Not JSON — allow
		return { allow: true };
	}

	const filePath = input?.tool_input?.file_path || input?.file_path || "";
	input = input?.tool_input || input || {};
	const rel = path.relative(path.resolve(dir), path.resolve(dir, filePath)).split(path.sep).join("/");

	// Guard 1: Writes to output/ require fresh compilation
	if (rel.startsWith(config.dirs.output + "/") && !rel.endsWith(".gitkeep")) {
		const compilationPath = path.join(dir, config.compiler.compilation);
		const claimsPath = path.join(dir, config.compiler.claims);

		if (!fs.existsSync(compilationPath)) {
			return {
				allow: false,
				reason:
					`BLOCKED: No ${config.compiler.compilation} found. Run "grainulator compile" before generating output artifacts.\n` +
					"Grainulator output requires: claims.json -> compiler -> compilation.json -> artifact",
			};
		}

		if (!fs.existsSync(claimsPath)) {
			return {
				allow: false,
				reason: `BLOCKED: No ${config.compiler.claims} found. Run "grainulator init" to bootstrap the sprint first.`,
			};
		}


		try {
			const compilation = JSON.parse(fs.readFileSync(compilationPath, "utf8"));
			if (!["ready", "blocked"].includes(compilation?.status) || !Array.isArray(compilation.errors)) {
				return { allow: false, reason: "BLOCKED: Invalid compilation status or schema. Run grainulator compile." };
			}
			if (compilation.status === "blocked") {
				const errors = (compilation.errors || [])
					.map((e) => `  - ${e.message}`)
					.join("\n");
				return {
					allow: false,
					reason: `BLOCKED: Compilation status is "blocked" — unresolved issues:\n${errors}\nFix these issues and recompile before generating output artifacts.`,
				};
			}
			const certificate = compilation.compilation_certificate;
			const expected = generateCertificate(JSON.parse(fs.readFileSync(claimsPath, "utf8")));
			if (compilation.errors.length || certificate?.compiler_version !== COMPILER_VERSION || certificate?.input_hash !== expected.input_hash) {
				return { allow: false, reason: "BLOCKED: Compilation is stale or uncertified. Run grainulator compile." };
			}

		} catch {
			return {
				allow: false,
				reason: `BLOCKED: ${config.compiler.compilation} is corrupted. Run "grainulator compile" to regenerate.`,
			};
		}
	}

	// Guard 2: claims.json writes must maintain meta fields
	if (rel === config.compiler.claims && input.content) {
		try {
			const newClaims = JSON.parse(input.content);
			if (!newClaims.meta || !newClaims.meta.question) {
				return {
					allow: false,
					reason: `BLOCKED: ${config.compiler.claims} must have meta.question set. Run "grainulator init" first.`,
				};
			}
			if (!newClaims.claims || !Array.isArray(newClaims.claims)) {
				return {
					allow: false,
					reason: `BLOCKED: ${config.compiler.claims} must have a "claims" array.`,
				};
			}
		} catch {
			return { allow: false, reason: "BLOCKED: claims.json content is not valid JSON." };
		}
	}

	return { allow: true };
}

// ─── CLI handler ─────────────────────────────────────────────────────────────

export async function run(dir, args) {
	// Read tool input from stdin or first arg
	let toolInput;
	if (args[0] && !args[0].startsWith("--")) {
		toolInput = args[0];
	} else {
		try {
			// /dev/stdin is Unix-only; use fd 0 which Node resolves cross-platform
			toolInput = fs.readFileSync(0, "utf8");
		} catch {
			toolInput = "{}";
		}
	}

	const result = guard(dir, toolInput);

	if (!result.allow) {
		process.stderr.write(result.reason);
		process.exit(2);
	}

	process.exit(0);
}
