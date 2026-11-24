// Generated from typescript/lib/maintenance-cli.ts; edit that source and run npm run build:types.
import path from "node:path";
import {
	acceptanceGaps,
	correctClaim,
	duplicateCandidates,
	findingAction,
	inspectEvidence,
	linkPremises,
	listFindings,
	observeExecution,
	observeSource,
	setAcceptance,
} from "../packages/evidence/lib/maintenance.js";
export async function maintenanceCLI(argv) {
	if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
		console.log(`grainulator maintain <action> --dir <sprint> [--json]

  inspect                         Recheck declared premises and current evidence (read-only)
  premises --id ID --premises '["ID"]' --reason TEXT
                                  Bind necessary premises to their current records
  correct --id OLD --new-id NEW --content TEXT --reason TEXT
                                  Preserve OLD and create its stated-tier successor
  source --id ID --file PATH [--start-line N --end-line N] [--replaces OBSERVATION]
                                  Capture a confined local text file/range
  run --id ID --argv '["program","arg"]' --files '["path"]' [--timeout-ms N] [--replaces OBSERVATION]
                                  Execute explicit literal argv and retain a bound receipt
  findings                        Read finding verdicts/resolutions/revisions
  finding --id ID --action verify|resolve|reopen|duplicate --revision N --reason TEXT
          [--verdict confirmed|partial|refuted] [--resolution fixed|already_fixed|wont_fix]
          [--observation ID] [--duplicate-of ID]
  duplicates                      Suggest overlapping current anchors; never merge
  acceptance [--question TEXT] [--done TEXT --reason TEXT]
                                  Inspect missing criteria, or explicitly update them

Paths are relative to the sprint. Read commands launch no process. Mutations use
the ledger lock. run executes with inherited host permissions, without a shell;
it is not a sandbox. Tiers never rise automatically. Exit 2 means re-verification
or a failed run. Source capture permits up to 200 lines of a bounded text file.`);
		return;
	}
	const [action, ...rest] = argv,
		values = new Map();
	const allowed = new Set([
		"--dir",
		"--id",
		"--premises",
		"--reason",
		"--new-id",
		"--content",
		"--file",
		"--start-line",
		"--end-line",
		"--replaces",
		"--argv",
		"--files",
		"--timeout-ms",
		"--action",
		"--revision",
		"--verdict",
		"--resolution",
		"--observation",
		"--duplicate-of",
		"--question",
		"--done",
	]);
	for (let i = 0; i < rest.length; i++) {
		const key = rest[i];
		if (key === "--json") continue;
		const next = rest[i + 1];
		if (
			!allowed.has(key) ||
			values.has(key) ||
			next === undefined ||
			next.startsWith("--")
		)
			throw new Error(`Unknown, repeated or missing option: ${rest[i]}`);
		values.set(key, next);
		i++;
	}
	const value = (key) => values.get(key);
	const number = (key) =>
		value(key) === undefined ? undefined : Number(value(key));
	const directory = value("--dir");
	if (!directory) throw new Error("An explicit --dir <sprint> is required.");
	const dir = path.resolve(directory);
	const args = { claim_id: value("--id"), reason: value("--reason") };
	let result;
	switch (action) {
		case "inspect":
			result = inspectEvidence(dir);
			break;
		case "premises":
			result = linkPremises(dir, {
				...args,
				premises: JSON.parse(value("--premises") || "null"),
			});
			break;
		case "correct":
			result = correctClaim(dir, {
				...args,
				id: value("--new-id"),
				content: value("--content"),
			});
			break;
		case "source":
			result = observeSource(dir, {
				...args,
				path: value("--file"),
				start_line: number("--start-line"),
				end_line: number("--end-line"),
				supersedes: value("--replaces"),
			});
			break;
		case "run":
			result = await observeExecution(dir, {
				...args,
				argv: JSON.parse(value("--argv") || "null"),
				files: JSON.parse(value("--files") || "null"),
				timeout_ms: number("--timeout-ms"),
				supersedes: value("--replaces"),
			});
			break;
		case "findings":
			result = listFindings(dir);
			break;
		case "finding":
			result = findingAction(dir, {
				...args,
				action: value("--action"),
				expected_revision: number("--revision"),
				verdict: value("--verdict"),
				resolution: value("--resolution"),
				observation_id: value("--observation"),
				duplicate_of: value("--duplicate-of"),
			});
			break;
		case "duplicates":
			result = duplicateCandidates(dir);
			break;
		case "acceptance":
			result =
				value("--question") !== undefined || value("--done") !== undefined
					? setAcceptance(dir, {
							question: value("--question"),
							done: value("--done"),
							reason: value("--reason"),
						})
					: acceptanceGaps(dir);
			break;
		default:
			throw new Error("Unknown maintenance action; use maintain --help.");
	}
	console.log(JSON.stringify(result, null, 2));
	if (
		("needs_reverification" in result && result.needs_reverification?.length) ||
		("errors" in result && result.errors?.length) ||
		("check" in result && result.check && result.check.status !== "passed")
	)
		process.exitCode = 2;
}
