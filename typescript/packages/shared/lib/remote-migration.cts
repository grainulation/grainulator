/** Canonical receipt gate only; no historical parser or remote discovery. */
import fs = require("node:fs");
import path = require("node:path");
import crypto = require("node:crypto");
import config = require("./project-config.cjs");
type Data = Record<string, unknown>;
interface Destination {
	site?: string | undefined;
	space?: string | undefined;
	pageId?: string | undefined;
	newSource?: string | undefined;
	sourceId?: string | undefined;
}
interface Options {
	workspace?: string | undefined;
	destination?: Destination | undefined;
	newSource?: string | undefined;
	sourceId?: string | undefined;
}
const object = (value: unknown): value is Data =>
	value !== null && typeof value === "object" && !Array.isArray(value);
function hash(value: unknown): string {
	const bytes =
		typeof value === "string" || Buffer.isBuffer(value)
			? value
			: JSON.stringify(value);
	if (bytes === undefined)
		throw new Error("Remote migration evidence is not JSON data.");
	return crypto.createHash("sha256").update(bytes).digest("hex");
}
function readObject(bytes: string | Buffer): Data {
	const value: unknown = JSON.parse(
		Buffer.isBuffer(bytes) ? bytes.toString("utf8") : bytes,
	);
	if (!object(value))
		throw new Error(
			"Remote migration metadata is invalid; publication is blocked.",
		);
	return value;
}
const text = (value: unknown): string =>
	typeof value === "string" ? value : "";
function assertMarker(
	state: string,
	destination: Destination | undefined,
	newSource: string | undefined,
	sourceId: string | undefined,
): void {
	const file = path.join(state, "remote-migration.json");
	if (!fs.existsSync(file)) return;
	let marker: Data;
	try {
		marker = readObject(fs.readFileSync(file, "utf8"));
	} catch {
		throw new Error(
			"Remote migration metadata is invalid; publication is blocked.",
		);
	}
	if (
		marker.state === "complete" &&
		!marker.ambiguity &&
		Array.isArray(marker.pages) &&
		marker.pages.length === 0 &&
		object(marker.local_resolution)
	) {
		const receiptPath = path.resolve(state, text(marker.local_resolution.file));
		const relative = path.relative(
			fs.realpathSync(state),
			fs.realpathSync(receiptPath),
		);
		if (
			relative === ".." ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative)
		)
			throw new Error("Remote resolution receipt escapes its state directory.");
		const bytes = fs.readFileSync(receiptPath);
		if (hash(bytes) !== marker.local_resolution.sha256)
			throw new Error("Remote resolution receipt changed.");
		const decision = readObject(bytes);
		const history = path.resolve(
			state,
			object(decision.history) ? text(decision.history.file) : "",
		);
		const historicalRelative = path.relative(
			fs.realpathSync(state),
			fs.realpathSync(history),
		);
		if (
			historicalRelative === ".." ||
			historicalRelative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(historicalRelative) ||
			hash(fs.readFileSync(history)) !== decision.before_sha256 ||
			decision.schema !== "grainulator.remote-resolution.v1" ||
			decision.decision !== "not-configured" ||
			decision.complete_inventory !== true ||
			decision.result_sha256 !==
				hash({
					pages: marker.pages,
					dispositions: marker.reviewed_not_configured || [],
				}) ||
			!Array.isArray(decision.evidence) ||
			!decision.evidence.length
		)
			throw new Error(
				"Remote not-configured decision is not completely documented.",
			);
		return;
	}
	if (
		marker.schema !== "grainulator.remote-migration.v1" ||
		marker.state !== "complete" ||
		marker.ambiguity ||
		!Array.isArray(marker.pages) ||
		!marker.pages.length ||
		!Array.isArray(marker.bindings) ||
		!marker.bindings.every(object) ||
		!object(marker.receipt)
	)
		throw new Error(
			"Remote identity migration requires explicit reconciliation before publication or discovery.",
		);
	const bindings = marker.bindings;
	const selected = path.resolve(state, text(marker.receipt.file));
	const relative = path.relative(
		fs.realpathSync(state),
		fs.realpathSync(selected),
	);
	if (
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	)
		throw new Error(
			"Remote migration receipt escapes its evidence state directory.",
		);
	const bytes = fs.readFileSync(selected);
	if (hash(bytes) !== marker.receipt.sha256)
		throw new Error("Remote migration receipt changed.");
	const receipt = readObject(bytes);
	if (
		receipt.schema !== "grainulator.remote-receipt.v1" ||
		!Array.isArray(receipt.pages) ||
		!receipt.pages.every(object) ||
		receipt.pages.some((page) => page.state !== "confirmed")
	)
		throw new Error("Remote migration is not confirmed.");
	const pages = receipt.pages;
	for (const page of marker.pages) {
		const inventory_sha256 = hash(page),
			matching = bindings.filter(
				(binding) => binding.inventory_sha256 === inventory_sha256,
			);
		if (matching.length !== 1)
			throw new Error(
				"Remote migration inventory has unresolved associations.",
			);
		const binding = matching[0];
		if (!binding || typeof binding.sourceId !== "string" || !binding.sourceId)
			throw new Error("Remote migration source identity is missing.");
		if (
			!pages.some(
				(record) =>
					record.inventory_sha256 === inventory_sha256 &&
					record.sourceId === binding.sourceId &&
					record.format === binding.format &&
					JSON.stringify(record.destination) ===
						JSON.stringify(binding.destination) &&
					record.state === "confirmed",
			)
		)
			throw new Error(
				"Remote migration destination association is not confirmed.",
			);
	}
	if (destination) {
		const known =
			sourceId && bindings.find((binding) => binding.sourceId === sourceId);
		const matches = (binding: Data): boolean =>
			object(binding.destination) &&
			binding.destination.site === destination.site &&
			binding.destination.space === destination.space &&
			binding.destination.pageId === destination.pageId;
		if (known && !matches(known))
			throw new Error(
				"Known migrated source requires its confirmed site, space and page ID; creation fallback is blocked.",
			);
		if (!bindings.some(matches)) {
			if (
				destination.pageId ||
				typeof newSource !== "string" ||
				!newSource.trim() ||
				bindings.some((binding) => binding.sourceId === newSource) ||
				known
			)
				throw new Error(
					"Publishing requires a reconciled destination, or explicit newSource for a genuinely new collection.",
				);
		}
	}
}
function assertRemoteMigrationReady(
	dir = process.cwd(),
	options: Options = {},
): void {
	if (options.newSource && options.destination?.pageId)
		throw new Error("newSource cannot be combined with an existing page ID.");
	const scope = config.resolveScopeRoot(dir, options);
	let current = path.resolve(dir);
	for (;;) {
		assertMarker(
			path.join(current, ".grainulator", "evidence"),
			options.destination,
			options.newSource || options.destination?.newSource,
			options.sourceId || options.destination?.sourceId,
		);
		if (fs.realpathSync(current) === fs.realpathSync(scope)) break;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
}
export = { assertRemoteMigrationReady };
