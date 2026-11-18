import { spawn } from "node:child_process";
import path from "node:path";
import projectConfig from "../packages/shared/lib/project-config.cjs";
import { installRuntimeAsset, resolveRuntimeAsset } from "./runtime-assets.js";
import {
	detachRuntimeEnrollment,
	enrollRuntime,
	initializeRuntime,
	mutateRuntimeClaim,
	reviewRuntimeMigration,
	rollbackRuntimeEnrollment,
	validateRun,
} from "./runtime-enrollment.js";

const HELP = `grainulator runtime <command> [options]

  init                 Create a new native convergence ledger; changes no host settings
  install              Verify an offline native archive against a separately trusted manifest
  check                Adjudicate the native ledger (--json, --no-state)
  run                  Execute the bounded native convergence driver (--agent, --max-rounds)
  verify               Explicitly execute a declared oracle (--claim, --verifier)
  hook                 Native Stop protocol; empty allow or JSON denial, exit 0
  lessons              Derive candidates from recorded native traces (--markdown)
  claim add|update|supersede
                       Mutate typed native claims with locks and immutable history
  review-migration     Acknowledge inspected run contract; executes no oracle
  enroll               Explicitly register a verified, retained native hook for one host
  rollback             Restore unchanged owned enrollment/settings from its receipt
  detach               Explicitly remove only the owned hook; preserve data and native assets

All workspace commands use --dir <workspace>. Native data is .grainulator/runtime;
root grainulator run keeps the separate JS adapter protocol.

install: --archive <tar.gz> --manifest <release.json> --manifest-sha256 <trusted-pin>
  Obtain the pin independently of the archive. No downloads, Cargo or PATH fallback.
init: [--not-managed] [--run <JSON-object>]
claim add: --id <id> --type <type> --topic <topic> --content <text> --evidence <tier>
  [--tags <comma-list>] [--verified-by <oracle>] [--source-origin <text>]
claim update: --id <id> --patch <JSON-object> [--expected-sha256 <ledger-hash>]
claim supersede: --id <old-id> --by <existing-new-id> [--expected-sha256 <ledger-hash>]
review-migration: --expected-sha256 <inspected-marker-hash>
  Review retained argv/inputs first; converted oracles require explicit strict verification.
enroll: --host claude|codex --config-dir <absolute-dir> --settings-sha256 <hash|absent>
  [--enrollment-sha256 <hash|absent>]. Install the asset into the user cache first.
rollback/detach: --enrollment-sha256 <hash> --settings-sha256 <hash>

Installing the CLI or native archive never registers a host hook. Enrollment remains
pinned through package cleanup/removal; Brew and plugin updates do not move that pin.
Enrollment currently supports one runtime workspace per host settings scope, and
one host settings scope per runtime workspace. Additional active cohorts are
refused before replacing settings. Same-workspace release upgrades use CAS;
retained old assets remain available for an explicit rollback. Changing host
scopes requires a separately reviewed operator handoff.
Local enrollment success does not establish a fresh host loaded the intended build.
Use --json for init/install/claim/review-migration/enroll/rollback/detach results.
`;
function parse(args, allowed) {
	const values = {};
	for (let i = 0; i < args.length; i++) {
		const key = args[i];
		if (!allowed.includes(key))
			throw new Error(`Unknown runtime option: ${key}`);
		if (Object.hasOwn(values, key))
			throw new Error(`Duplicate runtime option: ${key}`);
		if (["--json", "--not-managed"].includes(key)) values[key] = true;
		else {
			const value = args[++i];
			if (value === undefined || value.startsWith("--"))
				throw new Error(`${key} requires a value`);
			values[key] = value;
		}
	}
	return values;
}
async function forwardNative(command, args) {
	const asset = resolveRuntimeAsset();
	const executable = path.join(
		asset.asset_directory,
		`grainulator-runtime-${command}`,
	);
	await new Promise((resolve, reject) => {
		const child = spawn(executable, args, { stdio: "inherit", shell: false });
		const handlers = ["SIGINT", "SIGTERM"].map((signal) => {
			const handler = () => child.kill(signal);
			process.once(signal, handler);
			return [signal, handler];
		});
		const cleanup = () =>
			handlers.forEach(([signal, handler]) => {
				process.removeListener(signal, handler);
			});
		child.once("error", (error) => {
			cleanup();
			reject(error);
		});
		child.once("exit", (code) => {
			cleanup();
			process.exitCode = code ?? 3;
			resolve();
		});
	});
}
export async function runtimeCLI(args) {
	const [command = "help", ...rest] = args;
	const json = args.includes("--json");
	try {
		if (
			["help", "--help", "-h"].includes(command) ||
			rest.includes("--help") ||
			rest.includes("-h")
		) {
			console.log(HELP);
			return;
		}
		if (["check", "run", "verify", "hook", "lessons"].includes(command)) {
			await forwardNative(command, rest);
			return;
		}
		let values, result;
		const workspace = (values) =>
			path.resolve(values["--dir"] || process.cwd());
		if (command === "install") {
			values = parse(rest, [
				"--archive",
				"--manifest",
				"--manifest-sha256",
				"--json",
			]);
			if (!values["--archive"] || !values["--manifest"])
				throw new Error(
					"Install requires an offline archive and independently pinned release manifest",
				);
			result = installRuntimeAsset({
				archive: path.resolve(values["--archive"]),
				manifest: path.resolve(values["--manifest"]),
				trustedManifestSha256: values["--manifest-sha256"],
			});
		} else if (command === "init") {
			values = parse(rest, ["--dir", "--json", "--not-managed", "--run"]);
			const dir = workspace(values);
			projectConfig.assertMigrationReady(dir, { workspace: dir });
			const selected = projectConfig.readSection(dir, "runtime", {
				workspace: dir,
			});
			const run = values["--run"]
				? JSON.parse(values["--run"])
				: selected.value || {};
			validateRun(run);
			result = initializeRuntime(dir, {
				notManaged: Boolean(values["--not-managed"]),
				run,
			});
		} else if (command === "claim") {
			const [operation, ...options] = rest;
			if (!["add", "update", "supersede"].includes(operation))
				throw new Error(
					"Runtime claim operation must be add, update or supersede",
				);
			values = parse(options, [
				"--dir",
				"--json",
				"--id",
				"--type",
				"--topic",
				"--content",
				"--evidence",
				"--tags",
				"--verified-by",
				"--source-origin",
				"--patch",
				"--expected-sha256",
				"--by",
			]);
			if (!values["--id"]) throw new Error("Runtime claim needs --id");
			let claim;
			if (operation === "add") {
				claim = {
					id: values["--id"],
					type: values["--type"],
					topic: values["--topic"],
					content: values["--content"],
					evidence: values["--evidence"],
				};
				if (values["--tags"])
					claim.tags = values["--tags"]
						.split(",")
						.map((tag) => tag.trim())
						.filter(Boolean);
				if (values["--verified-by"])
					claim.verified_by = { verifier: values["--verified-by"] };
				if (values["--source-origin"])
					claim.source = { origin: values["--source-origin"] };
			} else if (operation === "update") {
				if (!values["--patch"])
					throw new Error("Runtime update needs --patch <JSON-object>");
				claim = JSON.parse(values["--patch"]);
			}
			result = mutateRuntimeClaim(workspace(values), operation, claim, {
				id: values["--id"],
				by: values["--by"],
				expectedHash: values["--expected-sha256"],
			});
		} else if (command === "review-migration") {
			values = parse(rest, ["--dir", "--json", "--expected-sha256"]);
			result = reviewRuntimeMigration(
				workspace(values),
				values["--expected-sha256"],
			);
		} else if (command === "enroll") {
			values = parse(rest, [
				"--dir",
				"--json",
				"--host",
				"--config-dir",
				"--settings-sha256",
				"--enrollment-sha256",
			]);
			if (!values["--config-dir"] || !path.isAbsolute(values["--config-dir"]))
				throw new Error(
					"Host configuration directory must be explicit and absolute",
				);
			result = enrollRuntime(workspace(values), {
				host: values["--host"],
				configDirectory: values["--config-dir"],
				expectedSettingsHash: values["--settings-sha256"],
				expectedEnrollmentHash: values["--enrollment-sha256"] || "absent",
			});
		} else if (command === "rollback" || command === "detach") {
			values = parse(rest, [
				"--dir",
				"--json",
				"--settings-sha256",
				"--enrollment-sha256",
			]);
			result = (
				command === "rollback"
					? rollbackRuntimeEnrollment
					: detachRuntimeEnrollment
			)(workspace(values), {
				expectedEnrollmentHash: values["--enrollment-sha256"],
				expectedSettingsHash: values["--settings-sha256"],
			});
		} else throw new Error(`Unknown runtime command: ${command}`);
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		if (json)
			console.log(
				JSON.stringify({
					schema: "grainulator.runtime.error.v1",
					status: "error",
					error: {
						code:
							error.code === "ENOENT" ? "E_RUNTIME_NOT_INSTALLED" : "E_RUNTIME",
						message:
							error.code === "ENOENT"
								? "Required runtime asset or state is missing. Install the matching offline asset or explicitly initialize the selected workspace."
								: error.message,
					},
				}),
			);
		else
			console.error(
				`Grainulator runtime: ${error.code === "ENOENT" ? "Required runtime asset or state is missing. Run grainulator runtime --help for explicit installation and initialization." : error.message}`,
			);
		process.exitCode = 3;
	}
}
