/**
 * sprints.cjs — CommonJS mirror of lib/sprints.js.
 */

import fs = require("node:fs");
import path = require("node:path");
const { join, resolve, basename } = path;
const object = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

function loadSprintClaims(sprintDir: string): Record<string, unknown> | null {
	const p = resolve(sprintDir, "claims.json");
	if (!fs.existsSync(p)) return null;
	try {
		const value: unknown = JSON.parse(fs.readFileSync(p, "utf-8"));
		return object(value) ? value : null;
	} catch {
		return null;
	}
}

function loadSprintCompilation(
	sprintDir: string,
): Record<string, unknown> | null {
	const p = resolve(sprintDir, "compilation.json");
	if (!fs.existsSync(p)) return null;
	try {
		const value: unknown = JSON.parse(fs.readFileSync(p, "utf-8"));
		return object(value) ? value : null;
	} catch {
		return null;
	}
}

function sprintSummary(sprintDir: string) {
	const claims = loadSprintClaims(sprintDir);
	if (!claims) return null;
	const meta = object(claims.meta) ? claims.meta : {};
	const list: unknown[] = Array.isArray(claims.claims) ? claims.claims : [];
	const compilation = loadSprintCompilation(sprintDir);
	const graph =
		compilation && object(compilation.conflict_graph)
			? compilation.conflict_graph
			: null;
	const conflicts =
		graph && Array.isArray(graph.unresolved) ? graph.unresolved.length : 0;

	let lastModified: number | null = null;
	try {
		lastModified = fs.statSync(join(sprintDir, "claims.json")).mtimeMs;
	} catch {
		// no stat available
	}

	return {
		path: resolve(sprintDir),
		question: typeof meta.question === "string" ? meta.question : "",
		phase: typeof meta.phase === "string" ? meta.phase : "unknown",
		audience: meta.audience || [],
		initiated: meta.initiated || null,
		claim_count: list.length,
		active_claims: list.filter((c) => object(c) && c.status === "active")
			.length,
		conflict_count: conflicts,
		compile_status: (compilation && compilation.status) || null,
		certificate: (compilation && compilation.certificate) || null,
		last_modified_ms: lastModified,
	};
}

function summarize(sprintDirs: string[]) {
	const out = [];
	for (const dir of sprintDirs) {
		const s = sprintSummary(dir);
		if (s) out.push(s);
	}
	return out;
}

function findSprintFiles(targetDir: string) {
	const found = [];

	const direct = join(targetDir, "claims.json");
	if (fs.existsSync(direct)) {
		found.push({
			file: direct,
			dir: targetDir,
			name: basename(targetDir),
			cat: "root",
		});
	}

	const archiveDir = join(targetDir, "archive");
	try {
		if (fs.existsSync(archiveDir) && fs.statSync(archiveDir).isDirectory()) {
			for (const f of fs.readdirSync(archiveDir)) {
				if (f.endsWith(".json") && f.includes("claims")) {
					found.push({
						file: join(archiveDir, f),
						dir: archiveDir,
						name: f.replace(".json", "").replace(/-/g, " "),
						cat: "archive",
					});
				}
			}
		}
	} catch {
		// archive not readable — skip
	}

	try {
		const entries = fs.readdirSync(targetDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (
				entry.name.startsWith(".") ||
				entry.name === "archive" ||
				entry.name === "node_modules"
			) {
				continue;
			}
			const childDir = join(targetDir, entry.name);
			const childClaims = join(childDir, "claims.json");
			if (fs.existsSync(childClaims)) {
				found.push({
					file: childClaims,
					dir: childDir,
					name: entry.name,
					cat: "active",
				});
			}
			try {
				const subs = fs.readdirSync(childDir, { withFileTypes: true });
				for (const sub of subs) {
					if (!sub.isDirectory()) continue;
					if (sub.name.startsWith(".")) continue;
					const subDir = join(childDir, sub.name);
					const subClaims = join(subDir, "claims.json");
					if (fs.existsSync(subClaims)) {
						found.push({
							file: subClaims,
							dir: subDir,
							name: sub.name,
							cat: "active",
						});
					}
				}
			} catch {
				// child dir not readable — skip
			}
		}
	} catch {
		// targetDir not readable — return what we have
	}

	return found;
}

export = {
	loadSprintClaims,
	loadSprintCompilation,
	sprintSummary,
	summarize,
	findSprintFiles,
};
