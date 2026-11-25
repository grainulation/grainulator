#!/usr/bin/env node

/**
 * generate-manifest.js — Build .grainulator/evidence/manifest.json topic map
 *
 * Reads claims.json, compilation.json, and scans the repo directory structure
 * to produce a topic-map manifest. Zero npm dependencies.
 *
 * Usage:
 *   shared generate-manifest                        # Write .grainulator/evidence/manifest.json
 *   shared generate-manifest --root /path            # Target a specific repo
 *   shared generate-manifest --out custom-name.json  # Custom output path
 */

import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { detectSprints } from "./detect-sprints.js";

interface ManifestClaim {
	id: string;
	topic: string;
	evidence?: string;
	source?: { artifact?: string | null } | null | undefined;
}
interface ClaimsInput {
	claims: ManifestClaim[];
}
interface TopicBuilder {
	claims: string[];
	files: Set<string>;
	sprint: string;
	evidence_level: string;
}
interface FileInfo {
	topics: string[];
	type: string;
}
const object = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);
// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function arg(name: string, fallback: string): string {
	const i = args.indexOf(`--${name}`);
	return i !== -1 ? args[i + 1] || fallback : fallback;
}

const ROOT = arg("root", process.cwd());
const OUT_PATH = join(ROOT, arg("out", ".grainulator/evidence/manifest.json"));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadJSON(path: string): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(readFileSync(path, "utf8"));
		return object(value) ? value : null;
	} catch {
		return null;
	}
}

/** Recursively list files under dir, returning paths relative to rootDir. */
function walk(
	dir: string,
	filter: ((relative: string, name: string) => boolean) | null,
	rootDir: string,
): string[] {
	const results: string[] = [];
	if (!existsSync(dir)) return results;
	const base = rootDir || dir;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			results.push(...walk(full, filter, base));
		} else {
			const rel = relative(base, full).split(sep).join("/");
			if (!filter || filter(rel, entry.name)) results.push(rel);
		}
	}
	return results;
}

/** Determine file type from its path. */
function classifyFile(relPath: string): string {
	if (relPath.startsWith("prototypes/")) return "prototype";
	if (relPath.startsWith("research/")) return "research";
	if (relPath.startsWith("output/")) return "output";
	if (relPath.startsWith("evidence/")) return "evidence";
	if (relPath.startsWith("templates/")) return "template";
	if (relPath.startsWith("examples/")) return "example";
	if (relPath.startsWith("test/")) return "test";
	if (relPath.startsWith("docs/")) return "docs";
	if (relPath.endsWith(".json")) return "config";
	if (relPath.endsWith(".js") || relPath.endsWith(".mjs")) return "script";
	if (relPath.endsWith(".md")) return "docs";
	return "other";
}

/** Compute highest evidence tier from a list of claims. */
function highestEvidence(claims: ManifestClaim[]): string {
	const tiers = ["stated", "web", "documented", "tested", "production"];
	let max = 0;
	for (const c of claims) {
		const idx = tiers.indexOf(c.evidence ?? "");
		if (idx > max) max = idx;
	}
	return tiers[max] ?? "stated";
}

// ─── Exported function ───────────────────────────────────────────────────────

/**
 * Generate a evidence-manifest object from a claims.json path.
 *
 * @param {string} claimsPath — absolute path to claims.json
 * @param {object} [opts] — optional overrides
 * @param {string} [opts.root] — repo root directory (defaults to dirname of claimsPath)
 * @returns {object} — the manifest object (not written to disk)
 */
