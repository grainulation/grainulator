// Old shared research URLs keep working after the home page migration.
if (
	location.hash.startsWith("#q=") ||
	new URLSearchParams(location.search).has("offline")
) {
	location.replace(`/playground/${location.search}${location.hash}`);
}

const byId = (id) => document.getElementById(id);
const stageButtons = [...document.querySelectorAll("[data-stage]")];
async function loadTrace() {
	try {
		const response = await fetch("/handoff-trace.json", {
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) throw new Error("Trace unavailable");
		const trace = await response.json();
		if (
			trace.schema !== "grainulator.handoff-example.v1" ||
			trace.stages.length !== 3
		)
			throw new Error("Invalid trace");
		function selectStage(index) {
			const stage = trace.stages[index];
			stageButtons.forEach((button) => {
				button.setAttribute(
					"aria-pressed",
					String(Number(button.dataset.stage) === index),
				);
			});
			byId("decision").textContent = stage.decision.allow
				? "Brief allowed"
				: "Handoff blocked";
			byId("decision").dataset.allowed = String(stage.decision.allow);
			byId("stage-title").textContent = stage.title;
			byId("stage-explanation").textContent = stage.explanation;
			byId("claim").textContent = stage.claim;
			byId("compiled-hash").textContent = stage.compiledHash;
			byId("input-hash").textContent = stage.inputHash;
			byId("guard-reason").textContent =
				stage.decision.reason ||
				"The checked evidence matches the current content.";
			byId("trace-panel").setAttribute("aria-busy", "false");
		}
		stageButtons.forEach((button) => {
			button.disabled = false;
			button.addEventListener("click", () =>
				selectStage(Number(button.dataset.stage)),
			);
		});
		selectStage(1);
	} catch {
		byId("decision").textContent = "Trace unavailable";
		byId("stage-title").textContent = "The recorded check could not load.";
		byId("stage-explanation").textContent =
			"Reload the page to retry, or reproduce it locally with node scripts/record-handoff.mjs.";
		byId("trace-panel").setAttribute("aria-busy", "false");
	}
}
loadTrace();

const commands = {
	session: {
		command:
			"node bin/grainulator.js research --session session.json --dir ./research-session",
		description:
			"Download session.json from the playground, then run this from your local checkout. Uses your provider key and continues the remaining passes.",
	},
	mcp: {
		command: "node bin/grainulator.js connect --dir /path/to/sprint",
		description:
			"Prints local MCP configuration for your host. This does not change your settings.",
	},
	runner: {
		command: `node bin/grainulator.js run \\\n  --dir /path/to/task-workspace \\\n  --task 'Implement the change and pass the independent checks' \\\n  --adapter /absolute/path/to/agent-wrapper \\\n  --adapter-format text \\\n  --verify '["node","/absolute/path/to/verify-task.mjs"]' \\\n  --max-rounds 3 --timeout-ms 60000`,
		description:
			"Replace the paths with your workspace, agent wrapper, and independent verifier. The wrapper reads stdin and writes its answer to stdout. Checks govern retries; each command has a 60-second timeout.",
	},
};
byId("connection-mode").addEventListener("change", (event) => {
	const selected = commands[event.target.value];
	byId("connect-command").textContent = selected.command;
	byId("connect-description").textContent = selected.description;
	byId("copy-status").textContent = "";
});
byId("copy-command").addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(byId("connect-command").textContent);
		byId("copy-status").textContent =
			"Copied. Replace the example paths before running.";
	} catch {
		byId("copy-status").textContent =
			"Clipboard unavailable. Select and copy the command above.";
	}
});
const motionButton = byId("motion-toggle");
function syncMotionButton() {
	const paused = window.motionTogglePaused;
	document.body.classList.toggle("motion-paused", paused);
	motionButton.setAttribute("aria-pressed", String(paused));
	motionButton.textContent = paused ? "Resume background" : "Pause background";
}
motionButton.addEventListener("click", () => {
	window.motionTogglePaused = !window.motionTogglePaused;
	if (window.motionTogglePaused) window.pauseShader();
	else window.resumeShader();
	syncMotionButton();
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
	"change",
	syncMotionButton,
);
syncMotionButton();
