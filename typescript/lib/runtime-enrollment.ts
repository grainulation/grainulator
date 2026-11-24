import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import projectConfig from "../packages/shared/lib/project-config.cjs";
import {
	assertNoSymlinkPath,
	currentTarget,
	NATIVE_TARGETS,
	readRegular,
	resolveRuntimeAsset,
	runtimeCache,
	runtimeVersion,
	sha256,
} from "./runtime-assets.js";

type Fields = Record<string, unknown>;
type HostSettings = {
	hooks?: { Stop?: { hooks: Fields[]; matcher?: string }[] };
};
type HashOptions = {
	expectedEnrollmentHash?: string | undefined;
	expectedSettingsHash?: string | undefined;
};
type Receipt = {
	schema: string;
	origin: string;
	policy: string;
	state: string;
	workspace: string;
	host?: string;
	hook_command?: string;
	settings_file?: string;
	asset_directory?: string;
	asset_version?: string;
	asset_target?: string;
	manifest_sha256?: string;
	checker_sha256?: string;
	ledger_sha256?: string;
	run_sha256?: string;
	settings_after_sha256?: string;
	settings_before_sha256?: string;
	enrollment_before_sha256?: string;
	transaction?: string;
	backup?: string;
};
const encode = (value: unknown) =>
	Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const object = (value: unknown): value is Fields =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);
