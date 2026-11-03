// Provider-independent checks. Source links and model classifications are not verification.
const TYPES = [
	"constraint",
	"factual",
	"estimate",
	"risk",
	"recommendation",
	"feedback",
];
export function readLedger(output) {
	let raw;
	try {
		raw = JSON.parse(
			output.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1"),
		);
	} catch {
		throw Error(
			"The claims pass did not return valid JSON. Continue to retry that pass.",
		);
	}
	if (
		!Array.isArray(raw.claims) ||
		!raw.claims.length ||
		raw.claims.length > 24
	)
		throw Error(
			"The ledger must contain 1–24 claims. Continue to retry the claims pass.",
		);
	const ids = new Set();
	const claims = raw.claims.map((c) => {
		if (
			!c ||
			typeof c.id !== "string" ||
			!/^r\d{3}$/.test(c.id) ||
			ids.has(c.id) ||
			!TYPES.includes(c.type) ||
			typeof c.content !== "string" ||
			!c.content.trim() ||
			c.content.length > 6000 ||
			typeof c.topic !== "string" ||
			!c.topic.trim() ||
			c.topic.length > 120
		)
			throw Error(
				"The claims pass returned an invalid or duplicate claim. Continue to retry it.",
			);
		ids.add(c.id);
		if (
			!Array.isArray(c.sources) ||
			c.sources.length > 20 ||
			!Array.isArray(c.conflicts_with) ||
			c.conflicts_with.length > 23
		)
			throw Error(
				"Each claim needs source and conflict lists. Continue to retry the claims pass.",
			);
		const sources = c.sources.flatMap((value) => {
			try {
				const url = new URL(value);
				return ["http:", "https:"].includes(url.protocol) &&
					!url.username &&
					!url.password
					? [url.href]
					: [];
			} catch {
				return [];
			}
		});
		return {
			id: c.id,
			type: c.type,
			topic: c.topic.trim(),
			content: c.content.trim(),
			sources: [...new Set(sources)],
			conflicts_with: [...new Set(c.conflicts_with)],
		};
	});
	for (const c of claims)
		if (c.conflicts_with.some((id) => !ids.has(id) || id === c.id))
			throw Error(
				"The ledger references an unknown or self-conflicting claim. Continue to retry the claims pass.",
			);
	return claims;
}
export function evidenceReport(session) {
	const step = session.steps.find((s) => s.pass === "ledger");
	if (!step) return null;
	const claims = readLedger(step.text);
	const factual = claims.filter((c) => c.type === "factual");
	const missing = factual.filter((c) => !c.sources.length).map((c) => c.id);
	const conflicts = [
		...new Set(
			claims.flatMap((c) =>
				c.conflicts_with.map((id) => [c.id, id].sort().join(" ↔ ")),
			),
		),
	];
	const issues = [];
	if (!factual.length)
		issues.push("No factual claims were extracted to check.");
	if (missing.length)
		issues.push(`Factual claims without source links: ${missing.join(", ")}.`);
	if (conflicts.length)
		issues.push(`Unresolved conflicts: ${conflicts.join(", ")}.`);
	return {
		claims,
		factual: factual.length,
		linked: factual.length - missing.length,
		conflicts,
		issues,
		passed: issues.length === 0,
	};
}
export function claimsDocument(session) {
	const report = evidenceReport(session);
	if (!report)
		throw Error("Run the claims ledger pass before exporting claims.");
	return {
		schema_version: "1.0",
		meta: {
			question: session.question,
			audience: ["Research session owner"],
			phase: "research",
			connectors: [],
		},
		claims: report.claims.map((c) => ({
			id: c.id,
			type: c.type,
			topic: c.topic,
			content: c.content,
			source: {
				origin: "model",
				artifact: "session.json",
				connector: session.config.provider,
				urls: c.sources,
			},
			evidence: "stated",
			status: "active",
			phase_added: "research",
			conflicts_with: c.conflicts_with,
			resolved_by: null,
			tags: ["needs-verification"],
		})),
	};
}
