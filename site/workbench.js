// Old shared research URLs keep working after the home page migration.
if (
	location.hash.startsWith("#q=") ||
	new URLSearchParams(location.search).has("offline")
) {
	location.replace(`/playground/${location.search}${location.hash}`);
}

const byId = (id) => document.getElementById(id);
const stageButtons = [...document.querySelectorAll("[data-stage]")];
const stageCopy = [
	{
		title: "The report is ready",
		explanation: "The report matches the test result that was checked.",
		claim: "The test passed.",
		decision: "Report ready",
	},
	{
		title: "The test result changes",
		explanation:
			"A later test fails. The report still shows the old result, so Grainulator stops it.",
		claim: "The test failed after the latest change.",
		decision: "Update needed",
		reason:
			"The report uses an older test result. Check the evidence again before sharing it.",
	},
	{
		title: "The report can be updated",
		explanation:
			"The report can now include the failed test. This does not mean the release is approved.",
		claim: "The test failed after the latest change.",
		decision: "Report can be updated",
	},
];
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
			const copy = stageCopy[index];
			stageButtons.forEach((button) => {
				button.setAttribute(
					"aria-pressed",
					String(Number(button.dataset.stage) === index),
				);
			});
			byId("decision").textContent = copy.decision;
			byId("decision").dataset.allowed = String(stage.decision.allow);
			byId("stage-title").textContent = copy.title;
			byId("stage-explanation").textContent = copy.explanation;
			byId("claim").textContent = copy.claim;
			byId("compiled-hash").textContent = stage.compiledHash;
			byId("input-hash").textContent = stage.inputHash;
			byId("guard-reason").textContent = copy.reason || "";
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
		byId("decision").textContent = "Example unavailable";
		byId("stage-title").textContent = "The saved example could not load.";
		byId("stage-explanation").textContent = "Reload the page to try again.";
		byId("trace-panel").setAttribute("aria-busy", "false");
	}
}
loadTrace();

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
