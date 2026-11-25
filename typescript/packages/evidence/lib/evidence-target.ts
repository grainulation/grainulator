import fs from "node:fs";
import path from "node:path";
import config from "../../shared/lib/project-config.cjs";

/** Evidence and native execution ledgers are distinct contracts, even with the same basename. */
export function assertEvidenceTarget(dir: string, data?: unknown) {
	const absolute = path.resolve(dir);
	let existing = absolute;
	while (!fs.existsSync(existing) && path.dirname(existing) !== existing)
		existing = path.dirname(existing);
	const targets = [
		absolute,
		path.join(fs.realpathSync(existing), path.relative(existing, absolute)),
	];
	if (
		targets.some((target) =>
			target
				.split(path.sep)
				.some(
					(part, i, parts) =>
						part === ".grainulator" && parts[i + 1] === "runtime",
				),
		) ||
		Array.isArray(data) ||
		(data &&
			typeof data === "object" &&
			(("schema" in data && String(data.schema || "").includes("runtime")) ||
				("schema_version" in data &&
					String(data.schema_version || "").includes("runtime"))))
	) {
		const error = new Error(
			"Native execution ledgers require grainulator runtime claims; evidence operations were not applied.",
		);
		throw Object.assign(error, { code: "E_LEDGER_KIND" });
	}
}
export function assertEvidenceMutation(dir: string, data?: unknown) {
	config.assertMigrationReady(dir);
	assertEvidenceTarget(dir, data);
}
