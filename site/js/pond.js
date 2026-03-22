/* ======================================================
   GRAINULATOR — Canvas Fish Pond (Simplified)
   Canvas 2D pond with fish AI. No particles, no caustics,
   no ripples. Just fish swimming calmly.
   Zero libraries. 60fps.
   ====================================================== */

/* ======================================================
   PARTICLE SYSTEM — kept as stubs for JS compatibility
   (terminal.js calls burstParticles on victory)
   ====================================================== */
var MAX_PARTICLES = 0;
var particles = [];
var activeParticles = 0;

function spawnParticle() {}
function burstParticles() {}
function updateParticles() {}
function drawParticles() {}

/* Ripple stubs */
function spawnRipple() {}
function updateRipples() {}
function drawRipples() {}

/* ======================================================
   FISH / PROMPT BUBBLES
   ====================================================== */
var fish = [];
var W = 0, H = 0;
var dpr = window.devicePixelRatio || 1;
var mouseX = -1000, mouseY = -1000;
var clickedFishIndex = -1;
var clickedFishAnim = 0;

function resizePond(canvas, pondContainer, ctx) {
  if (!canvas || !pondContainer || !ctx) return;
  var rect = pondContainer.getBoundingClientRect();
  W = rect.width;
  H = rect.height;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initFish(ctx) {
  if (!ctx) return;
  fish = [];
  var baseFontSize = W < 768 ? 11 : 13;
  var fontFamily = getComputedStyle(document.body).fontFamily;

  for (var i = 0; i < allPrompts.length; i++) {
    var p = allPrompts[i];
    ctx.font = "500 " + baseFontSize + "px " + fontFamily;
    var tw = ctx.measureText(p.text).width;
    var padX = 24, padY = 16;
    var bw = tw + padX * 2;
    var bh = baseFontSize + padY * 2;

    fish.push({
      text: p.text, key: p.key,
      x: 20 + Math.random() * (W - bw - 40),
      y: 20 + Math.random() * (H - bh - 40),
      w: bw, h: bh, fontSize: baseFontSize,
      radius: (Math.max(bw, bh) / 2) * 0.6,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.2,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.2 + Math.random() * 0.3,
      rotation: 0, opacity: 0.5, baseOpacity: 0.5,
      hovered: false, scale: 1.0, depth: 1.0,
      scatterVx: 0, scatterVy: 0, scatterDecay: 0,
      jumpTime: -1, jumpCooldown: 30 + Math.random() * 60,
      clickScale: 1, clickScaleTarget: 1,
    });
  }
}

function updateFish(dt) {
  var cursorInfluenceRadius = 180;
  var wallPad = 4;
  var collisionPad = 6;

  for (var i = 0; i < fish.length; i++) {
    var f = fish[i];
    if (clickedFishIndex === i && clickedFishAnim > 0) continue;

    f.wobblePhase += f.wobbleSpeed * dt;
    var wiggle = Math.sin(f.wobblePhase * 2) * 0.015;
    f.rotation = f.rotation * 0.92 + (wiggle + f.vx * 0.02) * 0.08;

    if (f.scatterDecay > 0) {
      f.scatterDecay -= dt * 2;
      if (f.scatterDecay < 0) f.scatterDecay = 0;
    }

    /* schooling */
    var avgVx = 0, avgVy = 0, neighbors = 0;
    for (var j = 0; j < fish.length; j++) {
      if (i === j) continue;
      var dx = fish[j].x - f.x;
      var dy = fish[j].y - f.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 250) {
        avgVx += fish[j].vx;
        avgVy += fish[j].vy;
        neighbors++;
        if (dist < 100 && dist > 0) {
          f.vx -= (dx / dist) * 0.004;
          f.vy -= (dy / dist) * 0.004;
        }
      }
    }
    if (neighbors > 0) {
      avgVx /= neighbors; avgVy /= neighbors;
      f.vx += (avgVx - f.vx) * 0.002;
      f.vy += (avgVy - f.vy) * 0.002;
    }

    /* cursor flee */
    var mdx = f.x + f.w / 2 - mouseX;
    var mdy = f.y + f.h / 2 - mouseY;
    var mDist = Math.sqrt(mdx * mdx + mdy * mdy);
    if (mDist < cursorInfluenceRadius && mDist > 0) {
      var fleeFactor = (1 - mDist / cursorInfluenceRadius) * 0.1 * f.depth;
      f.vx += (mdx / mDist) * fleeFactor;
      f.vy += (mdy / mDist) * fleeFactor;
    }

    /* integrate position */
    var sx = f.vx + f.scatterVx * f.scatterDecay;
    var sy = f.vy + f.scatterVy * f.scatterDecay;
    var wobbleX = Math.sin(f.wobblePhase) * 0.08;
    var wobbleY = Math.cos(f.wobblePhase * 0.7) * 0.05;

    f.x += (sx + wobbleX) * dt * 60;
    f.y += (sy + wobbleY) * dt * 60;

    var speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    if (speed > 1.0) { f.vx *= 1.0 / speed; f.vy *= 1.0 / speed; }
    f.vx *= 0.999; f.vy *= 0.999;

    /* wall bounce */
    if (f.x < wallPad) { f.x = wallPad; f.vx = Math.abs(f.vx) * 0.5; }
    if (f.x + f.w > W - wallPad) { f.x = W - f.w - wallPad; f.vx = -Math.abs(f.vx) * 0.5; }
    if (f.y < wallPad) { f.y = wallPad; f.vy = Math.abs(f.vy) * 0.5; }
    if (f.y + f.h > H - wallPad) { f.y = H - f.h - wallPad; f.vy = -Math.abs(f.vy) * 0.5; }

    f.jumpCooldown -= dt;
    if (f.jumpCooldown <= 0 && f.jumpTime < 0) {
      f.jumpTime = 0; f.jumpCooldown = 30 + Math.random() * 60;
    }
    if (f.jumpTime >= 0) {
      f.jumpTime += dt * 3;
      if (f.jumpTime >= 1) f.jumpTime = -1;
    }

    f.clickScale += (f.clickScaleTarget - f.clickScale) * 0.2;
    f.hovered = mouseX >= f.x && mouseX <= f.x + f.w && mouseY >= f.y && mouseY <= f.y + f.h;
    var targetOpacity = f.hovered ? Math.min(f.baseOpacity + 0.45, 1) : f.baseOpacity;
    f.opacity += (targetOpacity - f.opacity) * 0.12;
  }

  /* fish-fish collision */
  for (var i = 0; i < fish.length; i++) {
    if (clickedFishIndex === i && clickedFishAnim > 0) continue;
    var a = fish[i];
    var aCx = a.x + a.w / 2, aCy = a.y + a.h / 2;
    for (var j = i + 1; j < fish.length; j++) {
      if (clickedFishIndex === j && clickedFishAnim > 0) continue;
      var b = fish[j];
      var bCx = b.x + b.w / 2, bCy = b.y + b.h / 2;
      var dx = bCx - aCx, dy = bCy - aCy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var minDist = a.radius + b.radius + collisionPad;
      if (dist < minDist && dist > 0.001) {
        var overlap = minDist - dist;
        var nx = dx / dist, ny = dy / dist;
        a.x -= nx * overlap * 0.25; a.y -= ny * overlap * 0.25;
        b.x += nx * overlap * 0.25; b.y += ny * overlap * 0.25;
        a.vx -= nx * 0.1; a.vy -= ny * 0.1;
        b.vx += nx * 0.1; b.vy += ny * 0.1;
      }
    }
  }
}

