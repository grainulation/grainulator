/* ======================================================
   GRAINULATOR — App Controller
   Scroll handling, nav, clipboard, a11y, keyboard,
   canvas events, animation loop, init.
   ====================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("pond");
  var ctx = canvas ? canvas.getContext("2d") : null;
  var pondContainer = document.getElementById("pond-container");
  var termOverlay = document.getElementById("terminal-overlay");
  var termOverlayBg = document.getElementById("terminal-overlay-bg");
  var gameTerminal = document.getElementById("game-terminal");
  var btnSkip = document.getElementById("btn-skip");
  var btnPause = document.getElementById("btn-pause");
  var btnDismiss = document.getElementById("btn-dismiss");
  var btnGetItCta = document.getElementById("btn-get-it-cta");
  var installCmdEl = document.getElementById("install-cmd");
  var installCopyBtn = document.getElementById("install-copy-btn");
  var pondHint = document.getElementById("pond-hint");

  var isMobile = window.matchMedia("(max-width: 768px)").matches;

  /* ======================================================
     CANVAS EVENTS
     ====================================================== */
  if (canvas) {
    canvas.addEventListener("mousemove", function (e) {
      var c = getCanvasCoords(e, pondContainer);
      mouseX = c.x; mouseY = c.y;
      var found = false;
      for (var i = fish.length - 1; i >= 0; i--) {
        if (fish[i].hovered) { found = true; break; }
      }
      canvas.style.cursor = found ? "pointer" : "default";
    });

    canvas.addEventListener("mouseleave", function () {
      mouseX = -1000; mouseY = -1000;
    });

    canvas.addEventListener("click", function (e) {
      var c = getCanvasCoords(e, pondContainer);
      var cx = c.x, cy = c.y;
      spawnRipple(cx, cy, 120);

      for (var i = fish.length - 1; i >= 0; i--) {
        var f = fish[i];
        if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) {
          f.clickScaleTarget = 0.9;
          setTimeout((function (fi) {
            return function () {
              fi.clickScaleTarget = 1.04;
              setTimeout(function () { fi.clickScaleTarget = 1; }, 200);
            };
          })(f), 80);

          scatterFishAround(cx, cy, i);
          burstParticles(cx, cy, 5, 191, 255, 0, 1.5, 0.5, 1.5);
          clickedFishIndex = i;
          clickedFishAnim = 0.01;

          setTimeout((function (key, text) {
            return function () { selectPrompt(key, text); };
          })(f.key, f.text), 350);
          return;
        }
      }
    });

    canvas.addEventListener("touchend", function (e) {
      if (e.changedTouches.length === 0) return;
      var t = e.changedTouches[0];
      var c = getCanvasCoords(t, pondContainer);
      var cx = c.x, cy = c.y;
      spawnRipple(cx, cy, 100);
      for (var i = fish.length - 1; i >= 0; i--) {
        var f = fish[i];
        if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) {
          e.preventDefault();
          scatterFishAround(cx, cy, i);
          burstParticles(cx, cy, 4, 191, 255, 0, 1.5, 0.5, 1.5);
          clickedFishIndex = i;
          clickedFishAnim = 0.01;
          setTimeout((function (key, text) {
            return function () { selectPrompt(key, text); };
          })(f.key, f.text), 350);
          return;
        }
      }
    }, { passive: false });
  }

  /* ======================================================
     TERMINAL EVENT BINDINGS
     ====================================================== */
  termOverlayBg.addEventListener("click", dismissTerminal);
  btnDismiss.addEventListener("click", dismissTerminal);
  btnSkip.addEventListener("click", skipToEnd);
  btnPause.addEventListener("click", togglePause);

  if (btnGetItCta) {
    btnGetItCta.addEventListener("click", function () {
      dismissTerminal();
      var el = document.getElementById("install-section");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    });
  }

  /* ======================================================
     CLIPBOARD
     ====================================================== */
  var copyStatusEl = document.getElementById("copy-status");

  function copyCmd() {
    var text = "/plugin install grainulator";
    var btn = installCopyBtn;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (btn) { btn.textContent = "\u2713 Copied"; btn.classList.add("copied"); }
    if (copyStatusEl) copyStatusEl.textContent = "Command copied to clipboard";
    setTimeout(function () {
      if (btn) { btn.textContent = "Copy"; btn.classList.remove("copied"); }
      if (copyStatusEl) copyStatusEl.textContent = "";
    }, 2000);
  }

  if (installCmdEl) {
    installCmdEl.addEventListener("click", copyCmd);
    installCmdEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); copyCmd(); }
    });
  }
  if (installCopyBtn) {
    installCopyBtn.addEventListener("click", function (e) {
      e.stopPropagation(); copyCmd();
    });
  }

  /* ======================================================
     KEYBOARD
     ====================================================== */
  document.addEventListener("keydown", function (e) {
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;

    if (e.key === "Escape") {
      if (terminalActive) {
        if (!finished) skipToEnd();
        else dismissTerminal();
        return;
      }
    }

    if (e.key === " " && terminalActive && currentScript && !finished && e.target === document.body) {
      e.preventDefault(); togglePause();
    }

    if (!terminalActive && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      var sections = document.querySelectorAll(".section");
      var currentIdx = -1;
      var scrollY = window.scrollY + window.innerHeight / 2;
      for (var si = 0; si < sections.length; si++) {
        if (sections[si].offsetTop <= scrollY) currentIdx = si;
      }
      if (e.key === "ArrowDown" && currentIdx < sections.length - 1) {
        sections[currentIdx + 1].scrollIntoView({ behavior: "smooth" });
        e.preventDefault();
      } else if (e.key === "ArrowUp" && currentIdx > 0) {
        sections[currentIdx - 1].scrollIntoView({ behavior: "smooth" });
        e.preventDefault();
      }
    }
  });

  /* ======================================================
     SR PROMPT LIST + REDUCED MOTION GRID
     ====================================================== */
  var srList = document.getElementById("sr-prompts");
  var reducedGridInner = document.getElementById("reduced-grid-inner");

  allPrompts.forEach(function (p) {
    if (srList) {
      var btn = document.createElement("button");
      btn.className = "sr-prompt-btn";
      btn.textContent = p.text;
      btn.type = "button";
      btn.addEventListener("click", function () { selectPrompt(p.key, p.text); });
      srList.appendChild(btn);
    }
    if (reducedGridInner) {
      var gbtn = document.createElement("button");
      gbtn.className = "reduced-grid-btn";
      gbtn.textContent = p.text;
      gbtn.type = "button";
      gbtn.addEventListener("click", function () { selectPrompt(p.key, p.text); });
      reducedGridInner.appendChild(gbtn);
    }
  });

  /* ======================================================
     ANIMATION LOOP
     ====================================================== */
  var lastTime = 0;
  var animRunning = true;

  function animate(time) {
    if (!animRunning) return;
    var dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0.016;
    lastTime = time;

    updateParticles(dt);
    updateRipples(dt);

    if (!terminalActive || clickedFishAnim > 0) {
      updateFish(dt);
      drawFish(ctx, gameTerminal, pondContainer);
    } else {
      if (ctx) {
        ctx.clearRect(0, 0, W, H);
        drawParticles(ctx);
      }
    }

    if (clickedFishAnim > 0 && clickedFishAnim < 1) {
      clickedFishAnim += dt * 2.5;
      if (clickedFishAnim >= 1) {
        clickedFishAnim = 0;
        clickedFishIndex = -1;
      }
    }

    requestAnimationFrame(animate);
  }

  /* ======================================================
     INIT
     ====================================================== */
  if (!prefersReduced && !isMobile && canvas && pondContainer) {
    resizePond(canvas, pondContainer, ctx);
    initFish(ctx);
    window.addEventListener("resize", function () {
      resizePond(canvas, pondContainer, ctx);
      for (var i = 0; i < fish.length; i++) {
        if (fish[i].x + fish[i].w > W - 4) fish[i].x = W - fish[i].w - 4;
        if (fish[i].y + fish[i].h > H - 4) fish[i].y = H - fish[i].h - 4;
        if (fish[i].x < 4) fish[i].x = 4;
        if (fish[i].y < 4) fish[i].y = 4;
      }
    });
    requestAnimationFrame(animate);
  }
})();
