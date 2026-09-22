/** Import active findings from a document, not a ledger restore. */
import crypto from "node:crypto";
import path from "node:path";
import { atomicWriteJSON } from "../../shared/lib/atomic.js";
import { withFileTransaction } from "../../shared/lib/transaction.js";
import { loadClaims } from "./load-claims.js";
import { VALID_TYPES } from "./claims-ops.js";

export function importClaims(dir, { source, claims }) {
	try {
		if (typeof source !== "string" || !source.trim() || !Array.isArray(claims))
			throw new Error(
				"source (stable document URL/identifier) and claims array are required.",
			);
		const ids = new Set();
		for (const c of claims) {
			if (
				!c ||
				typeof c.id !== "string" ||
				!c.id.trim() ||
				ids.has(c.id) ||
				!VALID_TYPES.includes(c.type) ||
				typeof c.topic !== "string" ||
				!c.topic.trim() ||
				typeof c.content !== "string" ||
				!c.content.trim() ||
				(c.tags !== undefined &&
					(!Array.isArray(c.tags) ||
						c.tags.some((tag) => typeof tag !== "string"))) ||
				(c.status !== undefined &&
					![
						"active",
						"superseded",
						"conflicted",
						"resolved",
						"archived",
					].includes(c.status)) ||
				(c.conflicts_with !== undefined &&
					(!Array.isArray(c.conflicts_with) ||
						c.conflicts_with.some((id) => typeof id !== "string")))
			)
				throw new Error("Invalid source claim or duplicate source ID.");
			ids.add(c.id);
		}
		const active = claims.filter(
			(c) =>
				c.status === undefined ||
				c.status === "active" ||
				c.status === "conflicted",
		);
		const idMap = Object.fromEntries(
			active.map((c) => [
				c.id,
				`imp-${crypto
					.createHash("sha256")
					.update(JSON.stringify([source, c.id]))
					.digest("hex")
					.slice(0, 24)}`,
			]),
		);
		return withFileTransaction(path.join(dir, "claims.json"), () => {
			const { data, errors } = loadClaims(dir);
			if (!data)
				throw new Error(
					errors[0]?.message || "Initialize the destination sprint first.",
				);
			const additions = [];
			let existing = 0;
			for (const c of active) {
				const fingerprint = crypto
					.createHash("sha256")
					.update(JSON.stringify(c))
					.digest("hex");
				const prior = data.claims.find((old) => old.id === idMap[c.id]);
				if (prior) {
					if (prior.source?.import_fingerprint !== fingerprint)
						throw new Error(
							`Source claim ${c.id} changed; record a reviewed correction instead of overwriting.`,
						);
					existing++;
					continue; // Never resurrect a locally superseded record.
				}
				const missing = (c.conflicts_with || []).filter(
					(id) =>
						!Object.hasOwn(idMap, id) &&
						!claims.some((other) => other.id === id),
				);
				if (missing.length)
					throw new Error(
						`Missing conflict targets for ${c.id}: ${missing.join(", ")}`,
					);
				additions.push({
					id: idMap[c.id],
					type: c.type,
					topic: c.topic,
					content: c.content,
					evidence: "stated",
					status: "active",
					resolved_by: null,
					timestamp: new Date().toISOString(),
					phase_added: data.meta?.phase || "research",
					tags: c.tags || [],
					conflicts_with: (c.conflicts_with || [])
						.filter((id) => Object.hasOwn(idMap, id))
						.map((id) => idMap[id]),
					source: {
						origin: source,
						artifact: source,
						connector: null,
						imported_claim_id: c.id,
						imported_status: c.status || "active",
						imported_evidence: c.evidence ?? null,
						imported_source: c.source ?? null,
						imported_timestamp: c.timestamp ?? null,
						import_fingerprint: fingerprint,
					},
				});
			}
			if (additions.length) {
				data.claims.push(...additions);
				atomicWriteJSON(path.join(dir, "claims.json"), data, 2);
			}
			return {
				status: "ok",
				imported: additions.length,
				existing,
				skipped_inactive: claims.length - active.length,
				id_map: idMap,
				mode: "active-findings",
			};
		});
	} catch (error) {
		return { status: "error", message: error.message };
	}
}
