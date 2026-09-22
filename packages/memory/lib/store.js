import { atomicWriteJSON } from "../../shared/lib/atomic.js";
/**
 * store.js — Local claim/template storage (filesystem-based)
 *
 * Memory is stored as JSON files with a local transaction lock for shared writers.
 * No database, no dependencies — just the filesystem.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { withFileTransaction } from "../../shared/lib/transaction.js";

export const DEFAULT_MEMORY_DIR = path.join(
	os.homedir(),
	".grainulator",
	"memory",
);
export const DEFAULT_SILO_DIR = path.join(os.homedir(), ".silo");

/** One resolver for CLI, MCP, and library callers. Existing legacy data stays usable. */
export function resolveMemoryDir(
	explicit,
	{ env = process.env, homeDir = os.homedir() } = {},
) {
	if (explicit) return path.resolve(explicit);
	if (env.GRAINULATOR_MEMORY_DIR)
		return path.resolve(env.GRAINULATOR_MEMORY_DIR);
	if (env.SILO_STORE) return path.resolve(env.SILO_STORE);
	const canonical = path.join(homeDir, ".grainulator", "memory");
	const legacy = path.join(homeDir, ".silo");
	if (
		!fs.existsSync(path.join(canonical, "index.json")) &&
		fs.existsSync(path.join(legacy, "index.json"))
	)
		return legacy;
	return canonical;
}

export class Store {
	constructor(siloDir) {
		siloDir = resolveMemoryDir(siloDir);
		this.root = siloDir;
		this.claimsDir = path.join(siloDir, "claims");
		this.templatesDir = path.join(siloDir, "templates");
		this.packsDir = path.join(siloDir, "packs");
		this.indexPath = path.join(siloDir, "index.json");
	}

	/** Create the store and its index under the same lock used by every writer. */
	init() {
		return this._transaction(() => this);
	}

	_transaction(operation) {
		for (const dir of [
			this.root,
			this.claimsDir,
			this.templatesDir,
			this.packsDir,
		])
			fs.mkdirSync(dir, { recursive: true });
		return withFileTransaction(this.indexPath, () => {
			if (!fs.existsSync(this.indexPath))
				this._writeJSON(this.indexPath, {
					version: 1,
					created: new Date().toISOString(),
					collections: [],
				});
			return operation();
		});
	}

	/** Store a collection of claims under a name. */
	storeClaims(name, claims, meta = {}) {
		return this._transaction(() => {
			const id = this._slugify(name);
			const entry = {
				...meta,
				sourceMeta: { ...meta },
				id,
				name,
				type: "claims",
				claimCount: claims.length,
				hash: this._hash(JSON.stringify(claims)),
				storedAt: new Date().toISOString(),
			};
			const filePath = path.join(this.claimsDir, `${id}.json`);
			this._writeJSON(filePath, { meta: entry, claims });
			this._addToIndexUnlocked(entry);
			return entry;
		});
	}

	/** Retrieve claims by collection name/id. Verifies integrity if hash exists. */
	getClaims(nameOrId) {
		const id = this._slugify(nameOrId);
		const filePath = path.join(this.claimsDir, `${id}.json`);
		if (!fs.existsSync(filePath)) return null;
		const data = this._readJSON(filePath);
		if (data.meta && data.meta.hash && data.claims) {
			const actual = this._hash(JSON.stringify(data.claims));
			// Support both old 12-char and new 64-char hashes
			if (data.meta.hash !== actual && !actual.startsWith(data.meta.hash)) {
				data._integrityWarning = `Hash mismatch: expected ${data.meta.hash.slice(0, 12)}..., got ${actual.slice(0, 12)}...`;
			}
		}
		return data;
	}

	/** Verify integrity of all stored collections. Returns array of {id, ok, warning?}. */
	verifyAll() {
		return this._transaction(() => {
			const results = [];
			const index = this._readJSON(this.indexPath);
			for (const entry of index.collections || []) {
				const data = this.getClaims(entry.id);
				if (!data) {
					results.push({
						id: entry.id,
						ok: false,
						warning: "Collection file missing",
					});
				} else {
					results.push({
						id: entry.id,
						ok: !data._integrityWarning,
						warning: data._integrityWarning || null,
					});
				}
			}
			return results;
		});
	}

	/** List all stored collections. */
	list() {
		return this._transaction(
			() => this._readJSON(this.indexPath).collections || [],
		);
	}

	/** Remove a collection by name/id. */
	remove(nameOrId) {
		return this._transaction(() => {
			const id = this._slugify(nameOrId);
			for (const dir of [this.claimsDir, this.templatesDir, this.packsDir]) {
				const filePath = path.join(dir, `${id}.json`);
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			}
			this._removeFromIndexUnlocked(id);
			return true;
		});
	}

	// --- Internal helpers ---

	_readJSON(filePath) {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	_writeJSON(filePath, data) {
		atomicWriteJSON(filePath, data);
	}

	_hash(str) {
		return crypto.createHash("sha256").update(str).digest("hex");
	}

	_slugify(str) {
		return str
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}

	_addToIndex(entry) {
		return this._transaction(() => this._addToIndexUnlocked(entry));
	}

	_addToIndexUnlocked(entry) {
		const index = this._readJSON(this.indexPath);
		index.collections = index.collections.filter((c) => c.id !== entry.id);
		index.collections.push(entry);
		this._writeJSON(this.indexPath, index);
	}

	_removeFromIndex(id) {
		return this._transaction(() => this._removeFromIndexUnlocked(id));
	}

	_removeFromIndexUnlocked(id) {
		const index = this._readJSON(this.indexPath);
		index.collections = index.collections.filter((c) => c.id !== id);
		this._writeJSON(this.indexPath, index);
	}
}
