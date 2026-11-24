/**
 * Shared helpers for exports format converters.
 *
 * Only genuinely-duplicated utilities live here. Format-specific escapers
 * (XML, SQL, YAML, CSV, BibTeX, DOT-id, etc.) intentionally remain co-located
 * with their converters because their escape semantics differ.
 *
 * Zero dependencies — pure functions only.
 */

/** Treat arbitrary claim/metadata strings as text in Markdown exports.
 * Escaping HTML prevents raw elements; consumer renderers still own URL and
 * plugin policies. This returns a copy and never changes the evidence ledger.
 */
export function escapeMarkdownData<T>(value: T): T {
	if (typeof value === "string")
		return value
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;") as T;
	if (Array.isArray(value)) return value.map(escapeMarkdownData) as T;
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				escapeMarkdownData(item),
			]),
		) as T;
	return value;
}
