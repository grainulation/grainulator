export interface Sprint {
	[key: string]: unknown;
	path: string;
	name?: string;
	model?: string;
	question?: string;
	title?: string;
	status?: string | undefined;
	assigned_to?: string;
	depends_on?: string[];
	priority?: number;
	deadline?: string;
	category?: string;
	tags?: string[];
	audience?: string[];
	done?: string;
	constraints?: string[];
}
export interface Weights {
	claim_count: number;
	evidence_quality: number;
	compilation_bonus: number;
	category_bonus: number;
}
export interface HackathonConfig {
	time_limit: number;
	categories: string[];
	judging_weights: Weights;
}
export interface Portfolio {
	[key: string]: unknown;
	sprints: Sprint[];
	settings?: { [key: string]: unknown; sync_interval?: string };
	hackathon?: Partial<Omit<HackathonConfig, "judging_weights">> & {
		judging_weights?: Partial<Weights>;
	};
}
export interface SprintState {
	exists: boolean;
	claimsCount: number;
	hasCompilation: boolean;
	lastModified: Date | null;
	status: string;
}
export interface ConflictClaim {
	[key: string]: unknown;
	_source: string;
	id?: string;
	type?: string;
	topic?: string;
	content?: string;
	text?: string;
	tags?: string[];
	evidence?: string;
	conflicts_with?: string[];
}
export type Severity = "critical" | "warning" | "info";
export interface CrossConflict {
	severity: Severity;
	type: string;
	reason: string;
	claimA: ConflictClaim;
	claimB: ConflictClaim;
	tag: string;
	actions: string[];
}
export interface DecomposeOptions {
	maxSprints?: number;
	prefix?: string;
	minFacets?: number;
}
export interface Team {
	name: string;
	sprintPath: string;
	joinedAt?: string;
}
export interface HackathonState {
	name: string;
	startTime: string;
	endTime: string;
	durationMinutes: number;
	categories: string[];
	judging_weights: Weights;
	teams: Team[];
	status: string;
	endedAt?: string;
}