function drawFish(ctx, gameTerminal, pondContainer) {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  var fontFamily = getComputedStyle(document.body).fontFamily;

  for (var i = 0; i < fish.length; i++) {
    var f = fish[i];
    if (clickedFishIndex === i && clickedFishAnim > 0) {
      drawClickedFishAnim(ctx, f, fontFamily, gameTerminal, pondContainer);
      continue;
    }

    var jumpScale = 1, jumpY = 0;
    if (f.jumpTime >= 0) {
      var jt = f.jumpTime;
      jumpScale = 1 + Math.sin(jt * Math.PI) * 0.03;
      jumpY = -Math.sin(jt * Math.PI) * 2;
    }

    var totalScale = f.clickScale * jumpScale;
    var drawX = f.x + f.w / 2, drawY = f.y + f.h / 2 + jumpY;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(f.rotation);
    ctx.scale(totalScale, totalScale);
    ctx.translate(-f.w / 2, -f.h / 2);
    ctx.globalAlpha = f.opacity;

    var borderColor = f.hovered ? "rgba(41, 151, 255, 0.6)" : "rgba(255, 255, 255, " + (0.04 + f.depth * 0.04) + ")";
    var bgColor = f.hovered ? "rgba(41, 151, 255, 0.08)" : "rgba(255, 255, 255, " + (0.02 + f.depth * 0.02) + ")";

    var r = 10;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(f.w - r, 0);
    ctx.quadraticCurveTo(f.w, 0, f.w, r); ctx.lineTo(f.w, f.h - r);
    ctx.quadraticCurveTo(f.w, f.h, f.w - r, f.h); ctx.lineTo(r, f.h);
    ctx.quadraticCurveTo(0, f.h, 0, f.h - r); ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = bgColor; ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = f.hovered ? 1.5 : 0.5;
    ctx.stroke();

    if (scripts[f.key] && !f.hovered) {
      ctx.fillStyle = "rgba(41, 151, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(f.w - 8, 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = "500 " + f.fontSize + "px " + fontFamily;
    ctx.fillStyle = f.hovered ? "#d4a547" : "rgba(134, 134, 139, " + (0.5 + f.depth * 0.5) + ")";
    ctx.textBaseline = "middle";

    var maxTextW = f.w - 20;
    var displayText = f.text;
    if (ctx.measureText(displayText).width > maxTextW) {
      while (displayText.length > 0 && ctx.measureText(displayText + "\u2026").width > maxTextW) {
        displayText = displayText.slice(0, -1);
      }
      displayText += "\u2026";
    }
    ctx.fillText(displayText, 10, f.h / 2);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

function drawClickedFishAnim(ctx, f, fontFamily, gameTerminal, pondContainer) {
  if (!ctx) return;
  var t = clickedFishAnim;
  var termRect = gameTerminal.getBoundingClientRect();
  var pondRect = pondContainer.getBoundingClientRect();
  var targetX = termRect.left + termRect.width / 2 - pondRect.left;
  var targetY = termRect.top + termRect.height / 2 - pondRect.top;

  var startX = f.x + f.w / 2, startY = f.y + f.h / 2;
  var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  var cx = startX + (targetX - startX) * eased;
  var cy = startY + (targetY - startY) * eased;
  var scale = 1 - t * 0.6;
  var alpha = 1 - t;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-f.w / 2, -f.h / 2);

  ctx.fillStyle = "rgba(41, 151, 255, 0.1)";
  ctx.strokeStyle = "rgba(41, 151, 255, 0.5)";
  ctx.lineWidth = 1;
  var r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(f.w - r, 0);
  ctx.quadraticCurveTo(f.w, 0, f.w, r); ctx.lineTo(f.w, f.h - r);
  ctx.quadraticCurveTo(f.w, f.h, f.w - r, f.h); ctx.lineTo(r, f.h);
  ctx.quadraticCurveTo(0, f.h, 0, f.h - r); ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.font = "500 " + f.fontSize + "px " + fontFamily;
  ctx.fillStyle = "#d4a547";
  ctx.textBaseline = "middle";
  ctx.fillText(f.text.length > 30 ? f.text.slice(0, 30) + "\u2026" : f.text, 10, f.h / 2);
  ctx.restore();
}

function scatterFishAround(cx, cy, excludeIndex) {
  for (var i = 0; i < fish.length; i++) {
    if (i === excludeIndex) continue;
    var f = fish[i];
    var dx = f.x + f.w / 2 - cx;
    var dy = f.y + f.h / 2 - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 250 && dist > 0) {
      var force = (1 - dist / 250) * 2;
      f.scatterVx = (dx / dist) * force;
      f.scatterVy = (dy / dist) * force;
      f.scatterDecay = 1;
    }
  }
}

function getCanvasCoords(e, pondContainer) {
  if (!pondContainer) return { x: e.clientX, y: e.clientY };
  var rect = pondContainer.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
