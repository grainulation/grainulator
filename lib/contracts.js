// Generated from typescript/lib/contracts.ts; edit that source and run npm run build:types.
/** Shared contracts for checked core modules. External JSON remains unknown until validated. */
export const CLAIM_TYPES = Object.freeze([
	"constraint",
	"factual",
	"estimate",
	"risk",
	"recommendation",
	"feedback",
]);
export function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function isClaimType(value) {
	return CLAIM_TYPES.some((type) => type === value);
}
export function isStringArray(value) {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}
