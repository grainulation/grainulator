export interface EvidenceSource {
	[key: string]: unknown;
	origin?: string;
	artifact?: string;
	urls?: string[];
	url?: string;
	title?: string;
}
export interface ClaimEvidence {
	[key: string]: unknown;
	tier?: string;
	source?: unknown;
}
export interface ExportClaim {
	[key: string]: unknown;
	id?: string;
	type?: string;
	topic?: string;
	content?: string;
	text?: string;
	description?: string;
	status?: string;
	evidence?: string | ClaimEvidence;
	evidence_tier?: string;
	confidence?: number | null;
	source?: string | EvidenceSource | null;
	sources?: unknown;
	provenance?: unknown;
	verified_by?: unknown;
	verification?: unknown;
	tags?: string[];
	created?: string;
	timestamp?: string;
	conflicts_with?: string[];
}
export interface ExportMeta {
	[key: string]: unknown;
	sprint?: string;
	question?: string;
	audience?: string | string[];
	url?: string;
}
export interface ExportCertificate {
	[key: string]: unknown;
	sha256?: string;
	claim_count?: number;
	compiled_at?: string;
	input_hash?: string;
}
export interface ExportConflict {
	[key: string]: unknown;
	ids?: string[];
	reason?: string;
	description?: string;
	resolution?: string;
}
export interface CompilerConflict extends ExportConflict {
	claimA?: string;
	claimB?: string;
	winner?: string;
	loser?: string;
}
export interface ExportDocument {
	[key: string]: unknown;
	claims?: ExportClaim[];
	resolved_claims?: ExportClaim[];
	meta?: ExportMeta;
	sprint_meta?: ExportMeta;
	certificate?: ExportCertificate;
	compilation_certificate?: ExportCertificate;
	conflicts?: ExportConflict[];
	conflict_graph?:
		| ExportConflict[]
		| { unresolved?: CompilerConflict[]; resolved?: CompilerConflict[] };
}
export interface NormalizedDocument extends ExportDocument {
	claims: ExportClaim[];
	meta: ExportMeta;
	conflicts: ExportConflict[];
	certificate: ExportCertificate;
}
export interface FileExportResult {
	outputPath?: string;
	message: string;
	format?: string;
	file?: string;
	bytes?: number;
}
export interface ExportFormat {
	name: string;
	extension?: string;
	mimeType?: string;
	description?: string;
	convert?: (document: ExportDocument) => string;
	export: (
		inputPath: string,
		outputPath?: string | null,
	) => Promise<FileExportResult>;
}

export interface AdfMark {
	type: string;
	attrs?: Record<string, string>;
}
export interface AdfNode {
	type: string;
	text?: string;
	content?: AdfNode[];
	marks?: AdfMark[];
	attrs?: Record<string, unknown>;
}
export interface ExportToolArgs {
	format?: string | undefined;
	source?: string | undefined;
	output?: string | undefined;
	lines?: number | undefined;
	workspace?: string | undefined;
}

export interface DiscoveredFormat {
	id: string;
	name: string;
	extension: string;
	mimeType: string;
	description: string;
	convert?: ((document: ExportDocument) => string) | undefined;
}
export interface HtmlNode {
	text?: string;
	name?: string;
	attrs: Record<string, string>;
	children: HtmlNode[];
	close?: boolean;
	selfClosing?: boolean;
}
