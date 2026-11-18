/** Separately distributed remote identity converter. No transport, credentials or discovery. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const hash = (value) =>
	crypto
		.createHash("sha256")
		.update(
			typeof value === "string" || Buffer.isBuffer(value)
				? value
				: JSON.stringify(value),
		)
		.digest("hex");
const MAX_LOCAL_BYTES = 16 * 1024 * 1024;
/** Parse/hash the same bounded regular single-link descriptor snapshot. Never follow a leaf symlink or block on a FIFO. */
function readSnapshot(file, max = MAX_LOCAL_BYTES) {
	if (fs.constants.O_NOFOLLOW === undefined)
		throw new Error(
			"Safe local file snapshots are unavailable on this platform.",
		);
	const fd = fs.openSync(
		file,
		fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
	);
	try {
		const before = fs.fstatSync(fd);
		if (!before.isFile() || before.nlink !== 1 || before.size > max)
			throw new Error(
				"Expected a bounded, single-link regular remote metadata file.",
			);
		const chunks = [];
		let length = 0;
		for (;;) {
			const chunk = Buffer.alloc(Math.min(64 * 1024, max + 1 - length));
			const count = fs.readSync(fd, chunk, 0, chunk.length, null);
			if (!count) break;
			length += count;
			if (length > max)
				throw new Error("Remote metadata exceeded its byte limit.");
			chunks.push(chunk.subarray(0, count));
		}
		const after = fs.fstatSync(fd);
		if (
			!after.isFile() ||
			after.nlink !== 1 ||
			after.size !== length ||
			before.size !== after.size ||
			before.mtimeMs !== after.mtimeMs ||
			before.ctimeMs !== after.ctimeMs
		)
			throw new Error("Remote metadata changed while being read.");
		const bytes = Buffer.concat(chunks, length);
		return { bytes, sha256: hash(bytes) };
	} finally {
		fs.closeSync(fd);
	}
}
// This cooperative writer protocol checks again immediately before rename; it is not a filesystem CAS against arbitrary external writers.
function assertSnapshot(file, expected) {
	if (readSnapshot(file).sha256 !== expected.sha256)
		throw new Error(
			"Inventory changed before the reviewed marker could commit.",
		);
}
function withMarkerLock(file, operation) {
	const lock = file + ".lock";
	fs.mkdirSync(lock, { mode: 0o700 });
	try {
		return operation();
	} finally {
		fs.rmSync(lock, { recursive: true, force: true });
	}
}
function createOrMatchHistory(file, bytes) {
	let fd;
	try {
		fd = fs.openSync(
			file,
			fs.constants.O_WRONLY |
				fs.constants.O_CREAT |
				fs.constants.O_EXCL |
				fs.constants.O_NOFOLLOW,
			0o600,
		);
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
		if (!readSnapshot(file).bytes.equals(bytes))
			throw new Error("Historical inventory collision.");
		return;
	}
	try {
		fs.writeFileSync(fd, bytes);
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}
}
const labels = (value) => {
	if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !v))
		throw new Error("Page labels must be explicit strings.");
	return [...new Set(value)].sort();
};
function destination(page) {
	if (
		!page ||
		typeof page.site !== "string" ||
		!page.site ||
		typeof page.space !== "string" ||
		!page.space ||
		typeof page.pageId !== "string" ||
		!/^\d+$/.test(page.pageId)
	)
		throw new Error(
			"Explicit site, space and existing numeric pageId are required. Titles are not identities.",
		);
	return { site: page.site, space: page.space, pageId: page.pageId };
}
function snapshot(page, dest) {
	if (
		!page ||
		page.id !== dest.pageId ||
		!Number.isSafeInteger(page.version) ||
		page.version < 1 ||
		typeof page.title !== "string" ||
		typeof page.body !== "string"
	)
		throw new Error("Cannot verify existing page identity, version and body.");
	return {
		version: page.version,
		title: page.title,
		body_sha256: hash(page.body),
		labels: labels(page.labels),
	};
}
function same(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}
function targetFor(page, format) {
	const set = new Set(labels(page.labels));
	let title = page.title;
	if (format === "snapshot") {
		const old = ["wheat-active", "wheat-archived"].filter((v) => set.has(v));
		if (
			old.length > 1 ||
			set.has("silo-claims") ||
			set.has("grainulator-claims")
		)
			throw new Error("Contradictory or mixed remote formats.");
		if (
			!old.length &&
			!set.has("grainulator-active") &&
			!set.has("grainulator-archived")
		)
			throw new Error("Snapshot format is not identified by an owned label.");
		for (const name of old) {
			set.delete(name);
			const replacement = name.replace("wheat-", "grainulator-");
			if (
				[...set].some(
					(v) =>
						["grainulator-active", "grainulator-archived"].includes(v) &&
						v !== replacement,
				)
			)
				throw new Error("Contradictory lifecycle labels.");
			set.add(replacement);
		}
		if (set.has("grainulator-active") && set.has("grainulator-archived"))
			throw new Error("Contradictory lifecycle labels.");
		if (title.startsWith("Wheat: ")) title = "Grainulator: " + title.slice(7);
	} else if (format === "memory-table") {
		if (
			[...set].some((v) =>
				[
					"wheat-active",
					"wheat-archived",
					"grainulator-active",
					"grainulator-archived",
				].includes(v),
			)
		)
			throw new Error("Contradictory or mixed remote formats.");
		if (!set.has("silo-claims") && !set.has("grainulator-claims"))
			throw new Error(
				"Memory-table format is not identified by an owned label.",
			);
		if (
			!/<th>\s*Content\s*<\/th>/i.test(page.body) ||
			!/<th>\s*Tags\s*<\/th>/i.test(page.body)
		)
			throw new Error(
				"The page does not match the claimed memory-table format.",
			);
		set.delete("silo-claims");
		set.add("grainulator-claims");
	} else throw new Error("An explicit supported remote format is required.");
	// Deliberately preserve exact body bytes: user claims, quotes and embedded snapshots are historical evidence.
	return { title, labels: [...set].sort(), body: page.body };
}
/** Read only; no title discovery and no local or remote writes. */
export async function previewRemoteMigration({ adapter, pages }) {
	if (
		typeof adapter?.read !== "function" ||
		!Array.isArray(pages) ||
		!pages.length
	)
		throw new Error(
			"An explicit page inventory and read adapter are required.",
		);
	const entries = [];
	const seen = new Set();
	for (const page of pages) {
		const dest = destination(page),
			key = JSON.stringify(dest);
		if (seen.has(key)) throw new Error("Duplicate page identity.");
		seen.add(key);
		const current = await adapter.read(dest);
		const before = snapshot(current, dest);
		const after = targetFor(current, page.format);
		const noop =
			before.title === after.title && same(before.labels, after.labels);
		if (page.inventory) {
			if (typeof page.sourceId !== "string" || !page.sourceId.trim())
				throw new Error(
					"Inventory conversion requires an explicit stable sourceId for each source/role.",
				);
			if (page.inventory.pageId !== dest.pageId)
				throw new Error(
					"Inventory page ID differs from the selected destination.",
				);
			for (const key of ["site", "space"])
				if (page.inventory[key] && page.inventory[key] !== dest[key])
					throw new Error(
						"Inventory destination scope contradicts the selected destination.",
					);
		}
		const inventory = page.inventory
			? {
					inventory: structuredClone(page.inventory),
					inventory_sha256: hash(page.inventory),
					sourceId: page.sourceId,
				}
			: {};
		entries.push({
			destination: dest,
			format: page.format,
			...inventory,
			before,
			after: {
				...after,
				body_sha256: hash(after.body),
				version: before.version + (noop ? 0 : 1),
			},
			noop,
		});
	}
	const core = { schema: "grainulator.remote-plan.v1", entries };
	return { ...core, id: hash(core) };
}
function validatePlan(plan) {
	if (
		plan?.schema !== "grainulator.remote-plan.v1" ||
		!Array.isArray(plan.entries) ||
		!plan.entries.length ||
		plan.id !== hash({ schema: plan.schema, entries: plan.entries })
	)
		throw new Error("Remote migration plan integrity check failed.");
	for (const entry of plan.entries) {
		destination(entry.destination);
		if (entry.inventory && entry.inventory_sha256 !== hash(entry.inventory))
			throw new Error("Inventory association changed.");
		if (
			hash(entry.after?.body || "") !== entry.after?.body_sha256 ||
			entry.before.body_sha256 !== entry.after.body_sha256
		)
			throw new Error(
				"A remote identity migration must preserve exact body bytes.",
			);
		if (entry.after.version !== entry.before.version + (entry.noop ? 0 : 1))
			throw new Error("Invalid planned version.");
		labels(entry.before.labels);
		labels(entry.after.labels);
	}
}
function receiptRead(file, plan, withSnapshot = false) {
	let snapshot;
	try {
		snapshot = readSnapshot(file);
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
	const receipt = JSON.parse(snapshot.bytes);
	if (
		receipt.schema !== "grainulator.remote-receipt.v1" ||
		receipt.plan_id !== plan.id ||
		!Array.isArray(receipt.pages) ||
		receipt.pages.length !== plan.entries.length ||
		receipt.pages.some(
			(page, index) =>
				!same(page.destination, plan.entries[index].destination) ||
				!["planned", "sent", "confirmed", "uncertain"].includes(page.state),
		) ||
		!Array.isArray(receipt.events)
	)
		throw new Error("Receipt does not belong to this plan.");
	return withSnapshot ? { receipt, snapshot } : receipt;
}
function persist(file, receipt, create = false, expectedSnapshot) {
	const bytes = JSON.stringify(receipt, null, 2) + "\n";
	const selected = create ? file : `${file}.${crypto.randomUUID()}.tmp`;
	let fd,
		owned = false;
	try {
		fd = fs.openSync(selected, "wx", 0o600);
		owned = true;
		fs.writeFileSync(fd, bytes);
		fs.fsyncSync(fd);
		fs.closeSync(fd);
		fd = undefined;
		if (!create) {
			if (expectedSnapshot) assertSnapshot(file, expectedSnapshot);
			fs.renameSync(selected, file);
			owned = false;
		}
		const parent = fs.openSync(path.dirname(file), "r");
		try {
			fs.fsyncSync(parent);
		} finally {
			fs.closeSync(parent);
		}
	} finally {
		if (fd !== undefined) fs.closeSync(fd);
		if (!create && owned)
			try {
				fs.unlinkSync(selected);
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
	}
}
function transition(file, receipt, index, state) {
	receipt.pages[index] = { ...receipt.pages[index], state };
	receipt.events.push({ index, state, at: new Date().toISOString() });
	persist(file, receipt);
}
function withLock(file, operation) {
	const lock = file + ".lock";
	fs.mkdirSync(lock, { mode: 0o700 });
	return Promise.resolve()
		.then(operation)
		.finally(() => fs.rmSync(lock, { recursive: true, force: true }));
}
function afterSnapshot(entry) {
	return {
		version: entry.after.version,
		title: entry.after.title,
		body_sha256: entry.after.body_sha256,
		labels: entry.after.labels,
	};
}
/** Explicit single-attempt updates only. adapter.update must use the supplied exact expected_version CAS. */
export async function applyRemoteMigration({
	plan,
	adapter,
	receiptFile,
	authorized = false,
}) {
	if (authorized !== true)
		throw new Error("Explicit authorization is required for remote updates.");
	validatePlan(plan);
	if (
		typeof adapter?.read !== "function" ||
		typeof adapter?.update !== "function" ||
		!receiptFile
	)
		throw new Error("Read/update adapter and local receipt path are required.");
	return withLock(receiptFile, async () => {
		let receipt = receiptRead(receiptFile, plan);
		if (!receipt) {
			receipt = {
				schema: "grainulator.remote-receipt.v1",
				plan_id: plan.id,
				pages: plan.entries.map((entry) => ({
					destination: entry.destination,
					format: entry.format,
					...(entry.inventory_sha256
						? {
								inventory_sha256: entry.inventory_sha256,
								sourceId: entry.sourceId,
							}
						: {}),
					state: "planned",
				})),
				events: [],
			};
			persist(receiptFile, receipt, true);
		}
		for (let i = 0; i < plan.entries.length; i++) {
			const entry = plan.entries[i],
				state = receipt.pages[i].state;
			if (["sent", "uncertain"].includes(state))
				throw new Error(
					"A prior write may have happened. Reconcile it explicitly before applying again.",
				);
			const current = await adapter.read(entry.destination),
				actual = snapshot(current, entry.destination);
			if (state === "confirmed") {
				if (!same(actual, afterSnapshot(entry)))
					throw new Error("A confirmed page changed after migration.");
				continue;
			}
			if (state !== "planned") throw new Error("Unsupported receipt state.");
			if (!same(actual, entry.before))
				throw new Error(
					"Page changed since preview; refusing a stale migration.",
				);
			const expected = targetFor(current, entry.format);
			if (
				expected.title !== entry.after.title ||
				!same(expected.labels, entry.after.labels)
			)
				throw new Error(
					"Planned metadata is not the reviewed identity transformation.",
				);
			if (entry.noop) {
				transition(receiptFile, receipt, i, "confirmed");
				continue;
			}
			// Durably record sent BEFORE the remote boundary. A crash from here requires reconciliation.
			transition(receiptFile, receipt, i, "sent");
			try {
				const result = await adapter.update({
					...entry.destination,
					expected_version: entry.before.version,
					version: entry.after.version,
					title: entry.after.title,
					labels: entry.after.labels,
					body: entry.after.body,
				});
				if (
					result?.id !== entry.destination.pageId ||
					result?.version !== entry.after.version
				)
					throw new Error("Unconfirmed remote response.");
				const observed = snapshot(
					await adapter.read(entry.destination),
					entry.destination,
				);
				if (!same(observed, afterSnapshot(entry)))
					throw new Error("Remote write could not be verified.");
				transition(receiptFile, receipt, i, "confirmed");
			} catch {
				transition(receiptFile, receipt, i, "uncertain");
				throw new Error(
					"Remote update outcome is uncertain. Do not retry; reconcile the existing page and receipt.",
				);
			}
		}
		return receipt;
	});
}
/** Read remote state; only this explicit operation can resolve sent/uncertain receipts. */
export async function reconcileRemoteMigration({
	plan,
	adapter,
	receiptFile,
	confirmNotApplied = false,
}) {
	validatePlan(plan);
	return withLock(receiptFile, async () => {
		const receipt = receiptRead(receiptFile, plan);
		if (!receipt) throw new Error("No existing receipt to reconcile.");
		for (let i = 0; i < plan.entries.length; i++) {
			if (!["sent", "uncertain"].includes(receipt.pages[i].state)) continue;
			const entry = plan.entries[i],
				actual = snapshot(
					await adapter.read(entry.destination),
					entry.destination,
				);
			if (same(actual, afterSnapshot(entry)))
				transition(receiptFile, receipt, i, "confirmed");
			else if (same(actual, entry.before) && confirmNotApplied === true)
				transition(receiptFile, receipt, i, "planned");
			else
				throw new Error(
					"Outcome remains unresolved; preserve the receipt and inspect the existing page.",
				);
		}
		return receipt;
	});
}

/** Explicitly finalize a complete, unambiguous inventory. No remote requests. */
export function completeRemoteMigration({
	plan,
	receiptFile,
	markerFile,
	expectedMarkerSha256,
}) {
	return withMarkerLock(markerFile, () => {
		validatePlan(plan);
		const captured = receiptRead(receiptFile, plan, true);
		const receipt = captured?.receipt;
		if (!receipt || receipt.pages.some((page) => page.state !== "confirmed"))
			throw new Error("Every page must be confirmed before finalization.");
		const markerSnapshot = readSnapshot(markerFile);
		const markerBytes = markerSnapshot.bytes;
		if (!expectedMarkerSha256 || markerSnapshot.sha256 !== expectedMarkerSha256)
			throw new Error(
				"Inspect the exact remote migration marker before finalization; its hash changed or is missing.",
			);
		const marker = JSON.parse(markerBytes);
		if (
			marker.schema !== "grainulator.remote-migration.v1" ||
			marker.ambiguity ||
			!Array.isArray(marker.pages) ||
			!marker.pages.length
		)
			throw new Error(
				"Ambiguous inventories require an explicit reviewed identity mapping.",
			);
		const state = fs.realpathSync(path.dirname(markerFile));
		const relative = path.relative(state, fs.realpathSync(receiptFile));
		if (
			!relative ||
			relative === ".." ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative)
		)
			throw new Error(
				"Keep the receipt in the canonical evidence state directory.",
			);
		const bindings = [];
		for (const page of marker.pages) {
			const fingerprint = hash(page);
			const match = plan.entries.filter(
				(entry) =>
					entry.inventory_sha256 === fingerprint &&
					entry.destination.pageId === page.pageId &&
					entry.format === page.format,
			);
			if (match.length !== 1)
				throw new Error(
					"An inventory page/source/role association is not uniquely reconciled.",
				);
			const entry = match[0];
			if (
				!receipt.pages.some(
					(record) =>
						record.state === "confirmed" &&
						record.inventory_sha256 === fingerprint &&
						record.sourceId === entry.sourceId &&
						record.format === entry.format &&
						same(record.destination, entry.destination),
				)
			)
				throw new Error("Inventory association lacks a confirmed receipt.");
			bindings.push({
				inventory_sha256: fingerprint,
				sourceId: entry.sourceId,
				format: entry.format,
				destination: entry.destination,
			});
		}
		if (
			new Set(bindings.map((binding) => binding.sourceId)).size !==
			bindings.length
		)
			throw new Error(
				"Each reviewed source/role needs a unique stable sourceId.",
			);
		const result = {
			...marker,
			state: "complete",
			bindings,
			receipt: {
				file: relative,
				sha256: captured.snapshot.sha256,
			},
		};
		assertSnapshot(receiptFile, captured.snapshot);
		persist(markerFile, result, false, markerSnapshot);
		return result;
	});
}

/** Explicit local review of an ambiguous legacy inventory. No adapter or network is used. */
export function resolveRemoteInventory({
	markerFile,
	expectedMarkerSha256,
	completeInventory = false,
	mappings = [],
	notConfigured = [],
	reason,
	evidence = [],
}) {
	if (
		completeInventory !== true ||
		typeof reason !== "string" ||
		!reason.trim() ||
		!Array.isArray(evidence) ||
		!evidence.length ||
		evidence.some((item) => typeof item !== "string" || !item.trim())
	)
		throw new Error(
			"Complete reviewed inventory, reason and documentary evidence references are required.",
		);
	return withMarkerLock(markerFile, () => {
		const markerSnapshot = readSnapshot(markerFile),
			bytes = markerSnapshot.bytes,
			before = markerSnapshot.sha256;
		if (!expectedMarkerSha256 || before !== expectedMarkerSha256)
			throw new Error(
				"Remote inventory changed; supply the inspected marker hash.",
			);
		const marker = JSON.parse(bytes);
		if (
			marker.schema !== "grainulator.remote-migration.v1" ||
			!["pending", "uncertain"].includes(marker.state)
		)
			throw new Error(
				"Only pending/uncertain remote inventory can be explicitly resolved.",
			);
		const records = [
			...(marker.sync_sources || []),
			...(marker.legacy_config_sources || []),
		];
		const sourceHashes = records.length
			? [...new Set(records.map((record) => hash(record)))]
			: [before];
		if (!Array.isArray(mappings) || !Array.isArray(notConfigured))
			throw new Error(
				"Explicit mappings and notConfigured dispositions must be arrays.",
			);
		const knownPages = marker.pages || [];
		if (
			!Array.isArray(knownPages) ||
			knownPages.some(
				(page) =>
					!page ||
					typeof page.pageId !== "string" ||
					!page.pageId ||
					!["snapshot", "memory-table"].includes(page.format),
			)
		)
			throw new Error(
				"Known remote page identities must be preserved and individually reconciled.",
			);
		const known = new Map(knownPages.map((page) => [hash(page), page]));
		if (known.size !== knownPages.length)
			throw new Error(
				"Duplicate opaque remote identities require explicit reconciliation.",
			);
		const recordHashes = new Map(
			records.map((record) => [hash(record), record]),
		);
		const sourceFor = (page) =>
			sourceHashes.filter((digest) => {
				const record = recordHashes.get(digest);
				return page.source_relative_path
					? record?.source_relative_path === page.source_relative_path
					: sourceHashes.length === 1;
			});
		const pages = [],
			usedIds = new Set(),
			covered = new Set(),
			sourceIds = new Set(),
			knownCovered = new Set();
		for (const mapping of mappings) {
			if (
				!sourceHashes.includes(mapping.source_sha256) ||
				typeof mapping.sourceId !== "string" ||
				!mapping.sourceId.trim() ||
				typeof mapping.role !== "string" ||
				!mapping.role.trim() ||
				!["snapshot", "memory-table"].includes(mapping.format)
			)
				throw new Error(
					"Mapping needs an owned source hash, stable sourceId, role and supported format.",
				);
			const fingerprint = mapping.inventory
				? hash(mapping.inventory)
				: mapping.inventory_sha256;
			const original = fingerprint ? known.get(fingerprint) : undefined;
			if (fingerprint && !original)
				throw new Error(
					"Mapping does not match a retained page/role/scope identity.",
				);
			if (original) {
				if (
					knownCovered.has(fingerprint) ||
					!sourceFor(original).includes(mapping.source_sha256) ||
					original.pageId !== mapping.pageId ||
					original.format !== mapping.format
				)
					throw new Error(
						"Known page/source/role identity mapping differs or is duplicated.",
					);
				for (const key of ["site", "space", "role"])
					if (original[key] !== undefined && original[key] !== mapping[key])
						throw new Error(
							"Known remote identity scope differs from the reviewed mapping.",
						);
				if (
					original.scope !== undefined &&
					mapping.scope !== undefined &&
					!same(original.scope, mapping.scope)
				)
					throw new Error("Known remote role/scope cannot be discarded.");
				knownCovered.add(fingerprint);
			} else if (
				knownPages.some((page) =>
					sourceFor(page).includes(mapping.source_sha256),
				)
			) {
				if (
					mapping.supplemental !== true ||
					!Array.isArray(mapping.scope) ||
					!mapping.scope.length ||
					mapping.scope.some((key) => typeof key !== "string" || !key) ||
					typeof mapping.reason !== "string" ||
					!mapping.reason.trim() ||
					!Array.isArray(mapping.evidence) ||
					!mapping.evidence.length ||
					mapping.evidence.some((ref) => typeof ref !== "string" || !ref.trim())
				)
					throw new Error(
						"Supplemental discovered pages need explicit source scope, reason and documentary evidence.",
					);
				let scope = recordHashes.get(mapping.source_sha256)?.state;
				for (const key of mapping.scope) {
					if (!scope || typeof scope !== "object" || !Object.hasOwn(scope, key))
						throw new Error(
							"Supplemental source scope is not present in the preserved inventory.",
						);
					scope = scope[key];
				}
				if (
					!scope ||
					typeof scope !== "object" ||
					Array.isArray(scope) ||
					"pageId" in scope ||
					"page_id" in scope
				)
					throw new Error(
						"Supplemental scope cannot replace a known page identity.",
					);
			}
			const dest = destination(mapping),
				key = JSON.stringify(dest);
			if (usedIds.has(key) || sourceIds.has(mapping.sourceId))
				throw new Error("Duplicate destination/source association.");
			usedIds.add(key);
			sourceIds.add(mapping.sourceId);
			covered.add(mapping.source_sha256);
			pages.push({
				...structuredClone(original || {}),
				...dest,
				format: mapping.format,
				sourceId: mapping.sourceId,
				source_reference: {
					sha256: mapping.source_sha256,
					role: mapping.role,
					...(mapping.supplemental
						? {
								supplemental: true,
								reason: mapping.reason,
								evidence: structuredClone(mapping.evidence),
							}
						: {}),
					...(fingerprint ? { inventory_sha256: fingerprint } : {}),
					...(mapping.scope !== undefined
						? { scope: structuredClone(mapping.scope) }
						: {}),
				},
			});
		}
		const dispositions = [];
		for (const decision of notConfigured) {
			if (
				knownPages.some((page) =>
					sourceFor(page).includes(decision.source_sha256),
				)
			)
				throw new Error(
					"A source with known pages cannot be declared not configured.",
				);
			if (
				!sourceHashes.includes(decision.source_sha256) ||
				covered.has(decision.source_sha256) ||
				typeof decision.reason !== "string" ||
				!decision.reason.trim() ||
				!Array.isArray(decision.evidence) ||
				!decision.evidence.length ||
				decision.evidence.some((ref) => typeof ref !== "string" || !ref.trim())
			)
				throw new Error(
					"Each not-configured decision needs a distinct owned source hash, reason and documentary evidence.",
				);
			covered.add(decision.source_sha256);
			dispositions.push(structuredClone(decision));
		}
		if (knownCovered.size !== known.size)
			throw new Error(
				"Every retained page/role/scope needs its own reviewed identity mapping.",
			);
		if (covered.size !== sourceHashes.length)
			throw new Error(
				"Every owned source must have a reviewed mapping or documented not-configured disposition.",
			);
		const directory = path.dirname(markerFile),
			history = path.join(directory, "remote-history");
		try {
			fs.mkdirSync(history, { mode: 0o700 });
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			const descriptor = fs.openSync(
				history,
				fs.constants.O_RDONLY |
					fs.constants.O_DIRECTORY |
					fs.constants.O_NOFOLLOW |
					fs.constants.O_NONBLOCK,
			);
			try {
				if (!fs.fstatSync(descriptor).isDirectory())
					throw new Error("Remote history must be an owned directory.");
			} finally {
				fs.closeSync(descriptor);
			}
		}
		const historical = path.join(history, `${before}.json`);
		createOrMatchHistory(historical, bytes);
		const resultHash = hash({ pages, dispositions });
		const receipt = {
			schema: "grainulator.remote-resolution.v1",
			before_sha256: before,
			history: { file: path.relative(directory, historical), sha256: before },
			decision: pages.length ? "mapped" : "not-configured",
			complete_inventory: true,
			source_hashes: sourceHashes,
			result_sha256: resultHash,
			reason,
			evidence,
			at: new Date().toISOString(),
		};
		const receiptFile = path.join(
			directory,
			`remote-resolution-${before}.json`,
		);
		try {
			persist(receiptFile, receipt, true);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		const resolutionSnapshot = readSnapshot(receiptFile),
			savedReceipt = JSON.parse(resolutionSnapshot.bytes);
		const stable = (value) => {
			const intent = { ...value };
			delete intent.at;
			return intent;
		};
		if (
			!same(stable(savedReceipt), stable(receipt)) ||
			typeof savedReceipt.at !== "string" ||
			!Number.isFinite(Date.parse(savedReceipt.at))
		)
			throw new Error(
				"Durable resolution receipt has conflicting intent; preserving it and the marker.",
			);
		if (!readSnapshot(historical).bytes.equals(bytes))
			throw new Error("Historical inventory changed before resolution.");

		const result = {
			...marker,
			state: pages.length ? "pending" : "complete",
			ambiguity: false,
			pages,
			reviewed_not_configured: dispositions,
			local_resolution: {
				file: path.basename(receiptFile),
				sha256: resolutionSnapshot.sha256,
			},
		};
		assertSnapshot(receiptFile, resolutionSnapshot);
		persist(markerFile, result, false, markerSnapshot);
		return result;
	});
}
