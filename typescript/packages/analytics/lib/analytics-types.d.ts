export interface AnalysisClaim {
	[key: string]: unknown;
	id?: string;
	type?: string;
	evidence?: string | { tier?: string };
	evidence_tier?: string;
	status?: string;
	topic?: string;
	content?: string;
	text?: string;
	claim?: string;
	description?: string;
	tags?: string[];
	created?: string;
	timestamp?: string;
	date?: string;
	updated_at?: string;
	confidence?: number | string | null;
	source?:
		| {
				origin?: string;
				artifact?: string;
				witnessed_claim?: string;
				relationship?: string;
		  }
		| string;
	calibration?: {
		prediction_id: string;
		verdict: string;
		outcome?: unknown;
		delta?: number;
	};
	references?: string[];
	refs?: string[];
	outcome?: unknown;
	actual?: unknown;
	accurate?: boolean | null;
	delta?: number | null;
}
export interface GitEntry {
	hash?: string;
	date?: string;
	message: string;
}
export interface AnalysisSprint {
	name: string;
	dir?: string;
	claims: AnalysisClaim[];
	compilation?: {
		[key: string]: unknown;
		claims?: AnalysisClaim[];
		tokenUsage?: TokenUsage;
		meta?: { tokenUsage?: TokenUsage };
	} | null;
	tokenUsage?: TokenUsage;
	gitLog?: GitEntry[] | null;
}
export interface TokenPricing {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}
export interface TokenUsage {
	[key: string]: unknown;
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
	model?: string;
	total_cost_usd?: number;
	timestamp?: string;
	sprint?: string;
	claims_count?: number;
	verified_claims_count?: number;
	phase?: string;
}

export interface ScoredEstimate {
	estimateId: string | undefined;
	calibrationId: string | undefined;
	sprint: string;
	estimateText: string | undefined;
	outcomeText: string | undefined;
	estimateConfidence: number | string | null;
	actualOutcome: unknown;
	accurate: boolean | null;
	verdict: string;
	delta: number | null;
}
export interface CalibrationCurve {
	bins: { predicted: number; actual: number | null; count: number }[];
	bias: string | null;
}
export interface CostTrend {
	direction: string;
	changePercent: number | null;
	firstHalfAvg: number;
	secondHalfAvg: number;
}
export interface TokenReport {
	summary: {
		totalCostUsd?: number;
		costPerVerifiedClaim?: number | null;
		avgCostPerSprint?: number | null;
	};
	costTrend?: CostTrend | null;
}
export interface PhaseTiming {
	count: number;
	firstDate: string | null;
	lastDate: string | null;
}
export interface VelocityRow {
	sprint: string;
	durationDays: number | null;
	claimsPerDay: number | null;
	phases: Record<string, PhaseTiming>;
	stalls: {
		afterDate?: string | undefined;
		beforeDate?: string | undefined;
		gapDays: number;
	}[];
}
export interface Pattern {
	sprint: string;
	pattern: string;
	description: string;
	severity?: string;
}
export interface ArchetypeStats {
	totalClaims: number;
	challengeCount: number;
	types: Record<string, number>;
	evidenceTier: {
		stated: number;
		web: number;
		documented: number;
		tested: number;
		production: number;
	};
	avgClaimsPerSprint: number;
	topicCount: number;
}
