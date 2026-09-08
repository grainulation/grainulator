/**
 * grainulator search — Search claims by topic, type, evidence, or text
 *
 * Parses CLI flags and delegates to searchClaims() from claims-ops.js.
 *
 * Zero npm dependencies.
 */

import { searchClaims, VALID_EVIDENCE, VALID_TYPES } from "./claims-ops.js";

function parseFlag(args, flag) {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

export async function run(dir, args) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`grainulator search — Search claims by topic, type, evidence, or text

Usage:
  grainulator search [options]

Options:
  --topic <slug>     Filter by topic slug
  --type <type>      Filter by claim type: ${VALID_TYPES.join(", ")}
  --evidence <tier>  Filter by evidence tier: ${VALID_EVIDENCE.join(", ")}
  --query <text>     Free-text search in claim content
  --json             Output as JSON
  --help             Show this help

Examples:
  grainulator search                              # all active claims
  grainulator search --topic database-migration   # filter by topic
  grainulator search --type risk                  # all risks
  grainulator search --query "postgres"           # free-text search
  grainulator search --type factual --evidence web --json`);
		return;
	}

	const jsonMode = args.includes("--json");

	const topic = parseFlag(args, "--topic");
	const type = parseFlag(args, "--type");
	const evidence = parseFlag(args, "--evidence");
	const query = parseFlag(args, "--query");

	const result = searchClaims(dir, { topic, type, evidence, query });

	if (result.status === "error") {
		if (jsonMode) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			console.error(`  Error: ${result.message}`);
		}
		process.exit(1);
	}

	if (jsonMode) {
		console.log(JSON.stringify(result, null, 2));
		return;
	}

	if (result.count === 0) {
		console.log("\n  No claims found.\n");
		return;
	}

	console.log(
		`\n  ${result.count} claim${result.count === 1 ? "" : "s"} found:\n`,
	);

	// Table header
	const idW = 10;
	const typeW = 16;
	const topicW = 20;
	const evW = 12;
	console.log(
		`  ${"ID".padEnd(idW)}${"TYPE".padEnd(typeW)}${"TOPIC".padEnd(
			topicW,
		)}${"EVIDENCE".padEnd(evW)}CONTENT`,
	);
	console.log(`  ${"-".repeat(idW + typeW + topicW + evW + 40)}`);

	for (const c of result.claims) {
		const content =
			c.content.length > 50 ? c.content.slice(0, 47) + "..." : c.content;
		console.log(
			`  ${c.id.padEnd(idW)}${c.type.padEnd(typeW)}${c.topic.padEnd(
				topicW,
			)}${c.evidence.padEnd(evW)}${content}`,
		);
	}

	console.log();
}