export function generateManifest(
	claimsPath: string,
	opts: { root?: string } = {},
) {
	const root = opts.root || join(claimsPath, "..");
	const raw = loadJSON(claimsPath);
	const validClaims = (value: unknown): value is ClaimsInput =>
		object(value) &&
		Array.isArray(value.claims) &&
		value.claims.every(
			(claim: unknown): claim is ManifestClaim =>
				object(claim) &&
				typeof claim.id === "string" &&
				typeof claim.topic === "string" &&
				(claim.evidence === undefined || typeof claim.evidence === "string") &&
				(claim.source == null ||
					(object(claim.source) &&
						(claim.source.artifact == null ||
							typeof claim.source.artifact === "string"))),
		);
	const claims = validClaims(raw) ? raw : null;
	if (!claims) {
		throw new Error(`claims.json not found or invalid at ${claimsPath}`);
	}

	const compilationPath = join(root, "compilation.json");
	const compilation = loadJSON(compilationPath);

	// 1. Build topic map from claims
	const topicMap = new Map<string, TopicBuilder>();
	for (const claim of claims.claims) {
		const topic = claim.topic;
		if (!topicMap.has(topic)) {
			topicMap.set(topic, {
				claims: [],
				files: new Set(),
				sprint: "current",
				evidence_level: "stated",
			});
		}
		topicMap.get(topic)?.claims.push(claim.id);
	}

	for (const [topic, bucket] of topicMap) {
		const topicClaims = claims.claims.filter((c) => c.topic === topic);
		if (bucket) bucket.evidence_level = highestEvidence(topicClaims);
	}

	// 2. Scan directories for files
	const scanDirs = [
		"research",
		"prototypes",
		"output",
		"evidence",
		"templates",
		"test",
		"docs",
	];
	const allFiles: Record<string, FileInfo> = {};

	for (const dir of scanDirs) {
		const files = walk(join(root, dir), null, root);
		for (const f of files) {
			allFiles[f] = { topics: [], type: classifyFile(f) };
		}
	}

	// Root-level scripts/configs
	try {
		for (const entry of readdirSync(root)) {
			if (entry.startsWith(".") || entry === "node_modules") continue;
			const full = join(root, entry);
			try {
				if (statSync(full).isFile()) {
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

	// 3. Map files to topics via claim artifacts
	for (const [filePath, fileInfo] of Object.entries(allFiles)) {
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
			topicMap.get(topic)?.files.add(filePath);
		}
	}

	// 4. Preserve typed mutable builders; serialize their file sets in the output projection.
	const topics = Object.fromEntries(
		[...topicMap].map(([name, info]) => [
			name,
			{ ...info, files: [...info.files].sort() },
		]),
	);

	// 5. Detect sprints
	const sprintResult = detectSprints(root);
	const sprints = new Map<
		string,
		{
			question: string;
			phase: string;
			claims_count: number;
			active_claims: number;
			path: string;
			status: string;
			last_git_activity: string | null;
			git_commit_count: number;
		}
	>();
	for (const s of sprintResult.sprints || []) {
		sprints.set(s.name, {
			question: s.question || "",
			phase: s.phase || "unknown",
			claims_count: s.claims_count || 0,
			active_claims: s.active_claims || 0,
			path: s.path,
			status: s.status,
			last_git_activity: s.last_git_activity,
			git_commit_count: s.git_commit_count,
		});
	}

	// 6. Build manifest
	const topicFiles: Record<string, FileInfo> = {};
	for (const [path, info] of Object.entries(allFiles)) {
		if (info.topics.length > 0) {
			topicFiles[path] = info;
		}
	}

	return {
		schema_version: "1.0",
		generated: new Date().toISOString(),
		generator: "@grainulation/grainulator-shared generate-manifest",
		claims_hash: compilation?.claims_hash || null,
		topics,
		sprints: Object.fromEntries(sprints),
		files: topicFiles,
	};
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

// Only run CLI logic when executed directly (not imported)
const isMain =
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`generate-manifest — build .grainulator/evidence/manifest.json topic map

Usage:
  shared generate-manifest                         Write .grainulator/evidence/manifest.json
  shared generate-manifest --root /path             Target a specific repo
  shared generate-manifest --out custom-name.json   Custom output path

Reads claims.json and scans the repo to produce a topic map manifest
that gives AI tools a single file describing the sprint state.`);
		process.exit(0);
	}

	const t0 = performance.now();
	const manifest = generateManifest(join(ROOT, "claims.json"), { root: ROOT });

	mkdirSync(resolve(OUT_PATH, ".."), { recursive: true });
	writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + "\n");
	const elapsed = (performance.now() - t0).toFixed(1);

	const topicCount = Object.keys(manifest.topics).length;
	const fileCount = Object.keys(manifest.files).length;
	const sprintCount = Object.keys(manifest.sprints).length;
	const sizeBytes = Buffer.byteLength(JSON.stringify(manifest, null, 2));

	console.log(`.grainulator/evidence/manifest.json generated in ${elapsed}ms`);
	console.log(
		`  Topics: ${topicCount}  |  Files: ${fileCount}  |  Sprints: ${sprintCount}  |  Size: ${(sizeBytes / 1024).toFixed(1)}KB`,
	);
}
