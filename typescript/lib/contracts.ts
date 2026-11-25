/** Shared contracts for checked core modules. External JSON remains unknown until validated. */
export const CLAIM_TYPES = Object.freeze([
	"constraint",
	"factual",
	"estimate",
	"risk",
	"recommendation",
	"feedback",
] as const);
export type ClaimType = (typeof CLAIM_TYPES)[number];
export type EvidenceTier =
	| "stated"
	| "web"
	| "documented"
	| "tested"
	| "production";
export type ClaimStatus =
	| "active"
	| "conflicted"
	| "superseded"
	| "refuted"
	| "rejected"
	| "resolved"
	| "reverted";

export interface ResearchClaim {
	id: string;
	type: ClaimType;
	topic: string;
	content: string;
	sources: string[];
	conflicts_with: string[];
}

export interface ClaimSource {
	origin: string;
	artifact?: string | null;
	connector?: string | null;
	urls?: string[];
}

export interface EvidenceClaim {
	id: string;
	type: ClaimType;
	topic: string;
	content: string;
	source: ClaimSource | string;
	evidence: EvidenceTier;
	status: ClaimStatus;
	phase_added: string;
	conflicts_with: string[];
	resolved_by: string | null;
	tags: string[];
}

export interface ClaimsDocument {
	schema_version: "1.0";
	meta: {
		question: string;
		audience: string[];
		phase: string;
		connectors: string[];
	};
	claims: EvidenceClaim[];
}

/** Minimum session projection needed for evidence analysis; no provider credentials belong here. */
export interface EvidenceSession {
	question: string;
	config: { provider: string };
	steps: { pass: string; text: string }[];
}

export interface ResearchEvidenceReport {
	claims: ResearchClaim[];
	factual: number;
	linked: number;
	conflicts: string[];
	issues: string[];
	passed: boolean;
}

/** Recorded provider output, distinct from evidence verification. */
export interface ProviderResult {
	text: string;
	model: string;
	sources: { url: string; title: string }[];
	usage: {
		inputTokens?: number | undefined;
		outputTokens?: number | undefined;
	};
}

export interface VerifierResult {
	passed: boolean;
	soundnessBreak: boolean;
	exitCode: number | null;
	feedback: string;
	failure: string | null;
	answerHash: string;
}

export interface CompilationDiagnostic {
	code: string;
	message: string;
	claims?: string[];
}

/** Common compilation projection; compiler-specific metrics remain outside this contract. */
export interface CompilationResult {
	compiler_version: string;
	status: string;
	errors: CompilationDiagnostic[];
	warnings: CompilationDiagnostic[];
	resolved_claims: EvidenceClaim[];
	compilation_certificate: {
		compiler_version: string;
		input_hash: string;
		passages_hash?: string;
	};
}

export type JsonType =
	| "string"
	| "number"
	| "integer"
	| "boolean"
	| "object"
	| "array"
	| "null";
export interface OutputSchema {
	type?: JsonType | JsonType[];
	description?: string;
	properties?: Record<string, OutputSchema>;
	items?: OutputSchema;
	required?: string[];
	additionalProperties?: boolean;
	enum?: unknown[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isClaimType(value: unknown): value is ClaimType {
	return CLAIM_TYPES.some((type) => type === value);
}

export function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.every((item: unknown) => typeof item === "string")
	);
}
