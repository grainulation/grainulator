/**
 * memory -> analytics edge: cross-library analytics.
 *
 * Feeds memory's stored claim collections to analytics's analyzer
 * to surface patterns, evidence quality trends, and type distribution
 * across the entire knowledge base. Uses the bundled private analytics component.
 */

import { analyze } from "../../analytics/lib/analyzer.js";
import type { Store } from "./store.js";

/**
 * Run cross-library analytics on all stored claim collections.
 * @param {import('./store').Store} store — an initialized memory Store instance
 * @returns {Promise<{ available: boolean, analysis?: object, collectionCount?: number }>}
 */
export async function analyzeLibrary(store: Pick<Store, "list" | "getClaims">) {
	const collections = store.list();
	if (collections.length === 0) {
		return {
			available: true,
			analysis: null,
			collectionCount: 0,
			reason: "no collections stored",
		};
	}

	// Convert memory collections into the sprint format analytics expects
	const sprints = [];
	for (const entry of collections) {
		const data = store.getClaims(entry.id);
		if (!data || !data.claims) continue;
		sprints.push({
			name: entry.name || entry.id,
			claims: data.claims,
		});
	}

	if (sprints.length === 0) {
		return {
			available: true,
			analysis: null,
			collectionCount: 0,
			reason: "no valid claim data",
		};
	}

	const analysis = analyze(sprints);
	return {
		available: true,
		collectionCount: sprints.length,
		analysis,
	};
}
