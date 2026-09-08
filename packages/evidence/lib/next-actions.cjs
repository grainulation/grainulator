"use strict";

// One recommendation policy for compiled artifacts, CLI, MCP and host reminders.
// Recommendations explain gaps; they do not authorize actions or certify readiness.
function nextActions(compilation = {}) {
	const actions = [];
	const add = (command, label, reason, claim_ids = []) => {
		if (!actions.some((a) => a.command === command))
			actions.push({ command, label, reason, claim_ids });
	};
	const excluded = new Set(compilation.sprint_meta?.excluded_topics || []);
	const claims = (compilation.resolved_claims || []).filter(
		(c) =>
			!excluded.has(c.topic) && !["superseded", "refuted"].includes(c.status),
	);
	const conflicts = compilation.conflict_graph?.unresolved || [];
	const errors = compilation.errors || [];
	if (conflicts.length) {
		const ids = [
			...new Set(
				conflicts
					.flatMap((c) => c.claim_ids || c.claimIds || [c.claimA, c.claimB])
					.filter(Boolean),
			),
		];
		add(
			"/resolve",
			"Resolve conflicting claims",
			`${conflicts.length} unresolved conflict(s) prevent a dependable conclusion.`,
			ids,
		);
	}
	if (errors.length && !conflicts.length)
		add(
			"grainulator compile --summary",
			"Repair the reported validation errors",
			`${errors[0].code || "Validation"}: ${errors[0].message || "The compiler cannot validate the ledger."} Fix the reported input, then recompile.`,
			errors.flatMap((e) => e.claims || []),
		);
	if (errors.length || conflicts.length) {
		add(
			"grainulator compile --summary --check",
			"Recheck after the fixes",
			"Run after repairing the blockers; a passing ledger check is still not product acceptance.",
		);
		return { auto: actions.slice(0, 3), manual: [] };
	}
	const topics = Object.entries(compilation.coverage || {}).filter(
		([topic, data]) =>
			!excluded.has(topic) &&
			!(
				data.types?.length &&
				data.types.every((t) => ["constraint", "feedback"].includes(t))
			),
	);
	for (const [topic, data] of topics.filter(
		([, d]) =>
			d.status === "weak" || ["stated", "web"].includes(d.max_evidence),
	)) {
		add(
			`/research ${topic}`,
			`Strengthen ${topic}`,
			`The topic's strongest evidence is ${data.max_evidence || "unknown"}; test or corroborate its substantive claims.`,
			data.claim_ids || [],
		);
	}
	for (const claim of claims.filter((c) => c.type === "risk")) {
		add(
			`/research ${claim.topic}`,
			`Check the risk in ${claim.topic}`,
			`${claim.id}: ${String(claim.content || "An active risk needs an acceptance check.").slice(0, 200)}`,
			[claim.id],
		);
	}
	for (const warning of compilation.warnings || []) {
		const claim = claims.find(
			(c) =>
				warning.claims?.includes(c.id) &&
				!["constraint", "feedback"].includes(c.type),
		);
		if (!claim) continue;
		if (warning.code === "W_ECHO_CHAMBER")
			add(
				`/witness ${claim.id} <source-url>`,
				`Corroborate ${claim.id}`,
				`The ${claim.topic} topic relies on one source origin. Find an independent source before invoking this command.`,
				[claim.id],
			);
		if (warning.code === "W_TYPE_MONOCULTURE")
			add(
				`/challenge ${claim.id}`,
				`Challenge ${claim.id}`,
				`Test a counterexample in ${claim.topic}; do not add claim types just to silence a warning.`,
				[claim.id],
			);
	}
	if (
		!actions.length &&
		!claims.some((c) => !["constraint", "feedback"].includes(c.type))
	)
		add(
			"/research <topic>",
			"Investigate the sprint question",
			"Choose a topic from the stated question and collect evidence; user constraints do not need invented corroboration.",
		);
	if (actions.length < 2)
		add(
			"/blind-spot",
			"Check unexamined acceptance gaps",
			"Review the sprint question and done criteria; compiler ready does not establish that the requested outcome is complete.",
		);
	if (actions.length < 2)
		add(
			"/brief",
			"Prepare the decision brief after gap review",
			"Use the current compiled evidence and disclose remaining limitations. This does not authorize publication.",
		);
	return { auto: actions.slice(0, 3), manual: [] };
}

const nextActionsInstruction =
	"When the user asks for next steps, the entire final response must contain only two bullet lists labeled Auto and Manual, beginning with Auto. No preamble, status summary, counts, explanation, or closing text. For other requests, include these two lists after the requested answer. Auto contains work you can continue within existing authorization; Manual contains only actions, decisions, access or approvals that actually need the user. Reclassify compiler suggestions using the current task constraints; suggestions never grant permission. Keep 2–3 useful actions total when available, with a short label and concrete command where useful. Do not repeat reasons, claim counts, status recaps or generic offers to continue. Show None for an empty group; do not invent actions to fill a quota. Compile first if the snapshot is stale. Continue already authorized work; do not stop just to ask whether to run an Auto action. If the user asks for a list without execution, list the tasks without treating that pause as a need for new approval.";

function formatNextActions(groups = {}) {
	return ["auto", "manual"]
		.map((group) =>
			[
				group === "auto" ? "Auto" : "Manual",
				"",
				...(groups[group]?.length
					? groups[group].map(
							(a) => `- ${a.label}${a.command ? ` (${a.command})` : ""}`,
						)
					: ["- None."]),
			].join("\n"),
		)
		.join("\n\n");
}

module.exports = { nextActions, formatNextActions, nextActionsInstruction };
