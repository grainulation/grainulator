import { atomicWriteJSON } from "../../shared/lib/atomic.js";
/**
 * templates.js — Sprint template management
 *
 * Templates are pre-built research questions with seeded claims.
 * A template contains: question, audience, constraints, and starter claims.
 */

import fs from "node:fs";
import path from "node:path";
import type { MemoryClaim } from "./store.js";
import { Store } from "./store.js";

interface TemplateInput {
	question?: string;
	audience?: string | string[];
	constraints?: string[];
	seedClaims?: MemoryClaim[];
	tags?: string[];
}

interface StoredTemplate extends TemplateInput {
	id: string;
	name: string;
	savedAt: string;
}

export class Templates {
	declare store: Store;

	constructor(store?: Store | null) {
		this.store = store || new Store();
	}

	/**
	 * Save a sprint configuration as a reusable template.
	 *
	 * @param {string} name - Template name
	 * @param {object} template
	 * @param {string} template.question - Research question
	 * @param {string} template.audience - Who this is for
	 * @param {string[]} template.constraints - Hard constraints
	 * @param {object[]} template.seedClaims - Claims to start with
	 * @param {string[]} template.tags - Searchable tags
	 */
	save<T extends TemplateInput>(name: string, template: T) {
		return this.store._transaction(() => {
			const id = this._slugify(name);
			const entry = {
				id,
				name,
				...template,
				savedAt: new Date().toISOString(),
			};
			const filePath = path.join(this.store.templatesDir, `${id}.json`);
			atomicWriteJSON(filePath, entry);

			this.store._addToIndexUnlocked({
				id,
				name,
				type: "template",
				claimCount: (template.seedClaims || []).length,
				storedAt: entry.savedAt,
			});

			return entry;
		});
	}

	/** Get a template by name/id. */
	get(nameOrId: string): StoredTemplate | null {
		const id = this._slugify(nameOrId);
		const filePath = path.join(this.store.templatesDir, `${id}.json`);
		if (!fs.existsSync(filePath)) return null;
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	}

	/** List all saved templates. */
	list() {
		this.store.init();
		const dir = this.store.templatesDir;
		if (!fs.existsSync(dir)) return [];

		return fs
			.readdirSync(dir)
			.filter((f) => f.endsWith(".json"))
			.map((f) => {
				try {
					const data: StoredTemplate = JSON.parse(
						fs.readFileSync(path.join(dir, f), "utf-8"),
					);
					return {
						id: data.id,
						name: data.name,
						question: data.question,
						seedClaims: (data.seedClaims || []).length,
						tags: data.tags || [],
					};
				} catch {
					return null;
				}
			})
			.filter((entry) => entry !== null);
	}

	/**
	 * Instantiate a template into a sprint directory.
	 * Creates claims.json with seed claims and a sprint config stub.
	 *
	 * @param {string} nameOrId - Template name/id
	 * @param {string} targetDir - Directory to instantiate into
	 */
	instantiate(nameOrId: string, targetDir: string) {
		const template = this.get(nameOrId);
		if (!template) {
			throw new Error(`Template "${nameOrId}" not found`);
		}

		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true });
		}

		// Write seed claims
		const claimsPath = path.join(targetDir, "claims.json");
		const claims = (template.seedClaims || []).map((c, i) => ({
			...c,
			id: c.id || `d${String(i + 1).padStart(3, "0")}`,
		}));
		atomicWriteJSON(claimsPath, claims);

		// Write sprint config stub
		const configPath = path.join(targetDir, "sprint.json");
		const config = {
			question: template.question,
			audience: template.audience,
			constraints: template.constraints || [],
			fromTemplate: template.id,
			createdAt: new Date().toISOString(),
		};
		atomicWriteJSON(configPath, config);

		return {
			claimsFile: claimsPath,
			configFile: configPath,
			seedClaims: claims.length,
		};
	}

	_slugify(str: string) {
		return str
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}
}
