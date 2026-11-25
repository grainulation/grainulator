export type UnknownRecord = Record<string, unknown>;
export interface CommandOptions {
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	input?: string | Buffer | undefined;
	timeout?: number | undefined;
}
export interface ToolDescriptor extends UnknownRecord {
	name: string;
	description?: string;
	inputSchema?: UnknownRecord;
	outputSchema?: UnknownRecord;
	annotations: Record<string, boolean>;
}
export interface ToolResult extends UnknownRecord {
	status: string;
	message?: string;
	count: number;
	claimCount: number;
	output: string;
	preview: string;
	directory: string;
	next_actions: { auto: unknown[]; manual: unknown[] };
	artifacts: { file: string; format: string; bytes: number }[];
	collections: unknown[];
	collection_count: number;
	pack_count: number;
}
export interface TextBlock {
	type: string;
	text?: string;
}
export interface ToolEnvelope extends UnknownRecord {
	isError?: boolean;
	content: TextBlock[];
	structuredContent?: ToolResult;
}
export interface ResourceContent {
	uri: string;
	mimeType?: string;
	text: string;
}
export interface MCPMethods {
	initialize: {
		protocolVersion: string;
		serverInfo: { name: string; version: string };
		capabilities: UnknownRecord;
	};
	"tools/list": { tools: ToolDescriptor[] };
	"tools/call": ToolEnvelope;
	"resources/list": {
		resources: { uri: string; name?: string; mimeType?: string }[];
	};
	"resources/read": { contents: ResourceContent[] };
}
export type MCPMethodResult<K extends string> = K extends keyof MCPMethods
	? MCPMethods[K]
	: UnknownRecord;
export interface MCPClient {
	request<K extends string>(
		method: K,
		params?: UnknownRecord,
	): Promise<MCPMethodResult<K>>;
	notify(method: string, params?: UnknownRecord): void;
	close(): Promise<void>;
}
export interface TokenUsage extends UnknownRecord {
	input_tokens: number;
	output_tokens: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
}
export interface MCPServerConfig {
	command: string;
	args: string[];
	enabledTools?: string[];
	env?: NodeJS.ProcessEnv;
}
export interface HostOptions {
	cwd?: string | undefined;
	model?: string | undefined;
	mcpConfig?: { mcpServers: Record<string, MCPServerConfig> } | undefined;
	sessionId?: string | null | undefined;
	resume?: boolean | undefined;
	hooks?: boolean | undefined;
	timeoutMs?: number | undefined;
	signal?: AbortSignal | undefined;
	log?: string | undefined;
}
export interface HostCall {
	host: string;
	model: string;
	durationMs: number;
	exitCode: number | null;
	failure: string | null;
	answer: string;
	usage: TokenUsage | null;
	costUsd: number | null;
	sessionId: string | null;
	toolCalls: UnknownRecord[];
	actualModels?: string[];
	permissionDenials?: unknown[];
}
export interface AuditReport extends UnknownRecord {
	at: string;
	passed: boolean;
	checks: string[];
	archive?: string;
	archiveBytes?: number;
	installed?: string;
	directory?: string;
	error?: string;
}
export interface ArchiveFile {
	bytes: Buffer;
	mode: number;
}
export type ArchiveFiles = Map<string, ArchiveFile>;
export interface ArtifactRecord {
	filename: string;
	sha256: string;
	bytes: number;
}
export interface BaseCandidate extends ArtifactRecord, UnknownRecord {
	schema: string;
	version: string;
	source_commit: string;
	build_id: string;
}
export interface NativeCandidate extends ArtifactRecord, UnknownRecord {
	target: string;
	source_commit: string;
	source_dirty: boolean;
	metadata_sha256: string;
}
export interface MigrationCandidate extends ArtifactRecord, UnknownRecord {
	schema: string;
	version: string;
	source_commit: string;
}
export interface ReleaseManifest {
	schema: string;
	version: string;
	source_commit: string;
	base: ArtifactRecord & { build_id: string };
	assets: (ArtifactRecord & { target: string; metadata_sha256: string })[];
	migration?: ArtifactRecord;
}
export interface AssembleOptions {
	baseRecord: string;
	assetRecords?: string[];
	migrationRecord?: string;
	out: string;
}
export interface VerifyOptions {
	directory: string;
	manifestSha256: string;
	version?: string | undefined;
	sourceCommit?: string | undefined;
}
export interface GHResult {
	status: number | null;
	stdout: string;
	error?: Error | undefined;
}
export type GHRunner = (argv: string[]) => GHResult;
export interface PublishOptions extends VerifyOptions {
	version: string;
	sourceCommit: string;
	tag: string;
	repository: string;
	run?: GHRunner;
}
export interface HostEvent extends UnknownRecord {
	type?: string;
	is_error?: boolean;
	result?: string;
	usage?: TokenUsage;
	total_cost_usd?: number;
	session_id?: string;
	thread_id?: string;
	modelUsage?: UnknownRecord;
	permission_denials?: unknown[];
	message?: { content?: UnknownRecord[] };
	item?: UnknownRecord & { type?: string; text?: string };
}

export interface NpmPack {
	filename: string;
	size: number;
	files: { path: string; size: number; mode: number }[];
}

export interface HostCheckResult extends Partial<HostCall> {
	host: string;
	model?: string | undefined;
	passed: boolean;
	error?: string;
	sessionId?: string | null;
	checks?: string[];
	first?: HostCall;
	continuation?: HostCall;
}
export interface HostCheckReport {
	at: string;
	directory: string;
	installed: string;
	results: HostCheckResult[];
	passed?: boolean;
}

export interface EvaluationArm {
	passed?: boolean;
	semantic?: boolean;
	format?: boolean;
	answer?: string;
	error?: string | null;
	status?: string;
	trace?: string;
	calls: HostCall[];
	durationMs: number;
	consumed?: unknown;
}
export interface EvaluationRow {
	host: string;
	model: string;
	task: string;
	family?: string;
	repetition?: number;
	baseline?: EvaluationArm;
	oneShot?: EvaluationArm;
	grainulator?: EvaluationArm;
}
export interface EvaluationReport extends UnknownRecord {
	at: string;
	results: EvaluationRow[];
	summary?: unknown;
	completed?: boolean;
	repetitions?: number;
	budget?: {
		tokenAdmissionBudgetPerArm?: number;
		maxCallsPerArm?: number;
		timeoutPerCallMs?: number;
		oneShotCalls?: number;
		grainulatorMaxCalls?: number;
	};
}

export interface NativeToolCall {
	status: string;
	error?: unknown;
	server: string;
	tool: string;
	result?: {
		isError?: boolean;
		is_error?: boolean;
		content?: { text: string }[];
	};
}
export interface AgentContent {
	type: string;
	name: string;
	id: string;
	tool_use_id: string;
	is_error?: boolean;
	input: { subagent_type?: string; dir?: string };
	content: string | { type: string; text: string }[];
	text: string;
}
export interface AgentEvent {
	message?: { content: AgentContent[] };
	parent_tool_use_id?: string;
}