function validateEnrollmentReceipt(
	receipt: Receipt,
	workspace: string,
	{
		host,
		settingsFile,
		prepared = false,
	}: {
		host?: string | undefined;
		settingsFile?: string | undefined;
		prepared?: boolean;
	} = {},
) {
	if (
		!object(receipt) ||
		receipt.schema !== "grainulator.runtime.enrollment.v1" ||
		!["new", "converted"].includes(receipt.origin) ||
		!["required", "not-managed"].includes(receipt.policy) ||
		![...(prepared ? ["prepared"] : []), "complete"].includes(receipt.state) ||
		receipt.workspace !== fs.realpathSync(workspace)
	) {
		throw new Error(
			"Enrollment receipt belongs to another workspace or needs explicit recovery",
		);
	}
	const bound =
		receipt.host !== undefined ||
		receipt.settings_file !== undefined ||
		receipt.hook_command !== undefined;
	if (receipt.policy === "required" || bound) {
		const digest = (value: unknown) =>
			typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
		const preimage = (value: unknown) => value === "absent" || digest(value);
		if (
			!["claude", "codex"].includes(receipt.host ?? "") ||
			typeof receipt.settings_file !== "string" ||
			!path.isAbsolute(receipt.settings_file) ||
			path.basename(receipt.settings_file) !==
				(receipt.host === "claude" ? "settings.json" : "hooks.json") ||
			typeof receipt.hook_command !== "string" ||
			!receipt.hook_command.includes("grainulator-runtime-hook") ||
			typeof receipt.asset_directory !== "string" ||
			!path.isAbsolute(receipt.asset_directory) ||
			typeof receipt.asset_version !== "string" ||
			!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(receipt.asset_version) ||
			!NATIVE_TARGETS.includes(receipt.asset_target ?? "") ||
			!digest(receipt.manifest_sha256) ||
			!digest(receipt.checker_sha256) ||
			!digest(receipt.ledger_sha256) ||
			!digest(receipt.run_sha256) ||
			!digest(receipt.settings_after_sha256) ||
			!preimage(receipt.settings_before_sha256) ||
			!preimage(receipt.enrollment_before_sha256) ||
			typeof receipt.transaction !== "string" ||
			!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
				receipt.transaction,
			) ||
			typeof receipt.backup !== "string" ||
			!path.isAbsolute(receipt.backup)
		) {
			throw new Error("Invalid owned host enrollment binding");
		}
		assertNoSymlinkPath(receipt.settings_file);
		const expectedCommand = `'${path.join(receipt.asset_directory, "grainulator-runtime-hook").replaceAll("'", "'\\''")}' --required`;
		if (
			receipt.hook_command !== expectedCommand ||
			path.dirname(assertNoSymlinkPath(receipt.backup)) !==
				path.join(runtimeDirectory(workspace), "host-backups")
		)
			throw new Error("Invalid owned native release or backup binding");
		if (
			(host && receipt.host !== host) ||
			(settingsFile && receipt.settings_file !== settingsFile)
		) {
			throw new Error(
				"One runtime workspace supports one host settings scope; the existing enrollment was preserved",
			);
		}
	}
	return receipt;
}
function validateHostSettings(settings: HostSettings) {
	if (
		!object(settings) ||
		(settings.hooks !== undefined && !object(settings.hooks)) ||
		(settings.hooks?.Stop !== undefined && !Array.isArray(settings.hooks.Stop))
	) {
		throw new Error("Malformed host hook settings; refusing a lossy rewrite");
	}
	for (const group of settings.hooks?.Stop || []) {
		if (
			!object(group) ||
			!Array.isArray(group.hooks) ||
			group.hooks.some((hook) => !object(hook))
		) {
			throw new Error(
				"Malformed host Stop hook group; refusing a lossy rewrite",
			);
		}
	}
	return settings;
}
function assertHostCohort(settings: HostSettings, owned: Receipt | null) {
	const native = (settings.hooks?.Stop || [])
		.flatMap((group) => group.hooks)
		.filter(
			(hook) =>
				typeof hook.command === "string" &&
				/grainulator-runtime-hook(?:['"\s]|$)/.test(hook.command),
		);
	if (owned?.policy === "required") {
		if (native.length !== 1 || native[0]!.command !== owned.hook_command) {
			throw new Error(
				"Owned host runtime cohort is missing, duplicated or shared; no settings were changed",
			);
		}
	} else if (native.length) {
		throw new Error(
			"Host already has a Grainulator runtime cohort; only one workspace per host settings scope is supported",
		);
	}
}
function decodeArchivedPayload(
	payload: unknown,
	digest: string | undefined,
	maximum: number,
	label: string,
) {
	if (digest === "absent") {
		if (payload !== null) throw new Error(`Invalid ${label} backup presence`);
		return null;
	}
	if (
		!/^[a-f0-9]{64}$/.test(digest || "") ||
		typeof payload !== "string" ||
		payload.length > Math.ceil(maximum / 3) * 4 ||
		payload.length % 4 !== 0 ||
		/[^A-Za-z0-9+/=]/.test(payload)
	) {
		throw new Error(`Invalid ${label} backup payload`);
	}
	const bytes = Buffer.from(payload, "base64");
	if (
		bytes.length > maximum ||
		bytes.toString("base64") !== payload ||
		sha256(bytes) !== digest
	) {
		throw new Error(`Invalid ${label} backup digest or size`);
	}
	return bytes;
}
export function runtimeDirectory(workspace: string) {
	const root = assertNoSymlinkPath(path.resolve(workspace));
	if (!fs.statSync(root).isDirectory())
		throw new Error("Runtime workspace must be an existing directory");
	return assertNoSymlinkPath(path.join(root, ".grainulator", "runtime"));
}
export function withRuntimeLock<T>(
	directory: string,
	operation: () => T,
	name = ".write.lock",
) {
	assertNoSymlinkPath(directory);
	if (name === ".write.lock") {
		const workspace = path.resolve(directory, "../..");
		projectConfig.assertMigrationReady(workspace, { workspace });
	}
	const lock = path.join(directory, name);
	const token = crypto.randomUUID();
	fs.mkdirSync(lock, { mode: 0o700 });
	try {
		fs.writeFileSync(
			path.join(lock, "owner.json"),
			encode({
				schema: "grainulator.runtime.lock.v1",
				pid: process.pid,
				token,
			}),
			{ flag: "wx", mode: 0o600 },
		);
		return operation();
	} finally {
		const owner = JSON.parse(
			readRegular(path.join(lock, "owner.json"), 8192).toString("utf8"),
		);
		if (owner.token === token) {
			fs.unlinkSync(path.join(lock, "owner.json"));
			fs.rmdirSync(lock);
		}
	}
}
export function atomicRuntimeJSON(
	file: string,
	value: unknown,
	expectedHash?: string,
) {
	assertNoSymlinkPath(file);
	if (expectedHash !== undefined) {
		const actual = fs.existsSync(file) ? sha256(readRegular(file)) : "absent";
		if (actual !== expectedHash)
			throw new Error(
				"Concurrent runtime modification; expected SHA-256 does not match",
			);
	}
	const temporary = path.join(
		path.dirname(file),
		`.write-${crypto.randomUUID()}`,
	);
	const fd = fs.openSync(temporary, "wx", 0o600);
	try {
		fs.writeFileSync(fd, encode(value));
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
	try {
		fs.renameSync(temporary, file);
	} finally {
		if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
	}
}
export function inspectRuntimeEnrollment(workspace: string) {
	try {
		const directory = runtimeDirectory(workspace);
		const receipt = JSON.parse(
			readRegular(path.join(directory, "enrollment.json"), 128 * 1024).toString(
				"utf8",
			),
		);
		if (
			receipt.schema !== "grainulator.runtime.enrollment.v1" ||
			!["required", "not-managed"].includes(receipt.policy) ||
			receipt.state !== "complete" ||
			receipt.workspace !== fs.realpathSync(workspace)
		)
			throw new Error("Invalid or incomplete runtime enrollment");
		return {
			status: "enrolled",
			policy: receipt.policy,
			state: receipt.state,
			origin: receipt.origin,
			asset_version: receipt.asset_version || null,
			live_host: "unknown",
		};
	} catch (caught) {
		const error = caught as NodeJS.ErrnoException;
		return {
			status: error.code === "ENOENT" ? "not-enrolled" : "invalid",
			live_host: "unknown",
			...(error.code === "ENOENT"
				? {}
				: { error: "Runtime enrollment is invalid or incomplete." }),
		};
	}
}
export function initializeRuntime(
	workspace: string,
	{
		notManaged = false,
		run = {},
	}: { notManaged?: boolean; run?: unknown } = {},
) {
	if (!object(run))
		throw new Error("Runtime run configuration must be an object");
	const directory = runtimeDirectory(workspace);
	if (fs.existsSync(directory))
		throw new Error(
			"Runtime state already exists; use the separate converter or explicit enrollment instead of reinitializing it",
		);
	fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
	const staging = fs.mkdtempSync(
		path.join(path.dirname(directory), ".runtime-init-"),
	);
	try {
		const origin = {
			schema: "grainulator.runtime.origin.v1",
			origin: "new",
			created_at: new Date().toISOString(),
		};
		fs.writeFileSync(path.join(staging, "origin.json"), encode(origin), {
			flag: "wx",
			mode: 0o600,
		});
		if (notManaged) {
			fs.writeFileSync(
				path.join(staging, "enrollment.json"),
				encode({
					schema: "grainulator.runtime.enrollment.v1",
					state: "complete",
					origin: "new",
					policy: "not-managed",
					workspace: fs.realpathSync(workspace),
				}),
				{ flag: "wx", mode: 0o600 },
			);
		} else {
			validateRun(run);
			fs.writeFileSync(
				path.join(staging, "claims.json"),
				encode({ schema: "grainulator.runtime.claims.v1", claims: [] }),
				{ flag: "wx", mode: 0o600 },
			);
			fs.writeFileSync(
				path.join(staging, "run.json"),
				encode({
					evidence_bar: {
						load_bearing: "tested",
						recommendation: "documented",
					},
					budget: { max_rounds: 6 },
					verification: { mode: "strict" },
					oracles: {},
					...run,
				}),
				{ flag: "wx", mode: 0o600 },
			);
		}
		fs.mkdirSync(directory, { mode: 0o700 });
		try {
			fs.renameSync(staging, directory);
		} catch (error) {
			fs.rmdirSync(directory);
			throw error;
		}
		return {
			schema: "grainulator.runtime.init.v1",
			directory,
			policy: notManaged ? "not-managed" : "not-enrolled",
			host_settings_changed: false,
		};
	} finally {
		if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
	}
}
export function validateRun(run: unknown) {
	if (!object(run))
		throw new Error("Runtime run configuration must be an object");
	if (
		run.verification !== undefined &&
		(!object(run.verification) ||
			!["compat", "advisory", "strict"].includes(
				run.verification.mode as string,
			))
	)
		throw new Error("Invalid runtime verification mode");
	if (
		run.budget !== undefined &&
		(!object(run.budget) ||
			(run.budget.max_rounds !== undefined &&
				(typeof run.budget.max_rounds !== "number" ||
					!Number.isInteger(run.budget.max_rounds) ||
					run.budget.max_rounds < 1)))
	)
		throw new Error("Invalid runtime budget");
	if (run.oracles !== undefined && !object(run.oracles))
		throw new Error("Runtime oracles must be an object");
	for (const [id, oracle] of Object.entries(run.oracles || {}))
		if (
			!safeId(id) ||
			!object(oracle) ||
			!Array.isArray(oracle.cmd) ||
			!oracle.cmd.length ||
			!oracle.cmd.every(
				(item) => typeof item === "string" && item.length > 0,
			) ||
			(oracle.inputs !== undefined &&
				(!Array.isArray(oracle.inputs) ||
					!oracle.inputs.every((item) => typeof item === "string")))
		)
			throw new Error("Invalid runtime oracle declaration");
}
export const safeId = (id: unknown): id is string =>
	typeof id === "string" &&
	/^[A-Za-z0-9._-]{1,128}$/.test(id) &&
	id !== "." &&
	id !== "..";
export function validateClaim(
	claim: unknown,
): asserts claim is Fields & { id: string } {
	if (
		!object(claim) ||
		!safeId(claim.id) ||
		![
			"constraint",
			"factual",
			"estimate",
			"risk",
			"recommendation",
			"feedback",
		].includes(claim.type as string) ||
		typeof claim.topic !== "string" ||
		!claim.topic.trim() ||
		(claim.content !== undefined && typeof claim.content !== "string") ||
		!["stated", "web", "documented", "tested", "production"].includes(
			claim.evidence as string,
		)
	)
		throw new Error(
			"Runtime claim needs a safe id, type, topic, content and evidence tier",
		);
	if (
		claim.status !== undefined &&
		!["active", "superseded", "rejected", "resolved"].includes(
			claim.status as string,
		)
	)
		throw new Error("Invalid runtime claim status");
	for (const key of ["depends_on", "conflicts_with"])
		if (
			claim[key] !== undefined &&
			(!Array.isArray(claim[key]) || !claim[key].every(safeId))
		)
			throw new Error(`Invalid runtime claim ${key}`);
	if (
		claim.tags !== undefined &&
		(!Array.isArray(claim.tags) ||
			!claim.tags.every((item) => typeof item === "string"))
	)
		throw new Error("Runtime tags must be strings");
	if (
		claim.verified_by !== undefined &&
		(!object(claim.verified_by) || !safeId(claim.verified_by.verifier))
	)
		throw new Error("Invalid runtime verified_by");
}
export function mutateRuntimeClaim(
	workspace: string,
	operation: string | undefined,
	claim: unknown,
	{
		id,
		expectedHash,
		by,
	}: {
		id?: string | undefined;
		expectedHash?: string | undefined;
		by?: string | undefined;
	} = {},
) {
	const directory = runtimeDirectory(workspace);
	return withRuntimeLock(directory, () => {
		const file = path.join(directory, "claims.json"),
			original = readRegular(file, 16 * 1024 * 1024);
		if (expectedHash && sha256(original) !== expectedHash)
			throw new Error("Runtime claims changed since inspection");
		const envelope = JSON.parse(original.toString("utf8")),
			claims = Array.isArray(envelope) ? envelope : envelope?.claims;
		if (!Array.isArray(claims))
			throw new Error("Invalid native runtime ledger");
		claims.forEach(validateClaim);
		if (new Set(claims.map((item) => item.id)).size !== claims.length)
			throw new Error("Runtime ledger contains duplicate ids");
		if (operation === "add") {
			validateClaim(claim);
			if (claims.some((item) => item.id === claim.id))
				throw new Error("Runtime claim already exists");
			claims.push(claim);
		} else {
			const index = claims.findIndex((item) => item.id === id);
			if (index < 0) throw new Error("Runtime claim does not exist");
			if (operation === "supersede") {
				if (!safeId(by) || by === id || !claims.some((item) => item.id === by))
					throw new Error(
						"Superseding claim must identify another existing runtime claim",
					);
				claims[index] = {
					...claims[index],
					status: "superseded",
					resolved_by: by,
				};
			} else if (operation === "update") {
				if (!object(claim) || (claim.id !== undefined && claim.id !== id))
					throw new Error("Runtime claim update cannot change its id");
				claims[index] = { ...claims[index], ...claim, id };
				validateClaim(claims[index]);
			} else throw new Error("Unknown runtime claim operation");
		}
		const history = path.join(directory, "history");
		assertNoSymlinkPath(history);
		fs.mkdirSync(history, { recursive: true, mode: 0o700 });
		const priorHash = sha256(original),
			backup = path.join(history, `claims-${priorHash}.json`);
		let backupDescriptor: number | undefined;
		try {
			backupDescriptor = fs.openSync(
				backup,
				fs.constants.O_WRONLY |
					fs.constants.O_CREAT |
					fs.constants.O_EXCL |
					fs.constants.O_NOFOLLOW,
				0o600,
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			if (sha256(readRegular(backup, 16 * 1024 * 1024)) !== priorHash)
				throw new Error("Runtime history collision");
		}
		if (backupDescriptor !== undefined)
			try {
				fs.writeFileSync(backupDescriptor, original);
				fs.fsyncSync(backupDescriptor);
			} finally {
				fs.closeSync(backupDescriptor);
			}

		atomicRuntimeJSON(
			file,
			Array.isArray(envelope) ? claims : { ...envelope, claims },
			priorHash,
		);
		return {
			schema: "grainulator.runtime.claim-mutation.v1",
			operation,
			id: operation === "add" ? (claim as { id: string }).id : id,
			previous_sha256: priorHash,
			sha256: sha256(readRegular(file)),
			history: backup,
			verdicts_reverified: false,
		};
	});
}
export function reviewRuntimeMigration(
	workspace: string,
	expectedHash?: string,
) {
	if (!/^[a-f0-9]{64}$/.test(expectedHash || ""))
		throw new Error("Review requires the inspected migration marker SHA-256");
	const directory = runtimeDirectory(workspace);
	return withRuntimeLock(directory, () => {
		const file = path.join(directory, "migration-required.json"),
			marker = JSON.parse(readRegular(file).toString("utf8"));
		if (
			marker.schema !== "grainulator.runtime.migration.v1" ||
			marker.state !== "verification-required"
		)
			throw new Error("No pending runtime migration review");
		const runBytes = readRegular(path.join(directory, "run.json"));
		const run = JSON.parse(runBytes.toString("utf8"));
		validateRun(run);
		if (
			marker.oracle_bindings_requiring_review?.length &&
			run.verification?.mode !== "strict"
		)
			throw new Error(
				"Converted oracle bindings require an explicitly reviewed strict verification run contract",
			);
		const next = {
			...marker,
			state: "reviewed",
			reviewed_run_sha256: sha256(runBytes),
			reviewed_at: new Date().toISOString(),
			verification_performed: false,
		};
		atomicRuntimeJSON(file, next, expectedHash);
		return {
			schema: "grainulator.runtime.migration-review.v1",
			state: "reviewed",
			directory,
			oracles_executed: false,
			outstanding_oracles: marker.oracle_bindings_requiring_review || [],
		};
	});
}
export function enrollRuntime(
	workspace: string,
	{
		host,
		configDirectory,
		expectedSettingsHash,
		expectedEnrollmentHash = "absent",
		home,
	}: HashOptions & {
		host?: string | undefined;
		configDirectory?: string;
		home?: string;
	} = {},
) {
	if (
		!["claude", "codex"].includes(host ?? "") ||
		!configDirectory ||
		!/^(?:absent|[a-f0-9]{64})$/.test(expectedSettingsHash || "")
	)
		throw new Error(
			"Enrollment requires --host, --config-dir and --settings-sha256 <hash|absent>",
		);
	const directory = runtimeDirectory(workspace);
	// A formula can select its own asset for ordinary CLI operations. Explicit
	// long-lived enrollment always selects the exact independently retained cache
	// version/target, even when the caller is that formula's wrapper.
	const asset = resolveRuntimeAsset({
		home,
		directory: path.join(runtimeCache(home), runtimeVersion(), currentTarget()),
	});
	// Required gates are enrolled only from the independently retained user cache,
	// never directly from a Brew keg, opt link or expiring plugin tree.
	const cache = fs.realpathSync(runtimeCache(home));
	if (!fs.realpathSync(asset.asset_directory).startsWith(cache + path.sep))
		throw new Error(
			"Enroll a verified asset explicitly installed into the user runtime cache first",
		);
	return withRuntimeLock(directory, () => {
		const originPath = path.join(directory, "origin.json"),
			migrationPath = path.join(directory, "migration-required.json");
		let origin: "converted" | "new";
		if (fs.existsSync(migrationPath)) {
			const migration = JSON.parse(readRegular(migrationPath).toString("utf8"));
			if (
				migration.schema !== "grainulator.runtime.migration.v1" ||
				migration.state !== "reviewed" ||
				migration.reviewed_run_sha256 !==
					sha256(readRegular(path.join(directory, "run.json")))
			)
				throw new Error(
					"Review the converted runtime and its exact run contract before enrollment",
				);
			origin = "converted";
		} else {
			const initialized = JSON.parse(readRegular(originPath).toString("utf8"));
			if (
				initialized.schema !== "grainulator.runtime.origin.v1" ||
				initialized.origin !== "new"
			)
				throw new Error(
					"Runtime origin is unknown; explicit converter or new-workspace init is required",
				);
			origin = "new";
		}
		const settingsDirectory = assertNoSymlinkPath(
			path.resolve(configDirectory),
		);
		const settingsFile = path.join(
			settingsDirectory,
			host === "claude" ? "settings.json" : "hooks.json",
		);
		const receiptFile = path.join(directory, "enrollment.json");
		const previous = fs.existsSync(receiptFile)
			? readRegular(receiptFile, 128 * 1024)
			: null;
		if ((previous ? sha256(previous) : "absent") !== expectedEnrollmentHash)
			throw new Error("Enrollment changed since inspection");
		const owned = previous
			? validateEnrollmentReceipt(
					JSON.parse(previous.toString("utf8")),
					workspace,
					{
						host,
						settingsFile,
					},
				)
			: null;
		const ledgerBytes = readRegular(
			path.join(directory, "claims.json"),
			16 * 1024 * 1024,
		);
		const ledger = JSON.parse(ledgerBytes.toString("utf8"));
		const claims = Array.isArray(ledger) ? ledger : ledger?.claims;
		if (!Array.isArray(claims))
			throw new Error("Invalid runtime ledger; no host enrollment was changed");
		claims.forEach(validateClaim);
		const runBytes = readRegular(path.join(directory, "run.json"));
		validateRun(JSON.parse(runBytes.toString("utf8")));
		fs.mkdirSync(settingsDirectory, { recursive: true, mode: 0o700 });
		return withRuntimeLock(
			settingsDirectory,
			() => {
				const original = fs.existsSync(settingsFile)
					? readRegular(settingsFile, 4 * 1024 * 1024)
					: null;
				if ((original ? sha256(original) : "absent") !== expectedSettingsHash)
					throw new Error("Host settings changed since inspection");
				const settings = validateHostSettings(
					original ? JSON.parse(original.toString("utf8")) : {},
				);
				assertHostCohort(settings, owned);
				const backupDirectory = path.join(directory, "host-backups");
				fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
				const transaction = crypto.randomUUID();
				const backup = path.join(backupDirectory, `${transaction}.json`);
				fs.writeFileSync(
					backup,
					encode({
						schema: "grainulator.runtime.host-backup.v1",
						host,
						settings_file: settingsFile,
						settings_sha256: expectedSettingsHash,
						settings: original?.toString("base64") || null,
						enrollment: previous?.toString("base64") || null,
					}),
					{ flag: "wx", mode: 0o600 },
				);
				const command = `'${path.join(asset.asset_directory, "grainulator-runtime-hook").replaceAll("'", "'\\''")}' --required`;
				const groups = settings.hooks?.Stop || [];
				const nextGroups = groups
					.map((group) => {
						if (!owned?.hook_command || !Array.isArray(group.hooks))
							return group;
						return {
							...group,
							hooks: group.hooks.filter(
								(item) => item.command !== owned.hook_command,
							),
						};
					})
					.filter((group) => !Array.isArray(group.hooks) || group.hooks.length);
				nextGroups.push({ matcher: "", hooks: [{ type: "command", command }] });
				const nextSettings = {
					...settings,
					hooks: { ...settings.hooks, Stop: nextGroups },
				};
				const receipt = {
					schema: "grainulator.runtime.enrollment.v1",
					state: "prepared",
					origin,
					policy: "required",
					workspace: fs.realpathSync(workspace),
					asset_directory: asset.asset_directory,
					asset_version: asset.version,
					asset_target: asset.target,
					manifest_sha256: asset.manifest_sha256,
					checker_sha256: asset.checker_sha256,
					hook_command: command,
					host,
					settings_file: settingsFile,
					settings_before_sha256: expectedSettingsHash,
					enrollment_before_sha256: expectedEnrollmentHash,
					settings_after_sha256: sha256(encode(nextSettings)),
					ledger_sha256: sha256(ledgerBytes),
					run_sha256: sha256(runBytes),
					transaction,
					backup,
					host_verified: false,
				};
				atomicRuntimeJSON(receiptFile, receipt, expectedEnrollmentHash);
				atomicRuntimeJSON(settingsFile, nextSettings, expectedSettingsHash);
				atomicRuntimeJSON(
					receiptFile,
					{ ...receipt, state: "complete" },
					sha256(encode(receipt)),
				);
				return {
					...receipt,
					state: "complete",
					host_verified: false,
					rollback_requires_matching_settings: true,
				};
			},
			".grainulator-settings.lock",
		);
	});
}
export function rollbackRuntimeEnrollment(
	workspace: string,
	{ expectedEnrollmentHash, expectedSettingsHash }: HashOptions = {},
) {
	const directory = runtimeDirectory(workspace);
	return withRuntimeLock(directory, () => {
		const file = path.join(directory, "enrollment.json"),
			bytes = readRegular(file, 128 * 1024);
		if (sha256(bytes) !== expectedEnrollmentHash)
			throw new Error("Enrollment changed since inspection");
		const receipt = validateEnrollmentReceipt(
			JSON.parse(bytes.toString("utf8")),
			workspace,
			{
				prepared: true,
			},
		);
		if (
			receipt.schema !== "grainulator.runtime.enrollment.v1" ||
			!["complete", "prepared"].includes(receipt.state) ||
			!receipt.settings_file ||
			!receipt.backup
		)
			throw new Error("No owned enrollment rollback receipt");
		const settingsFile = receipt.settings_file;
		if (
			receipt.ledger_sha256 !==
				sha256(readRegular(path.join(directory, "claims.json"))) ||
			receipt.run_sha256 !==
				sha256(readRegular(path.join(directory, "run.json")))
		)
			throw new Error(
				"Runtime data changed after enrollment; freeze and reconcile before rollback",
			);
		const backupPath = assertNoSymlinkPath(receipt.backup);
		if (path.dirname(backupPath) !== path.join(directory, "host-backups"))
			throw new Error("Enrollment backup escaped its runtime");
		const backup = JSON.parse(
			readRegular(backupPath, 8 * 1024 * 1024).toString("utf8"),
		);
		if (
			!object(backup) ||
			backup.schema !== "grainulator.runtime.host-backup.v1" ||
			backup.host !== receipt.host ||
			backup.settings_file !== settingsFile ||
			backup.settings_sha256 !== receipt.settings_before_sha256
		)
			throw new Error("Invalid enrollment backup");
		// Validate both archived preimages before touching settings or enrollment.
		// A null payload is valid only for an explicitly absent preimage.
		const originalSettings = decodeArchivedPayload(
			backup.settings,
			receipt.settings_before_sha256,
			4 * 1024 * 1024,
			"host settings",
		);
		if (originalSettings !== null)
			validateHostSettings(JSON.parse(originalSettings.toString("utf8")));
		const originalEnrollment = decodeArchivedPayload(
			backup.enrollment,
			receipt.enrollment_before_sha256,
			128 * 1024,
			"enrollment",
		);
		if (originalEnrollment !== null) {
			const prior = validateEnrollmentReceipt(
				JSON.parse(originalEnrollment.toString("utf8")),
				workspace,
				{
					host: receipt.host,
					settingsFile: settingsFile,
				},
			);
			if (prior.policy === "required") {
				const retained = resolveRuntimeAsset({
					directory: prior.asset_directory,
					version: prior.asset_version!,
					target: prior.asset_target!,
				});
				if (
					retained.manifest_sha256 !== prior.manifest_sha256 ||
					retained.checker_sha256 !== prior.checker_sha256
				)
					throw new Error(
						"Prior enrollment no longer matches its verified retained runtime",
					);
			}
		}
		return withRuntimeLock(
			path.dirname(settingsFile),
			() => {
				const settings = fs.existsSync(settingsFile)
					? readRegular(settingsFile, 4 * 1024 * 1024)
					: null;
				if (
					(settings ? sha256(settings) : "absent") !== expectedSettingsHash ||
					(expectedSettingsHash !== receipt.settings_after_sha256 &&
						!(
							receipt.state === "prepared" &&
							expectedSettingsHash === receipt.settings_before_sha256
						))
				)
					throw new Error(
						"Host settings changed after enrollment; refusing rollback",
					);
				const settingsWereChanged =
					expectedSettingsHash === receipt.settings_after_sha256;
				if (settingsWereChanged && originalSettings !== null) {
					// Restore exact original bytes, including host formatting, after CAS.
					const temporary = path.join(
						path.dirname(settingsFile),
						`.rollback-${crypto.randomUUID()}`,
					);
					fs.writeFileSync(temporary, originalSettings, {
						flag: "wx",
						mode: 0o600,
					});
					if (sha256(readRegular(settingsFile)) !== expectedSettingsHash)
						throw new Error("Concurrent settings edit during rollback");
					fs.renameSync(temporary, settingsFile);
				} else if (settingsWereChanged) fs.unlinkSync(settingsFile);
				if (originalEnrollment !== null) {
					const temporary = path.join(
						directory,
						`.rollback-${crypto.randomUUID()}`,
					);
					fs.writeFileSync(temporary, originalEnrollment, {
						flag: "wx",
						mode: 0o600,
					});
					fs.renameSync(temporary, file);
				} else fs.unlinkSync(file);
				return {
					schema: "grainulator.runtime.enrollment-rollback.v1",
					state: "rolled-back",
					data_preserved: true,
					host_verified: false,
				};
			},
			".grainulator-settings.lock",
		);
	});
}
export function detachRuntimeEnrollment(
	workspace: string,
	{ expectedEnrollmentHash, expectedSettingsHash }: HashOptions = {},
) {
	const directory = runtimeDirectory(workspace);
	return withRuntimeLock(directory, () => {
		const file = path.join(directory, "enrollment.json"),
			bytes = readRegular(file, 128 * 1024);
		if (sha256(bytes) !== expectedEnrollmentHash)
			throw new Error("Enrollment changed since inspection");
		const receipt = validateEnrollmentReceipt(
			JSON.parse(bytes.toString("utf8")),
			workspace,
		);
		if (
			receipt.schema !== "grainulator.runtime.enrollment.v1" ||
			receipt.state !== "complete" ||
			receipt.policy !== "required" ||
			!receipt.settings_file
		)
			throw new Error("No complete owned runtime enrollment to detach");
		const settingsFile = receipt.settings_file;
		return withRuntimeLock(
			path.dirname(settingsFile),
			() => {
				const settingsBytes = readRegular(settingsFile, 4 * 1024 * 1024);
				if (sha256(settingsBytes) !== expectedSettingsHash)
					throw new Error("Host settings changed since inspection");
				const settings = validateHostSettings(
					JSON.parse(settingsBytes.toString("utf8")),
				);
				assertHostCohort(settings, receipt);
				let removed = 0;
				const groups = settings
					.hooks!.Stop!.map((group) =>
						!Array.isArray(group.hooks)
							? group
							: {
									...group,
									hooks: group.hooks.filter((hook) => {
										if (hook.command === receipt.hook_command) {
											removed++;
											return false;
										}
										return true;
									}),
								},
					)
					.filter((group) => !Array.isArray(group.hooks) || group.hooks.length);
				if (removed !== 1)
					throw new Error(
						"Owned host hook is missing or duplicated; inspect before detaching",
					);
				const next = {
					...settings,
					hooks: { ...settings.hooks, Stop: groups },
				};
				const transaction = crypto.randomUUID();
				const backup = path.join(
					directory,
					"host-backups",
					`${transaction}.json`,
				);
				fs.writeFileSync(
					backup,
					encode({
						schema: "grainulator.runtime.host-backup.v1",
						host: receipt.host,
						settings_file: settingsFile,
						settings_sha256: expectedSettingsHash,
						settings: settingsBytes.toString("base64"),
						enrollment: bytes.toString("base64"),
					}),
					{ flag: "wx", mode: 0o600 },
				);
				const prepared = {
					...receipt,
					state: "prepared",
					operation: "detach",
					transaction,
					backup,
					settings_before_sha256: expectedSettingsHash,
					enrollment_before_sha256: expectedEnrollmentHash,
					settings_after_sha256: sha256(encode(next)),
					ledger_sha256: sha256(
						readRegular(path.join(directory, "claims.json")),
					),
					run_sha256: sha256(readRegular(path.join(directory, "run.json"))),
				};
				atomicRuntimeJSON(file, prepared, expectedEnrollmentHash);
				atomicRuntimeJSON(settingsFile, next, expectedSettingsHash);
				atomicRuntimeJSON(
					file,
					{
						...prepared,
						policy: "not-managed",
						state: "complete",
						detached_at: new Date().toISOString(),
						host_verified: false,
					},
					sha256(encode(prepared)),
				);
				return {
					schema: "grainulator.runtime.detach.v1",
					state: "detached",
					user_data_preserved: true,
					runtime_assets_preserved: true,
					host_verified: false,
				};
			},
			".grainulator-settings.lock",
		);
	});
}
