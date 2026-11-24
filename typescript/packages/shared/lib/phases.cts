/**
 * phases.cjs — CommonJS mirror of lib/phases.js.
 */

const PHASE_PREFIXES: Readonly<Record<string, string>> = Object.freeze({
	cal: "calibration",
	burn: "control-burn",
	d: "define",
	r: "research",
	p: "prototype",
	e: "evaluate",
	f: "feedback",
	x: "challenge",
	w: "witness",
});

const PHASE_NAMES = Object.freeze([
	"define",
	"research",
	"prototype",
	"evaluate",
	"feedback",
	"challenge",
	"witness",
	"calibration",
	"control-burn",
]);

function isValidPhase(phase: string) {
	return PHASE_NAMES.includes(phase);
}

function phaseFromClaimId(claimId: unknown): string | null {
	if (typeof claimId !== "string" || !claimId.length) return null;
	const multi = ["burn", "cal"];
	for (const p of multi) {
		if (claimId.startsWith(p)) {
			return PHASE_PREFIXES[p] || null;
		}
	}
	const firstChar = claimId[0] ?? "";
	return PHASE_PREFIXES[firstChar] || null;
}

function prefixForPhase(phase: string): string | null {
	for (const [prefix, name] of Object.entries(PHASE_PREFIXES)) {
		if (name === phase) return prefix;
	}
	return null;
}

export = {
	PHASE_PREFIXES,
	PHASE_NAMES,
	isValidPhase,
	phaseFromClaimId,
	prefixForPhase,
};
