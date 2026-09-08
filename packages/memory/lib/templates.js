/**
 * templates.js — Sprint template management
 *
 * Templates are pre-built research questions with seeded claims.
 * A template contains: question, audience, constraints, and starter claims.
 */

import fs from "node:fs";
import path from "node:path";
import { Store } from "./store.js";

export class Templates {
	constructor(store) {
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
	save(name, template) {
		return this.store._transaction(() => {
			const id = this._slugify(name);
			const entry = {
				id,
				name,
				...template,
				savedAt: new Date().toISOString(),
			};
			const filePath = path.join(this.store.templatesDir, `${id}.json`);
			const tmp1 = filePath + ".tmp." + process.pid;
			fs.writeFileSync(tmp1, JSON.stringify(entry, null, 2) + "\n", "utf-8");
			fs.renameSync(tmp1, filePath);

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
	get(nameOrId) {
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
					const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
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
			.filter(Boolean);
	}

	/**
	 * Instantiate a template into a sprint directory.
	 * Creates claims.json with seed claims and a sprint config stub.
	 *
	 * @param {string} nameOrId - Template name/id
	 * @param {string} targetDir - Directory to instantiate into
	 */
	instantiate(nameOrId, targetDir) {
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
		const tmpClaims = claimsPath + ".tmp." + process.pid;
		fs.writeFileSync(
			tmpClaims,
			JSON.stringify(claims, null, 2) + "\n",
			"utf-8",
		);
		fs.renameSync(tmpClaims, claimsPath);

		// Write sprint config stub
		const configPath = path.join(targetDir, "sprint.json");
		const config = {
			question: template.question,
			audience: template.audience,
			constraints: template.constraints || [],
			fromTemplate: template.id,
			createdAt: new Date().toISOString(),
		};
		const tmpConfig = configPath + ".tmp." + process.pid;
		fs.writeFileSync(
			tmpConfig,
			JSON.stringify(config, null, 2) + "\n",
			"utf-8",
		);
		fs.renameSync(tmpConfig, configPath);

		return {
			claimsFile: claimsPath,
			configFile: configPath,
			seedClaims: claims.length,
		};
	}

	_slugify(str) {
		return str
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}
}
