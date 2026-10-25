/**
 * grainulator add — Add a typed claim to the sprint
 *
 * Parses CLI flags and delegates to addClaim() from claims-ops.js.
 *
 * Zero npm dependencies.
 */

import fs from "node:fs";
import { addClaim, VALID_EVIDENCE, VALID_TYPES } from "./claims-ops.js";
import { PASSAGE_MAX_BYTES } from "./passages.js";

function parseFlag(args, flag) {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

// Reads a regular file of at most PASSAGE_MAX_BYTES as UTF-8 text.
function readPassageFile(file) {
	const st = fs.statSync(file);
	if (!st.isFile()) throw new Error(`--passage-file ${file} is not a regular file.`);
	if (st.size > PASSAGE_MAX_BYTES)
		throw new Error(
			`--passage-file ${file} is ${st.size} bytes; the limit is ${PASSAGE_MAX_BYTES}.`,
		);
	return fs.readFileSync(file, "utf8");
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
  --witnessed-claim <id>       Claim this finding corroborates or contradicts
  --relationship <kind>        full_support, partial_support or contradicts
  --quote <text>               Exact sentence the finding relies on (needs a passage)
  --passage-file <path>        File holding the paragraph that contains the quote
  --passage-sha256 <hex>       Digest of a passage already stored in this sprint
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
	const witnessed_claim = parseFlag(args, "--witnessed-claim");
	const relationship = parseFlag(args, "--relationship");
	const quote = parseFlag(args, "--quote");
	const passage_sha256 = parseFlag(args, "--passage-sha256");
	const passageFile = parseFlag(args, "--passage-file");
	let passage;
	if (passageFile !== undefined) {
		try {
			passage = readPassageFile(passageFile);
		} catch (err) {
			console.error(`  Error: ${err.message}`);
			process.exitCode = 1;
			return;
		}
	}
	const optional = Object.fromEntries(
		Object.entries({
			witnessed_claim,
			relationship,
			quote,
			passage,
			passage_sha256,
		}).filter(([, value]) => value !== undefined),
	);
	const source =
		origin !== undefined ||
		artifact !== undefined ||
		connector !== undefined ||
		Object.keys(optional).length
			? { origin, artifact, connector, ...optional }
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
