import type { Stats } from "node:fs";
export type UnknownRecord = Record<string, unknown>;
export interface SnapshotOptions {
	peer?: string | undefined;
	maximum?: number | undefined;
	links?: number | undefined;
	expected?: Stats | undefined;
}
export interface ScanOptions {
	exclude?: string[] | undefined;
	peer?: string | undefined;
	ignoreOwner?: boolean | undefined;
}
export interface InventoryEntry {
	path: string;
	kind: "file" | "directory";
	mode: number;
	bytes?: number | undefined;
	sha256?: string | undefined;
}
export type Inventory = InventoryEntry[];
export interface ConfigSource {
	path: string;
	section: string;
	sha256: string | null;
}
export interface BaseOperation extends UnknownRecord {
	destination: string;
	destination_inventory: Inventory | null;
	source?: string | null | undefined;
	sources?: ConfigSource[] | undefined;
	manifest?: { path: string; inventory: Inventory } | undefined;
	copy_inventory?: Inventory | undefined;
}
export interface ConfigOperation extends BaseOperation {
	kind: "config";
	sources: ConfigSource[];
	output_mode: number;
	output_sha256: string;
}
export interface TreeOperation extends BaseOperation {
	kind: "evidence" | "runtime" | "memory" | "cache";
	source: string | null;
	source_inventory: Inventory | null;
	copy_inventory: Inventory;
	exclude?: string[] | undefined;
	manifest?: { path: string; inventory: Inventory } | undefined;
	legacy_remote?: { path: string; sha256: string | null }[] | undefined;
}
export type MigrationOperation = ConfigOperation | TreeOperation;
export interface MigrationPlan extends UnknownRecord {
	schema: string;
	converter_version: string;
	project: string;
	operations: MigrationOperation[];
	previous_marker_inventory: Inventory | null;
	conditions: UnknownRecord;
	plan_sha256: string;
}
export interface TransitionRecord {
	target: string;
	before: Inventory | null;
	after: Inventory;
	state: string;
}
export interface JournalOperation {
	state: string;
	inventory: Inventory;
	backup_inventory: Inventory | null;
	token?: string | undefined;
	inode?: number | undefined;
	retired_path?: string | undefined;
	rollback?: { phase: string; inventory: Inventory | null } | undefined;
}
export interface MigrationJournal extends UnknownRecord {
	schema: string;
	transaction: string;
	transaction_directory: string;
	plan: MigrationPlan;
	state: string;
	marker_inventory: Inventory | null;
	marker_transition?: string | undefined;
	transitions: Record<string, TransitionRecord>;
	operations: JournalOperation[];
}
export interface LockOwner extends UnknownRecord {
	schema: string;
	pid: number;
	host: string;
	project: string;
	transaction: string;
	plan_sha256: string;
	token: string;
	lock_path: string;
	owner_file: string;
}
export interface InspectOptions {
	project?: unknown;
	memorySource?: unknown;
	memoryDestination?: unknown;
	cacheSource?: unknown;
	cacheDestination?: unknown;
}
export interface RecoveryOptions {
	quiesced?: boolean | undefined;
	recoverLocks?: boolean | undefined;
	recoverTransaction?: string | undefined;
	interruptAfterStage?: boolean | undefined;
}
export interface MigrationFailure extends NodeJS.ErrnoException {
	transaction_directory?: string | undefined;
}
export interface LegacyRun extends UnknownRecord {
	verification?: UnknownRecord | undefined;
	budget?: UnknownRecord | undefined;
	oracles?: Record<string, UnknownRecord> | undefined;
	evidence_bar?: UnknownRecord | undefined;
	mutation_policy?: UnknownRecord | undefined;
}
export interface LegacyMemoryDocument extends UnknownRecord {
	meta?: UnknownRecord | undefined;
	claims?: UnknownRecord[] | undefined;
	seedClaims?: UnknownRecord[] | undefined;
}
export interface PlanDraft extends UnknownRecord {
	schema: string;
	converter_version: string;
	project: string;
	operations: MigrationOperation[];
	previous_marker_inventory: Inventory | null;
	conditions: UnknownRecord;
	plan_sha256?: string | undefined;
}
export interface ConverterOptions
	extends Record<string, string | boolean | undefined> {
	"--project"?: string;
	"--memory-source"?: string;
	"--memory-destination"?: string;
	"--cache-source"?: string;
	"--cache-destination"?: string;
	"--out"?: string;
	"--plan"?: string;
	"--transaction"?: string;
	"--recover-transaction"?: string;
	"--quiesced"?: boolean;
	"--recover-locks"?: boolean;
}
export interface RemoteDestination extends UnknownRecord {
	site: string;
	space: string;
	pageId: string;
}
export interface RemotePage extends UnknownRecord {
	id: string;
	version: number;
	title: string;
	body: string;
	labels: string[];
}
export interface InventoryPage extends UnknownRecord {
	pageId: string;
	format: string;
	source_relative_path?: string | undefined;
	site?: string | undefined;
	space?: string | undefined;
	role?: string | undefined;
	scope?: string[] | UnknownRecord | undefined;
	source_reference?: UnknownRecord | undefined;
}
export interface SelectedPage extends RemoteDestination {
	format: string;
	inventory?: InventoryPage | undefined;
	sourceId?: string | undefined;
}
export interface RemoteUpdate extends RemoteDestination {
	expected_version: number;
	version: number;
	title: string;
	labels: string[];
	body: string;
}
export interface RemoteAdapter {
	read(destination: RemoteDestination): Promise<RemotePage>;
	update?(request: RemoteUpdate): Promise<{ id: string; version: number }>;
}
export interface PageSnapshot {
	version: number;
	title: string;
	body_sha256: string;
	labels: string[];
}
export interface RemoteEntry {
	destination: RemoteDestination;
	format: string;
	inventory?: InventoryPage | undefined;
	inventory_sha256?: string | undefined;
	sourceId?: string | undefined;
	before: PageSnapshot;
	after: PageSnapshot & { body: string };
	noop: boolean;
}
export interface RemotePlan extends UnknownRecord {
	schema: string;
	entries: RemoteEntry[];
	id: string;
}
export interface ReceiptPage {
	destination: RemoteDestination;
	format: string;
	inventory_sha256?: string | undefined;
	sourceId?: string | undefined;
	state: string;
}
export interface RemoteReceipt extends UnknownRecord {
	schema: string;
	plan_id: string;
	pages: ReceiptPage[];
	events: { index: number; state: string; at: string }[];
}
export interface FileSnapshot {
	bytes: Buffer;
	sha256: string;
}
export interface SourceRecord extends UnknownRecord {
	source_relative_path?: string | undefined;
	state?: unknown;
}
export interface RemoteMarker extends UnknownRecord {
	schema: string;
	state: string;
	ambiguity?: boolean | undefined;
	pages: InventoryPage[];
	sync_sources?: SourceRecord[] | undefined;
	legacy_config_sources?: SourceRecord[] | undefined;
}
export interface RemoteMapping extends RemoteDestination {
	source_sha256: string;
	sourceId: string;
	role: string;
	format: string;
	inventory?: InventoryPage | undefined;
	inventory_sha256?: string | undefined;
	supplemental?: boolean | undefined;
	scope?: string[] | undefined;
	reason?: string | undefined;
	evidence?: string[] | undefined;
}
export interface NotConfigured {
	source_sha256: string;
	reason: string;
	evidence: string[];
}
export interface InventoryResolutionOptions {
	markerFile: string;
	expectedMarkerSha256: string;
	completeInventory?: boolean | undefined;
	mappings?: RemoteMapping[] | undefined;
	notConfigured?: NotConfigured[] | undefined;
	reason: string;
	evidence?: string[] | undefined;
}

export interface MigrationResult {
	status: string;
	transaction_directory: string;
	idempotent?: boolean;
	source_removal?: boolean;
	source_bytes_preserved?: boolean;
	enrollment?: string;
	remote?: string;
	retained_paths?: string[];
}

export interface RollbackResult {
	status: string;
	idempotent?: boolean;
	retained_copy?: string;
	retained_paths?: string[];
	originals_preserved?: boolean;
}
