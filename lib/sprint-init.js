import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { compile } from "../packages/evidence/compiler/wheat-compiler.js";
import nextActionsModule from "../packages/evidence/lib/next-actions.cjs";
import { atomicWriteJSON } from "../packages/shared/lib/atomic.js";
import { withFileTransaction } from "../packages/shared/lib/transaction.js";

/** Canonical initialization changes sprint data only, never host or Git settings. */
export function initializeSprint(dir, args = {}) {
	try {
		for (const key of ["question", "audience", "constraints", "done"])
			if (args[key] !== undefined && typeof args[key] !== "string")
				throw new Error(`${key} must be a string.`);
		if (!args.question?.trim())
			throw new Error(
				'A research question is required. Use grainulator init --question "Your question".',
			);
		if (args.force !== undefined && typeof args.force !== "boolean")
			throw new Error("force must be a boolean.");
		const directory = path.resolve(dir);
		fs.mkdirSync(directory, { recursive: true });
		const claimsPath = path.join(directory, "claims.json");
		return withFileTransaction(claimsPath, () => {
			if (fs.existsSync(claimsPath) && !args.force)
				return {
					status: "error",
					message:
						"Sprint already exists. Continue with compile, or explicitly set force to reinitialize.",
				};
			const timestamp = new Date().toISOString();
			const constraints = (args.constraints || "")
				.split(";")
				.map((s) => s.trim())
				.filter((s) => s && s.toLowerCase() !== "none");
			const claims = constraints.map((content, index) => ({
				id: `d${String(index + 1).padStart(3, "0")}`,
				type: "constraint",
				topic: "sprint-scope",
				content,
				evidence: "stated",
				source: { origin: "stakeholder", artifact: null, connector: null },
				status: "active",
				phase_added: "define",
				timestamp,
				conflicts_with: [],
				resolved_by: null,
				tags: [],
			}));
			if (args.done?.trim())
				claims.push({
					id: `d${String(claims.length + 1).padStart(3, "0")}`,
					type: "constraint",
					topic: "done-criteria",
					content: `Done looks like: ${args.done.trim()}`,
					evidence: "stated",
					source: { origin: "stakeholder", artifact: null, connector: null },
					status: "active",
					phase_added: "define",
					timestamp,
					conflicts_with: [],
					resolved_by: null,
					tags: ["done-criteria"],
				});
			const ledger = {
				schema_version: "1.0",
				meta: {
					question: args.question.trim(),
					initiated: timestamp.slice(0, 10),
					audience: (args.audience || "self")
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean),
					phase: "define",
					connectors: [],
				},
				claims,
			};
			let backup;
			if (fs.existsSync(claimsPath)) {
				backup = `${claimsPath}.${randomUUID()}.bak`;
				fs.copyFileSync(claimsPath, backup, fs.constants.COPYFILE_EXCL);
			}
			atomicWriteJSON(claimsPath, ledger, 2);
			const compilation = compile(
				claimsPath,
				path.join(directory, "compilation.json"),
				directory,
				{ skipSprintDetection: true },
			);
			return {
				status: "ok",
				directory,
				claims_seeded: claims.length,
				files_created: ["claims.json", "compilation.json"],
				...(backup ? { backup } : {}),
				next_actions: compilation.next_actions,
				next_actions_instruction: nextActionsModule.nextActionsInstruction,
				output: nextActionsModule.formatNextActions(compilation.next_actions),
			};
		});
	} catch (error) {
		return { status: "error", message: error.message };
	}
}
