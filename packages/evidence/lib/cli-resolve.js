/**
 * grainulator resolve — Resolve a conflict between two claims
 *
 * Parses CLI flags and delegates to resolveClaim() from claims-ops.js.
 *
 * Zero npm dependencies.
 */

import { resolveClaim } from "./claims-ops.js";

function parseFlag(args, flag) {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

export async function run(dir, args) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`grainulator resolve — Resolve a conflict between two claims

Usage:
  grainulator resolve --winner <id> --loser <id> [options]

Required:
  --winner <id>    ID of the winning claim (stays active)
  --loser <id>     ID of the losing claim (becomes superseded)

Options:
  --reason <text>  Reason for the resolution
  --json           Output as JSON
  --help           Show this help

Examples:
  grainulator resolve --winner r001 --loser r002
  grainulator resolve --winner r001 --loser r002 --reason "r001 has production evidence"
  grainulator resolve --winner r001 --loser r002 --json`);
		return;
	}

	const jsonMode = args.includes("--json");

	const winner = parseFlag(args, "--winner");
	const loser = parseFlag(args, "--loser");
	const reason = parseFlag(args, "--reason");

	const result = resolveClaim(dir, { winner, loser, reason });

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
