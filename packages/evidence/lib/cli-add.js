/**
 * grainulator add — Add a typed claim to the sprint
 *
 * Parses CLI flags and delegates to addClaim() from claims-ops.js.
 *
 * Zero npm dependencies.
 */

import { addClaim, VALID_EVIDENCE, VALID_TYPES } from "./claims-ops.js";

function parseFlag(args, flag) {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

export async function run(dir, args) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`grainulator add — Add a typed claim to the sprint

Usage:
  grainulator add --id <id> --type <type> --topic <topic> --content <content> [options]

Required:
  --id <id>          Claim ID (e.g., r001, x001, d001)
  --type <type>      Claim type: ${VALID_TYPES.join(", ")}
  --topic <topic>    Topic slug (e.g., database-migration)
  --content <text>   The claim content

Options:
  --evidence <tier>  Evidence tier: ${VALID_EVIDENCE.join(
		", ",
	)} (default: stated)
  --tags <list>      Comma-separated tags (e.g., perf,postgres)
  --source-origin <name>       Publisher, repository, test suite, or stakeholder
  --source-artifact <ref>      Source URL or local evidence reference
  --source-connector <name>    Optional source connector
  --conflicts-with <ids>       Comma-separated conflicting claim IDs
  --calibration <json>         Structured prediction_id, verdict, outcome, optional delta
  --json             Output as JSON
  --help             Show this help

Examples:
  grainulator add --id r001 --type factual --topic database-migration \\
    --content "PostgreSQL supports partial indexes" \\
    --evidence documented --tags perf,postgres

  grainulator add --id r002 --type risk --topic db --content "Migration needs downtime" --json`);
		return;
	}

	const jsonMode = args.includes("--json");

	const id = parseFlag(args, "--id");
	const type = parseFlag(args, "--type");
	const topic = parseFlag(args, "--topic");
	const content = parseFlag(args, "--content");
	const evidence = parseFlag(args, "--evidence");
	const tagsRaw = parseFlag(args, "--tags");
	const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()) : undefined;

	const origin = parseFlag(args, "--source-origin");
	const artifact = parseFlag(args, "--source-artifact");
	const connector = parseFlag(args, "--source-connector");
	const source =
		origin !== undefined || artifact !== undefined || connector !== undefined
			? { origin, artifact, connector }
			: undefined;
	const conflictsRaw = parseFlag(args, "--conflicts-with");
	const conflicts_with = conflictsRaw
		? conflictsRaw.split(",").map((value) => value.trim())
		: undefined;
	let calibration;
	const calibrationJson = parseFlag(args, "--calibration");
	if (calibrationJson !== undefined) {
		try {
			calibration = JSON.parse(calibrationJson);
		} catch {
			console.error("Invalid --calibration JSON");
			process.exitCode = 1;
			return;
		}
	}
	const result = addClaim(dir, {
		calibration,
		id,
		type,
		topic,
		content,
		evidence,
		tags,
		source,
		conflicts_with,
	});

	if (jsonMode) {
		console.log(JSON.stringify(result, null, 2));
		if (result.status !== "ok") process.exitCode = 1;
	} else if (result.status === "ok") {
		console.log(`  ${result.message}`);
	} else {
		console.error(`  Error: ${result.message}`);
		process.exit(1);
	}
}
