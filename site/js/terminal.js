/* ======================================================
   GRAINULATOR — Terminal Demo Engine
   Typewriter, step renderer, sprint runner, skip/pause.
   ====================================================== */

var currentScript = null;
var stepIndex = 0;
var timeoutId = null;
var paused = false;
var finished = false;
var terminalActive = false;
var demosWatched = 0;
var previouslyFocusedEl = null;

var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ======================================================
   FOCUS TRAP — keep Tab within the terminal overlay
   ====================================================== */
function trapFocus(e) {
  if (e.key !== "Tab" || !terminalActive) return;
  var termOverlay = document.getElementById("terminal-overlay");
  var focusable = termOverlay.querySelectorAll(
    'button:not([hidden]):not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
document.addEventListener("keydown", trapFocus);

/* ======================================================
   SELECT A PROMPT
   ====================================================== */
function selectPrompt(key, text) {
  var termOverlay = document.getElementById("terminal-overlay");
  var selectedPromptEl = document.getElementById("selected-prompt");
  var termBody = document.getElementById("terminal-body");
  var sprintDone = document.getElementById("sprint-done");
  var gameTerminal = document.getElementById("game-terminal");
  var btnDismiss = document.getElementById("btn-dismiss");
  var pondHint = document.getElementById("pond-hint");

  previouslyFocusedEl = document.activeElement;
  terminalActive = true;

  if (pondHint) pondHint.style.display = "none";

  termOverlay.classList.add("active");
  selectedPromptEl.textContent = "\u201c" + text + "\u201d";
  setTimeout(function () {
    selectedPromptEl.classList.add("visible");
  }, 50);

  termBody.innerHTML = "";
  sprintDone.classList.remove("visible");
  gameTerminal.classList.remove("victory", "challenge-flash");
  btnDismiss.hidden = true;

  runSprint(key);

  setTimeout(function () {
    var firstBtn = termOverlay.querySelector("button:not([hidden]):not([disabled])");
    if (firstBtn) firstBtn.focus();
  }, 100);
}

/* ======================================================
   DISMISS TERMINAL
   ====================================================== */
function dismissTerminal() {
  var termOverlay = document.getElementById("terminal-overlay");
  var selectedPromptEl = document.getElementById("selected-prompt");
  var gameTerminal = document.getElementById("game-terminal");
  var pondHint = document.getElementById("pond-hint");

  if (timeoutId) clearTimeout(timeoutId);
  terminalActive = false;
  finished = true;
  paused = false;
  currentScript = null;
  clickedFishIndex = -1;
  clickedFishAnim = 0;
  gameTerminal.classList.remove("victory", "challenge-flash");

  termOverlay.classList.remove("active");
  selectedPromptEl.classList.remove("visible");

  if (pondHint) pondHint.style.display = "";

  if (previouslyFocusedEl && typeof previouslyFocusedEl.focus === "function") {
    previouslyFocusedEl.focus();
    previouslyFocusedEl = null;
  }
}

/* ======================================================
   TYPEWRITER
   ====================================================== */
function typewrite(el, text, charDelay, callback) {
  if (prefersReduced) {
    el.textContent = text;
    if (callback) callback();
    return;
  }
  var i = 0;
  function tick() {
    if (i < text.length) {
      el.textContent += text[i]; i++;
      timeoutId = setTimeout(tick, charDelay);
    } else {
      if (callback) callback();
    }
  }
  tick();
}

/* ======================================================
   RENDER A STEP
   ====================================================== */
function renderStep(step, callback) {
  var termBody = document.getElementById("terminal-body");
  var gameTerminal = document.getElementById("game-terminal");
  var termStatus = document.getElementById("terminal-status-text");
  var terminalLive = document.getElementById("terminal-live");

  var div = document.createElement("div");
  div.className = "t-line";

  if (step.type === "blank") {
    div.innerHTML = "&nbsp;";
    termBody.appendChild(div);
    timeoutId = setTimeout(callback, prefersReduced ? 0 : 100);
    return;
  }

  if (step.type === "cmd") {
    div.classList.add("t-mt", "phase-pulse");
    var promptSpan = document.createElement("span");
    promptSpan.className = "c-dim";
    promptSpan.textContent = "$ ";
    div.appendChild(promptSpan);
    var cmdSpan = document.createElement("span");
    cmdSpan.className = "c-lime";
    div.appendChild(cmdSpan);
    termBody.appendChild(div);
    scrollTerminal();
    if (terminalLive) terminalLive.textContent = "Running: " + step.text;
    typewrite(cmdSpan, step.text, step.delay, callback);
    return;
  }

  if (step.type === "line") {
    if (!prefersReduced && step.html.indexOf("tag ") !== -1) {
      div.classList.add("slide-in");
    }
    div.innerHTML = step.html;
    termBody.appendChild(div);
    scrollTerminal();
    if (terminalLive) {
      var tmp = document.createElement("div");
      tmp.innerHTML = step.html;
      terminalLive.textContent = tmp.textContent;
    }
    timeoutId = setTimeout(callback, prefersReduced ? 0 : step.delay);
    return;
  }

  if (step.type === "challenge") {
    div.className = "t-line t-challenge";
    div.innerHTML = step.html;
    div.setAttribute("role", "alert");
    termBody.appendChild(div);
    scrollTerminal();
    if (!prefersReduced) {
      gameTerminal.classList.add("challenge-flash");
      setTimeout(function () { gameTerminal.classList.remove("challenge-flash"); }, 600);
    }
    if (step.strikeId) {
      var el = document.getElementById(step.strikeId);
      if (el) el.classList.add("t-struck");
    }
    if (termStatus) termStatus.textContent = "challenging";
    if (terminalLive) terminalLive.textContent = "Challenge fired. Estimate revised.";
    timeoutId = setTimeout(callback, prefersReduced ? 0 : step.delay);
    return;
  }

  if (step.type === "bar") {
    div.innerHTML =
      '<div class="bar-row">' +
      '<span class="bar-label">' + step.label + '</span>' +
      '<div class="bar-track" role="progressbar" aria-valuenow="' + step.pct +
      '" aria-valuemin="0" aria-valuemax="100" aria-label="' + step.label + ' coverage: ' + step.pct + '%">' +
      '<div class="bar-fill ' + step.cls + '" style="--target-w:' + step.pct + '%"></div></div>' +
      '<span class="bar-pct ' + step.color + '" aria-hidden="true">' + step.pct + '%</span></div>';
    termBody.appendChild(div);
    scrollTerminal();
    var fill = div.querySelector(".bar-fill");
    if (fill) {
      if (prefersReduced) {
        fill.style.width = step.pct + "%";
      } else {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { fill.style.width = step.pct + "%"; });
        });
      }
    }
    timeoutId = setTimeout(callback, prefersReduced ? 0 : step.delay);
    return;
  }

  if (step.type === "pass") {
    div.classList.add("t-mt");
    div.innerHTML = '<span class="t-pass victory-scale">' + step.text + '</span>';
    termBody.appendChild(div);
    scrollTerminal();
    if (!prefersReduced) {
      gameTerminal.classList.add("victory");
      var rect = gameTerminal.getBoundingClientRect();
      burstParticles(rect.left + rect.width / 2, rect.top, 12, 191, 255, 0, 2.5, 1, 2);
    }
    if (termStatus) termStatus.textContent = "complete";
    if (terminalLive) terminalLive.textContent = "Sprint complete. Brief ready.";
    timeoutId = setTimeout(callback, prefersReduced ? 0 : step.delay);
    return;
  }
}

