import { atomicWriteJSON } from "../../shared/lib/atomic.js";

/**
 * store.js — Local claim/template storage (filesystem-based)
 *
 * Memory is stored as JSON files with a local transaction lock for shared writers.
 * No database, no dependencies — just the filesystem.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withFileTransaction } from "../../shared/lib/transaction.js";

export interface MemoryClaim {
	id?: string | null;
	type?: string;
	topic?: string;
	content?: string;
	text?: string;
	evidence?: string;
	tier?: string;
	status?: string;
	phase_added?: string;
	timestamp?: string;
	created?: string;
	conflicts_with?: string[];
	resolved_by?: string | null;
	resolution?: unknown;
	tags?: string[];
	source?:
		| string
		| {
				origin?: string;
				artifact?: string | null;
				connector?: string | null;
				urls?: string[];
		  }
		| null;
}

export interface CollectionEntry {
	id: string;
	name: string;
	type?: string;
	claimCount: number;
	storedAt?: string;
	hash?: string;
}

export interface StoredClaims {
	meta?: Partial<CollectionEntry>;
	claims?: MemoryClaim[];
	_integrityWarning?: string;
}

interface StoreIndex {
	collections: CollectionEntry[];
}

export const DEFAULT_MEMORY_DIR = path.join(
	os.homedir(),
	".grainulator",
	"memory",
);

/** One resolver for CLI, MCP, and library callers. No legacy locations are probed. */
export function resolveMemoryDir(
	explicit?: string | null,
	{
		env = process.env,
		homeDir = os.homedir(),
	}: { env?: NodeJS.ProcessEnv; homeDir?: string } = {},
) {
	if (explicit) return path.resolve(explicit);
	if (env.GRAINULATOR_MEMORY_DIR)
		return path.resolve(env.GRAINULATOR_MEMORY_DIR);
	return path.join(homeDir, ".grainulator", "memory");
}

export class Store {
	declare root: string;
	declare claimsDir: string;
	declare templatesDir: string;
	declare packsDir: string;
	declare indexPath: string;

	constructor(explicit?: string | null) {
		const memoryDir = resolveMemoryDir(explicit);
		this.root = memoryDir;
		this.claimsDir = path.join(memoryDir, "claims");
		this.templatesDir = path.join(memoryDir, "templates");
		this.packsDir = path.join(memoryDir, "packs");
		this.indexPath = path.join(memoryDir, "index.json");
	}

	/** Create the store and its index under the same lock used by every writer. */
	init() {
		return this._transaction(() => this);
	}

	_transaction<T>(operation: () => T): T {
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
	storeClaims<T extends MemoryClaim>(
		name: string,
		claims: readonly T[],
		meta: object = {},
	) {
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
	getClaims(nameOrId: string): StoredClaims | null {
		const id = this._slugify(nameOrId);
		const filePath = path.join(this.claimsDir, `${id}.json`);
		if (!fs.existsSync(filePath)) return null;
		const data = this._readJSON(filePath) as StoredClaims;
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
			const index = this._readJSON(this.indexPath) as StoreIndex;
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
			() => (this._readJSON(this.indexPath) as StoreIndex).collections || [],
		);
	}

	/** Remove a collection by name/id. */
	remove(nameOrId: string) {
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

	_readJSON(filePath: string): unknown {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	_writeJSON(filePath: string, data: unknown) {
		atomicWriteJSON(filePath, data);
	}

	_hash(str: string) {
		return crypto.createHash("sha256").update(str).digest("hex");
	}

	_slugify(str: string) {
		return str
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}

	_addToIndex(entry: CollectionEntry) {
		return this._transaction(() => this._addToIndexUnlocked(entry));
	}

	_addToIndexUnlocked(entry: CollectionEntry) {
		const index = this._readJSON(this.indexPath) as StoreIndex;
		index.collections = index.collections.filter((c) => c.id !== entry.id);
		index.collections.push(entry);
		this._writeJSON(this.indexPath, index);
	}

	_removeFromIndex(id: string) {
		return this._transaction(() => this._removeFromIndexUnlocked(id));
	}

	_removeFromIndexUnlocked(id: string) {
		const index = this._readJSON(this.indexPath) as StoreIndex;
		index.collections = index.collections.filter((c) => c.id !== id);
		this._writeJSON(this.indexPath, index);
	}
}
