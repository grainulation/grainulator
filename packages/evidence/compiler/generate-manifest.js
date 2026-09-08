#!/usr/bin/env node
/**
 * wheat-manifest.json generator
 *
 * Reads claims.json, compilation.json, and scans the repo directory structure
 * to produce a topic-map manifest. Zero npm dependencies.
 *
 * Usage:  node generate-manifest.js [--out wheat-manifest.json] [--dir <path>]
 *
 * Based on research claims r011 (single machine-readable manifest) and
 * r017 (topic map structure over file tree).
 */

import fs from "fs";
import path from "path";

import { fileURLToPath } from "url";
import { detectSprints } from "../../shared/tools/detect-sprints.js";
import { env } from "../lib/defaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Target directory ────────────────────────────────────────────────────────

const _dirIdx = process.argv.indexOf("--dir");
const ROOT =
	_dirIdx !== -1 && process.argv[_dirIdx + 1]
		? path.resolve(process.argv[_dirIdx + 1])
		: __dirname;

// --- Helpers ---

/** Safely parse JSON from a file path; returns null on failure. */
export function loadJSON(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

/** Recursively list files under dir, returning paths relative to ROOT. */
export function walk(dir, filter) {
	const results = [];
	if (!fs.existsSync(dir)) return results;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			// skip hidden dirs and node_modules
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			results.push(...walk(full, filter));
		} else {
			const rel = path.relative(ROOT, full).split(path.sep).join("/");
			if (!filter || filter(rel, entry.name)) results.push(rel);
		}
	}
	return results;
}

/** Determine file type from its path. */
export function classifyFile(relPath) {
	const normalized = relPath.split(path.sep).join("/");
	if (normalized.startsWith("prototypes/")) return "prototype";
	if (normalized.startsWith("research/")) return "research";
	if (normalized.startsWith("output/")) return "output";
	if (normalized.startsWith("evidence/")) return "evidence";
	if (normalized.startsWith("templates/")) return "template";
	if (normalized.startsWith("examples/")) return "example";
	if (normalized.startsWith("test/")) return "test";
	if (normalized.startsWith("docs/")) return "docs";
	// root-level files
	if (relPath.endsWith(".json")) return "config";
	if (relPath.endsWith(".js") || relPath.endsWith(".mjs")) return "script";
	if (relPath.endsWith(".md")) return "docs";
	return "other";
}

/** Compute highest evidence tier from a list of claims. */
export function highestEvidence(claims) {
	const tiers = ["stated", "web", "documented", "tested", "production"];
	let max = 0;
	for (const c of claims) {
		const idx = tiers.indexOf(c.evidence);
		if (idx > max) max = idx;
	}
	return tiers[max];
}

/**
 * Detect sprints using detect-sprints.js (git-based, no config pointer).
 * Falls back to a minimal scan if detect-sprints.js is unavailable.
 */
