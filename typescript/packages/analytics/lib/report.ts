import type { AnalysisSprint, TokenReport } from "./analytics-types.js";
/** Build a portable Markdown retrospective from the existing analytics data. */
export function generateReport(
	sprints: AnalysisSprint[],
	fns: {
		analyzeFn: (sprints: AnalysisSprint[]) => {
			summary: { totalSprints: string | number; totalClaims: string | number };
		};
		calibrateFn: (sprints: AnalysisSprint[]) => unknown;
		patternsFn: (sprints: AnalysisSprint[]) => unknown;
		decayFn: (sprints: AnalysisSprint[]) => unknown;
		velocityFn: (sprints: AnalysisSprint[]) => unknown;
		tokensFn?: (sprints: AnalysisSprint[]) => TokenReport | null;
		wrappedFn?: (
			sprints: AnalysisSprint[],
			opts: { tokenReport: TokenReport | null },
		) => unknown;
	},
) {
	const analysis = fns.analyzeFn(sprints);
	const calibration = fns.calibrateFn(sprints);
	const patterns = fns.patternsFn(sprints);
	const decay = fns.decayFn(sprints);
	const velocity = fns.velocityFn(sprints);
	const tokens = fns.tokensFn ? fns.tokensFn(sprints) : null;
	const wrapped = fns.wrappedFn
		? fns.wrappedFn(sprints, { tokenReport: tokens })
		: null;

	const text = (value: unknown) =>
		String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	const lines = [
		"# Grainulator analytics retrospective",
		"",
		`Generated: ${new Date().toISOString().split("T")[0]}`,
		"",
		`Sprints: ${text(analysis.summary.totalSprints)}`,
		`Claims: ${text(analysis.summary.totalClaims)}`,
		"",
	];
	// Keep the complete analysis payload available to readers and downstream tools.
	// An indented code block cannot be terminated by claim-authored backtick fences.
	for (const [title, data] of [
		["Analysis", analysis],
		["Calibration", calibration],
		["Patterns", patterns],
		["Evidence freshness", decay],
		["Velocity", velocity],
		["Token costs", tokens],
		["Research summary", wrapped],
	]) {
		if (!data) continue;
		lines.push(`## ${title}`, "");
		lines.push(
			...JSON.stringify(data, null, 2)
				.split("\n")
				.map((line) => `    ${line}`),
			"",
		);
	}
	return lines.join("\n");
}
