// Generated from typescript/packages/evidence/lib/compiler.ts; edit that source and run npm run build:types.
/**
 * grainulator compile — delegates to evidence-compiler.js via direct import
 *
 * Calls the compiler's exported compile() function directly instead of
 * spawning a subprocess. This eliminates a child_process dependency
 * and avoids Socket.dev shell-access alerts.
 *
 * Zero npm dependencies.
 */
import fs from "fs";
import path from "path";
import projectConfig from "../../shared/lib/project-config.cjs";
import { compile } from "../compiler/evidence-compiler.js";
import nextActionsModule from "./next-actions.cjs";
export async function run(dir, args) {
	const config = projectConfig.evidenceConfig(dir);
	const claimsPath = path.resolve(config.origin, config.compiler.claims);
	const compilationPath = path.resolve(
		config.origin,
		config.compiler.compilation,
	);
	if (!fs.existsSync(claimsPath)) {
		throw new Error("No evidence ledger found. Run grainulator init first.");
	}
	const summaryMode = args.includes("--summary");
	const checkMode = args.includes("--check");
	const result = compile(claimsPath, compilationPath, dir);
	if (args.includes("--json")) {
		console.log(JSON.stringify(result, null, 2));
	} else if (summaryMode) {
		const active = result.resolved_claims?.length || 0;
		const topics = Object.keys(result.coverage || {});
		console.log(`  Status: ${result.status}`);
		console.log(`  Claims: ${active} active`);
		console.log(`  Topics: ${topics.length} (${topics.join(", ")})`);
		if (result.errors?.length > 0) {
			console.log(`  Errors: ${result.errors.length}`);
			for (const e of result.errors) {
				console.log(`    - ${e.message}`);
			}
		}
		if (result.warnings?.length > 0) {
			console.log(`  Warnings: ${result.warnings.length}`);
			for (const w of result.warnings) {
				console.log(`    - ${w.message}`);
			}
		}
	}
	if (!args.includes("--json") && !args.includes("--quiet"))
		console.log(nextActionsModule.formatNextActions(result.next_actions));
	if (checkMode && result.status === "blocked") {
		process.exit(1);
	}
}