function scrollTerminal() {
  var termBody = document.getElementById("terminal-body");
  termBody.scrollTop = termBody.scrollHeight;
}

/* ======================================================
   RUN SPRINT
   ====================================================== */
function runSprint(scriptKey) {
  var termStatus = document.getElementById("terminal-status-text");
  var btnSkip = document.getElementById("btn-skip");
  var btnPause = document.getElementById("btn-pause");
  var btnDismiss = document.getElementById("btn-dismiss");
  var sprintDone = document.getElementById("sprint-done");
  var termBody = document.getElementById("terminal-body");

  currentScript = scripts[scriptKey];
  if (!currentScript) return;
  stepIndex = 0; finished = false; paused = false;
  termBody.innerHTML = "";
  if (termStatus) termStatus.textContent = "running";
  btnSkip.hidden = false;
  btnPause.hidden = false;
  btnPause.textContent = "Pause";
  btnDismiss.hidden = true;
  sprintDone.classList.remove("visible");
  nextStep();
}

function nextStep() {
  if (paused || finished) return;
  if (stepIndex >= currentScript.length) { onSprintComplete(); return; }
  var step = currentScript[stepIndex];
  stepIndex++;
  var progress = stepIndex / currentScript.length;
  var termStatus = document.getElementById("terminal-status-text");
  if (termStatus && !finished) {
    if (progress < 0.2) termStatus.textContent = "initializing";
    else if (progress < 0.6) termStatus.textContent = "researching";
    else if (progress < 0.75) termStatus.textContent = "analyzing";
  }
  var delayBetween = prefersReduced ? 0 : 200;
  renderStep(step, function () {
    timeoutId = setTimeout(nextStep, delayBetween);
  });
}