function detectSprintsForManifest() {
	// Check for cached sprint data from compiler (avoids re-running detectSprints)
	if (env.WHEAT_SPRINTS_CACHE) {
		try {
			const parsed = JSON.parse(env.WHEAT_SPRINTS_CACHE);
			const sprints = {};
			for (const s of parsed.sprints || []) {
				sprints[s.name] = {
					question: s.question || "",
					phase: s.phase || "unknown",
					claims_count: s.claims_count || 0,
					active_claims: s.active_claims || 0,
					path: s.path,
					status: s.status,
					last_git_activity: s.last_git_activity,
					git_commit_count: s.git_commit_count,
				};
			}
			return sprints;
		} catch {
			/* fall through to live detection */
		}
	}

	// Try to use the exported function directly
	try {
		const parsed = detectSprints(ROOT);
		const sprints = {};
		for (const s of parsed.sprints || []) {
			sprints[s.name] = {
				question: s.question || "",
				phase: s.phase || "unknown",
				claims_count: s.claims_count || 0,
				active_claims: s.active_claims || 0,
				path: s.path,
				status: s.status,
				last_git_activity: s.last_git_activity,
				git_commit_count: s.git_commit_count,
			};
		}
		return sprints;
	} catch {
		// Fall through to naive fallback
	}

	// Fallback: minimal scan without git info
	const sprints = {};
	const currentClaims = loadJSON(path.join(ROOT, "claims.json"));
	if (currentClaims) {
		sprints["current"] = {
			question: currentClaims.meta?.question || "",
			phase: currentClaims.meta?.phase || "unknown",
			claims_count: currentClaims.claims?.length || 0,
			path: ".",
		};
	}
	const examplesDir = path.join(ROOT, "examples");
	if (fs.existsSync(examplesDir)) {
		for (const entry of fs.readdirSync(examplesDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const sprintClaims = loadJSON(
				path.join(examplesDir, entry.name, "claims.json"),
			);
			if (sprintClaims) {
				sprints[entry.name] = {
					question: sprintClaims.meta?.question || "",
					phase: sprintClaims.meta?.phase || "unknown",
					claims_count: sprintClaims.claims?.length || 0,
					path: path.join("examples", entry.name),
				};
			}
		}
	}
	return sprints;
}

// --- Callable manifest generation ---

/**
 * Generate the manifest. Can be called directly (no subprocess needed).
 * @param {string} dir - Root directory of the sprint
 * @param {object} [opts] - Options
 * @param {object} [opts.sprintsInfo] - Pre-computed sprint data (avoids re-running detectSprints)
 * @returns {{ manifest: object, topicCount: number, fileCount: number, sprintCount: number }}
 */
export function buildManifest(dir, opts = {}) {
	const rootDir = dir || ROOT;
	const claims = loadJSON(path.join(rootDir, "claims.json"));
	const compilation = loadJSON(path.join(rootDir, "compilation.json"));

	if (!claims) return null;

	// 1. Build topic map from claims
	const topicMap = {};
	for (const claim of claims.claims) {
		const topic = claim.topic;
		if (!topicMap[topic]) {
			topicMap[topic] = {
				claims: [],
				files: new Set(),
				sprint: "current",
				evidence_level: "stated",
			};
		}
		topicMap[topic].claims.push(claim.id);
	}

	// Compute evidence levels per topic
	for (const topic of Object.keys(topicMap)) {
		const topicClaims = claims.claims.filter((c) => c.topic === topic);
		topicMap[topic].evidence_level = highestEvidence(topicClaims);
	}

	// 2. Scan current sprint directories for files
	const scanDirs = [
		"research",
		"prototypes",
		"output",
		"evidence",
		"templates",
		"test",
		"docs",
	];
	const allFiles = {};

	for (const d of scanDirs) {
		const files = walk(path.join(rootDir, d));
		for (const f of files) {
			const type = classifyFile(f);
			allFiles[f] = { topics: [], type };
		}
	}

	// Also include root-level scripts/configs
	try {
		for (const entry of fs.readdirSync(rootDir)) {
			if (entry.startsWith(".") || entry === "node_modules") continue;
			const full = path.join(rootDir, entry);
			try {
				if (fs.statSync(full).isFile()) {
					const type = classifyFile(entry);
					if (type !== "other") {
						allFiles[entry] = { topics: [], type };
					}
				}
			} catch {
				/* skip */
			}
		}
	} catch {
		/* skip */
	}

	// 3. Map files to topics using claim source artifacts and keyword heuristics
	const topicKeywords = {
		"multi-session": [
			"session",
			"server.mjs",
			"hooks-config",
			"dashboard.html",
			"ws.mjs",
		],
		"multi-sprint": ["sprint", "examples/"],
		cartography: ["manifest", "cartography", "index"],
		performance: ["performance", "evaluation"],
		compatibility: ["compat"],
	};

	for (const [filePath, fileInfo] of Object.entries(allFiles)) {
		const lower = filePath.toLowerCase();

		for (const [topic, keywords] of Object.entries(topicKeywords)) {
			if (keywords.some((kw) => lower.includes(kw))) {
				if (!fileInfo.topics.includes(topic)) fileInfo.topics.push(topic);
			}
		}

		for (const claim of claims.claims) {
			if (
				claim.source?.artifact &&
				filePath.includes(
					claim.source.artifact.replace(
						/^.*[/\\]prototypes[/\\]/,
						"prototypes/",
					),
				)
			) {
				if (!fileInfo.topics.includes(claim.topic)) {
					fileInfo.topics.push(claim.topic);
				}
			}
		}

		for (const topic of fileInfo.topics) {
			if (topicMap[topic]) {
				topicMap[topic].files.add(filePath);
			}
		}
	}

	// 4. Convert Sets to arrays for JSON serialization
	for (const topic of Object.keys(topicMap)) {
		topicMap[topic].files = [...topicMap[topic].files].sort();
	}

	// 5. Detect sprints (use cached data if provided)
	let sprints;
	if (opts.sprintsInfo) {
		sprints = {};
		for (const s of opts.sprintsInfo.sprints || []) {
			sprints[s.name] = {
				question: s.question || "",
				phase: s.phase || "unknown",
				claims_count: s.claims_count || 0,
				active_claims: s.active_claims || 0,
				path: s.path,
				status: s.status,
				last_git_activity: s.last_git_activity,
				git_commit_count: s.git_commit_count,
			};
		}
	} else {
		sprints = detectSprintsForManifest();
	}

	// 6. Build final manifest
	const topicFiles = {};
	for (const [filePath, mInfo] of Object.entries(allFiles)) {
		if (mInfo.topics.length > 0) {
			topicFiles[filePath] = mInfo;
		}
	}

	const manifest = {
		generated: new Date().toISOString(),
		generator: "generate-manifest.js",
		claims_hash: compilation?.claims_hash || null,
		topics: topicMap,
		sprints,
		files: topicFiles,
	};

	const outPath = path.join(rootDir, "wheat-manifest.json");
	fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");

	return {
		manifest,
		topicCount: Object.keys(topicMap).length,
		fileCount: Object.keys(topicFiles).length,
		sprintCount: Object.keys(sprints).length,
	};
}

// --- Main (only when run directly) ---

const isMain =
	process.argv[1] &&
	fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
	const t0 = performance.now();

	const result = buildManifest(ROOT);
	if (!result) {
		console.error(
			"Error: claims.json not found or invalid at",
			path.join(ROOT, "claims.json"),
		);
		process.exit(1);
	}

	const elapsed = (performance.now() - t0).toFixed(1);
	const sizeBytes = Buffer.byteLength(JSON.stringify(result.manifest, null, 2));
	console.log(`wheat-manifest.json generated in ${elapsed}ms`);
	console.log(
		`  Topics: ${result.topicCount}  |  Files: ${
			result.fileCount
		}  |  Sprints: ${result.sprintCount}  |  Size: ${(sizeBytes / 1024).toFixed(
			1,
		)}KB`,
	);
}
