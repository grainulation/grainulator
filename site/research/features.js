import { claimsDocument, evidenceReport } from "./evidence.js";
import { passNames } from "./session.js";
export const FEATURES = [
	{
		id: "challenge",
		key: "challenge",
		title: "Challenge findings",
		summary: "Pressure-test the answer before you use it.",
		detail:
			"Adds one model pass to question assumptions, compare conflicting evidence, and identify what could change the conclusion. The same selected model performs the review; agreement is not independent verification.",
		checked: true,
	},
	{
		id: "blind-spots",
		key: "blindSpots",
		title: "Find blind spots",
		summary: "Explore what the research has missed.",
		detail:
			"Adds one model pass looking for missing stakeholders, alternatives, edge cases, and unanswered questions. Its findings feed the brief and, when enabled, the claims ledger.",
	},
	{
		id: "ledger",
		key: "ledger",
		title: "Build a claims ledger",
		summary: "Separate facts, constraints, risks, and advice.",
		detail:
			"Adds one model pass that organizes findings into typed claims, source links, and explicit conflicts. Grainulator validates the structure. Export claims.json to use the evidence compiler. Every model-generated claim starts at the stated evidence tier, even when it includes a link.",
	},
	{
		id: "evidence-gate",
		key: "evidenceGate",
		title: "Gate the brief on evidence",
		summary: "Stop when the ledger leaves evidence gaps.",
		detail:
			"Requires the claims ledger. Before synthesis, code checks that at least one factual claim exists, every factual claim has a source URL, and no claim flags an unresolved conflict. Adds no model call. It checks the extracted ledger, not whether links are true or complete. A blocked run keeps its research; add context and run again, or turn off the gate.",
	},
];
export function mountFeatures() {
	const target = document.getElementById("features");
	for (const feature of FEATURES) {
		const row = document.createElement("div");
		row.className = "feature-row";
		const label = document.createElement("label");
		const input = document.createElement("input");
		input.type = "checkbox";
		input.id = feature.id;
		input.checked = input.defaultChecked = Boolean(feature.checked);
		const copy = document.createElement("span");
		const title = document.createElement("span");
		title.textContent = feature.title;
		const summary = document.createElement("small");
		summary.textContent = feature.summary;
		summary.id = `${feature.id}-summary`;
		input.setAttribute("aria-describedby", summary.id);
		copy.append(title, summary);
		label.append(input, copy);
		const info = document.createElement("button");
		info.type = "button";
		info.className = "feature-info";
		info.textContent = "i";
		info.setAttribute("aria-label", `About ${feature.title.toLowerCase()}`);
		info.setAttribute("aria-expanded", "false");
		info.setAttribute("aria-controls", `${feature.id}-help`);
		const panel = document.createElement("p");
		panel.id = `${feature.id}-help`;
		panel.className = "feature-help";
		panel.hidden = true;
		panel.textContent = feature.detail;
		info.addEventListener("click", () => {
			const opening = panel.hidden;
			closeHelp();
			panel.hidden = !opening;
			info.setAttribute("aria-expanded", String(opening));
		});
		row.append(label, info, panel);
		target.append(row);
	}
	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape") return;
		const opened = target.querySelector('[aria-expanded="true"]');
		if (opened) {
			closeHelp();
			opened.focus();
		}
	});
	document.addEventListener("click", (event) => {
		if (!event.target.closest(".feature-row")) closeHelp();
	});
	function closeHelp() {
		target.querySelectorAll(".feature-help").forEach((panel) => {
			panel.hidden = true;
		});
		target.querySelectorAll(".feature-info").forEach((button) => {
			button.setAttribute("aria-expanded", "false");
		});
	}
}
export function featureConfig() {
	return Object.fromEntries(
		FEATURES.map((f) => [f.key, document.getElementById(f.id).checked]),
	);
}
export function featureUI(config) {
	document.getElementById("evidence-gate").disabled = !config.ledger;
	const passes = passNames(config);
	document.getElementById("workflow-summary").textContent =
		`${passes.length} model passes${config.evidenceGate ? " + an evidence gate" : ""}. Extra passes take more time and use more tokens.`;
	document.querySelectorAll("[data-pass]").forEach((item) => {
		item.hidden = !passes.includes(item.dataset.pass);
	});
}
export function renderLedger(target, session) {
	const report = evidenceReport(session);
	const summary = document.createElement("p");
	summary.className = "notice";
	summary.textContent = `${report.claims.length} claims · ${report.linked}/${report.factual} factual claims have source links · ${report.conflicts.length} flagged conflicts. All claims need verification.`;
	target.append(summary);
	for (const c of report.claims) {
		const item = document.createElement("div");
		item.className = "claim-item";
		const label = document.createElement("p");
		label.className = "eyebrow";
		label.textContent = `${c.id} / ${c.type} / stated`;
		const content = document.createElement("p");
		content.textContent = c.content;
		item.append(label, content);
		if (c.conflicts_with.length) {
			const conflict = document.createElement("p");
			conflict.className = "field-note";
			conflict.textContent = `Conflicts with ${c.conflicts_with.join(", ")}`;
			item.append(conflict);
		}
		for (const url of c.sources) {
			const a = document.createElement("a");
			a.href = url;
			a.textContent = url;
			item.append(a);
		}
		target.append(item);
	}
}
export function renderGate(session) {
	const target = document.getElementById("evidence-status");
	const report = session && evidenceReport(session);
	target.hidden = !report;
	if (report) {
		target.classList.toggle("error", !report.passed);
		target.textContent = `${session.config.evidenceGate ? "Evidence gate" : "Ledger checks · gate off"}: ${report.passed ? "source-link and conflict checks passed. Source truth still needs verification." : report.issues.join(" ")}`;
	}
	document.getElementById("export-claims").hidden = !report;
}
export { claimsDocument };