function onSprintComplete() {
  var btnSkip = document.getElementById("btn-skip");
  var btnPause = document.getElementById("btn-pause");
  var btnDismiss = document.getElementById("btn-dismiss");
  var sprintDone = document.getElementById("sprint-done");

  finished = true;
  btnSkip.hidden = true;
  btnPause.hidden = true;
  btnDismiss.hidden = false;
  demosWatched++;
  if (prefersReduced) {
    sprintDone.classList.add("visible");
  } else {
    setTimeout(function () { sprintDone.classList.add("visible"); }, 400);
  }
}

/* ======================================================
   SKIP
   ====================================================== */
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function skipToEnd() {
  var termBody = document.getElementById("terminal-body");
  var termStatus = document.getElementById("terminal-status-text");
  var gameTerminal = document.getElementById("game-terminal");

  if (timeoutId) clearTimeout(timeoutId);
  if (!currentScript) return;
  termBody.innerHTML = "";
  for (var i = 0; i < currentScript.length; i++) {
    var step = currentScript[i];
    var div = document.createElement("div");
    div.className = "t-line";
    if (step.type === "blank") {
      div.innerHTML = "&nbsp;";
    } else if (step.type === "cmd") {
      div.classList.add("t-mt");
      div.innerHTML = '<span class="c-dim">$ </span><span class="c-lime">' + escHtml(step.text) + '</span>';
    } else if (step.type === "line") {
      div.innerHTML = step.html;
    } else if (step.type === "challenge") {
      div.className = "t-line t-challenge";
      div.innerHTML = step.html;
    } else if (step.type === "bar") {
      div.innerHTML =
        '<div class="bar-row"><span class="bar-label">' + step.label + '</span>' +
        '<div class="bar-track" role="progressbar" aria-valuenow="' + step.pct +
        '" aria-valuemin="0" aria-valuemax="100" aria-label="' + step.label + ' coverage: ' + step.pct + '%">' +
        '<div class="bar-fill ' + step.cls + '" style="width:' + step.pct + '%;--target-w:' + step.pct + '%"></div></div>' +
        '<span class="bar-pct ' + step.color + '" aria-hidden="true">' + step.pct + '%</span></div>';
    } else if (step.type === "pass") {
      div.classList.add("t-mt");
      div.innerHTML = '<span class="t-pass">' + step.text + '</span>';
    }
    termBody.appendChild(div);
    if (step.type === "challenge" && step.strikeId) {
      var target = document.getElementById(step.strikeId);
      if (target) target.classList.add("t-struck");
    }
  }
  scrollTerminal();
  if (termStatus) termStatus.textContent = "complete";
  gameTerminal.classList.add("victory");
  onSprintComplete();
}

/* ======================================================
   PAUSE / RESUME
   ====================================================== */
function togglePause() {
  var btnPause = document.getElementById("btn-pause");
  if (finished) return;
  paused = !paused;
  btnPause.textContent = paused ? "Resume" : "Pause";
  if (!paused) nextStep();
}
