/* ======================================================
   GRAINULATOR — Canvas Fish Pond + Particles
   Canvas 2D pond with fish AI, particles, ripples, caustics.
   Zero libraries. 60fps.
   ====================================================== */

/* ======================================================
   PARTICLE SYSTEM
   ====================================================== */
var MAX_PARTICLES = 200;
var particles = [];
var activeParticles = 0;

for (var pi = 0; pi < MAX_PARTICLES; pi++) {
  particles.push({
    active: false, x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 0, r: 0, g: 0, b: 0, a: 1, size: 2, type: "dot",
  });
}

function spawnParticle(x, y, vx, vy, life, r, g, b, size, type) {
  for (var i = 0; i < MAX_PARTICLES; i++) {
    if (!particles[i].active) {
      var p = particles[i];
      p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.maxLife = life; p.r = r; p.g = g; p.b = b;
      p.a = 1; p.size = size || 2; p.type = type || "dot";
      activeParticles++;
      return;
    }
  }
}

function burstParticles(x, y, count, r, g, b, speed, life, size) {
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var spd = speed * (0.3 + Math.random() * 0.7);
    spawnParticle(
      x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10,
      Math.cos(angle) * spd, Math.sin(angle) * spd,
      life * (0.5 + Math.random() * 0.5), r, g, b,
      size || 1 + Math.random() * 3, "dot"
    );
  }
}

function updateParticles(dt) {
  activeParticles = 0;
  for (var i = 0; i < MAX_PARTICLES; i++) {
    var p = particles[i];
    if (!p.active) continue;
    activeParticles++;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; continue; }
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vy += 0.02 * dt * 60;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.a = Math.max(0, p.life / p.maxLife);
  }
}

function drawParticles(ctx) {
  if (!ctx) return;
  for (var i = 0; i < MAX_PARTICLES; i++) {
    var p = particles[i];
    if (!p.active) continue;
    ctx.globalAlpha = p.a * 0.8;
    ctx.fillStyle = "rgb(" + p.r + "," + p.g + "," + p.b + ")";
    if (p.type === "spark") {
      ctx.save();
      var angle = Math.atan2(p.vy, p.vx);
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.fillRect(-p.size * 2, -p.size * 0.3, p.size * 4, p.size * 0.6);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/* ======================================================
   RIPPLE SYSTEM
   ====================================================== */
var MAX_RIPPLES = 10;
var ripples = [];
for (var ri = 0; ri < MAX_RIPPLES; ri++) {
  ripples.push({ active: false, x: 0, y: 0, radius: 0, maxRadius: 0, life: 0, maxLife: 0 });
}

function spawnRipple(x, y, maxRadius) {
  for (var i = 0; i < MAX_RIPPLES; i++) {
    if (!ripples[i].active) {
      ripples[i].active = true; ripples[i].x = x; ripples[i].y = y;
      ripples[i].radius = 0; ripples[i].maxRadius = maxRadius || 120;
      ripples[i].life = 1; ripples[i].maxLife = 1;
      return;
    }
  }
}

function updateRipples(dt) {
  for (var i = 0; i < MAX_RIPPLES; i++) {
    var r = ripples[i];
    if (!r.active) continue;
    r.life -= dt * 1.0;
    if (r.life <= 0) { r.active = false; continue; }
    r.radius = r.maxRadius * (1 - r.life / r.maxLife);
  }
}

function drawRipples(ctx) {
  if (!ctx) return;
  for (var i = 0; i < MAX_RIPPLES; i++) {
    var r = ripples[i];
    if (!r.active) continue;
    var alpha = r.life * 0.3;
    ctx.strokeStyle = "rgba(191, 255, 0, " + alpha + ")";
    ctx.lineWidth = 1.5 * r.life;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ======================================================
   CAUSTICS
   ====================================================== */
var causticsTime = 0;

function drawCaustics(ctx, t, W, H) {
  if (!ctx) return;
  causticsTime = t * 0.0003;
  ctx.globalAlpha = 0.012;
  ctx.fillStyle = "#BFFF00";
  for (var cx = 0; cx < W; cx += 80) {
    for (var cy = 0; cy < H; cy += 80) {
      var v = Math.sin(cx * 0.01 + causticsTime * 2) *
        Math.cos(cy * 0.012 + causticsTime * 1.5) *
        Math.sin((cx + cy) * 0.008 + causticsTime);
      if (v > 0.3) {
        var s = v * 40;
        ctx.beginPath();
        ctx.arc(
          cx + Math.sin(causticsTime + cy * 0.01) * 20,
          cy + Math.cos(causticsTime + cx * 0.01) * 20,
          s, 0, Math.PI * 2
        );
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

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
    ctx.font = "600 " + baseFontSize + "px " + fontFamily;
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
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.3,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.3 + Math.random() * 0.4,
      rotation: 0, opacity: 0.55, baseOpacity: 0.55,
      hovered: false, scale: 1.0, depth: 1.0,
      scatterVx: 0, scatterVy: 0, scatterDecay: 0,
      jumpTime: -1, jumpCooldown: 20 + Math.random() * 40,
      clickScale: 1, clickScaleTarget: 1,
    });
  }
}

function updateFish(dt) {
  var cursorInfluenceRadius = 200;
  var wallPad = 4;
  var collisionPad = 6;

  for (var i = 0; i < fish.length; i++) {
    var f = fish[i];
    if (clickedFishIndex === i && clickedFishAnim > 0) continue;

    f.wobblePhase += f.wobbleSpeed * dt;
    var wiggle = Math.sin(f.wobblePhase * 2) * 0.02;
    f.rotation = f.rotation * 0.9 + (wiggle + f.vx * 0.03) * 0.1;

    if (f.scatterDecay > 0) {
      f.scatterDecay -= dt * 2;
      if (f.scatterDecay < 0) f.scatterDecay = 0;
    }

    /* --- schooling (loose flocking) --- */
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
          f.vx -= (dx / dist) * 0.005;
          f.vy -= (dy / dist) * 0.005;
        }
      }
    }
    if (neighbors > 0) {
      avgVx /= neighbors; avgVy /= neighbors;
      f.vx += (avgVx - f.vx) * 0.002;
      f.vy += (avgVy - f.vy) * 0.002;
    }

    /* --- cursor flee --- */
    var mdx = f.x + f.w / 2 - mouseX;
    var mdy = f.y + f.h / 2 - mouseY;
    var mDist = Math.sqrt(mdx * mdx + mdy * mdy);
    if (mDist < cursorInfluenceRadius && mDist > 0) {
      var fleeFactor = (1 - mDist / cursorInfluenceRadius) * 0.15 * f.depth;
      f.vx += (mdx / mDist) * fleeFactor;
      f.vy += (mdy / mDist) * fleeFactor;
    }

    /* --- integrate position --- */
    var sx = f.vx + f.scatterVx * f.scatterDecay;
    var sy = f.vy + f.scatterVy * f.scatterDecay;
    var wobbleX = Math.sin(f.wobblePhase) * 0.12;
    var wobbleY = Math.cos(f.wobblePhase * 0.7) * 0.08;

    f.x += (sx + wobbleX) * dt * 60;
    f.y += (sy + wobbleY) * dt * 60;

    var speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy);
    if (speed > 1.5) { f.vx *= 1.5 / speed; f.vy *= 1.5 / speed; }
    f.vx *= 0.999; f.vy *= 0.999;

    /* --- wall bounce --- */
    if (f.x < wallPad) { f.x = wallPad; f.vx = Math.abs(f.vx) * 0.5; }
    if (f.x + f.w > W - wallPad) { f.x = W - f.w - wallPad; f.vx = -Math.abs(f.vx) * 0.5; }
    if (f.y < wallPad) { f.y = wallPad; f.vy = Math.abs(f.vy) * 0.5; }
    if (f.y + f.h > H - wallPad) { f.y = H - f.h - wallPad; f.vy = -Math.abs(f.vy) * 0.5; }

    f.jumpCooldown -= dt;
    if (f.jumpCooldown <= 0 && f.jumpTime < 0) {
      f.jumpTime = 0; f.jumpCooldown = 25 + Math.random() * 45;
    }
    if (f.jumpTime >= 0) {
      f.jumpTime += dt * 3;
      if (f.jumpTime >= 1) f.jumpTime = -1;
    }

    f.clickScale += (f.clickScaleTarget - f.clickScale) * 0.2;
    f.hovered = mouseX >= f.x && mouseX <= f.x + f.w && mouseY >= f.y && mouseY <= f.y + f.h;
    var targetOpacity = f.hovered ? Math.min(f.baseOpacity + 0.4, 1) : f.baseOpacity;
    f.opacity += (targetOpacity - f.opacity) * 0.15;
  }

  /* --- fish-fish collision --- */
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
        a.vx -= nx * 0.15; a.vy -= ny * 0.15;
        b.vx += nx * 0.15; b.vy += ny * 0.15;
      }
    }
  }
}

function drawFish(ctx, gameTerminal, pondContainer) {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  var fontFamily = getComputedStyle(document.body).fontFamily;

  drawCaustics(ctx, performance.now(), W, H);
  drawRipples(ctx);

  for (var i = 0; i < fish.length; i++) {
    var f = fish[i];
    if (clickedFishIndex === i && clickedFishAnim > 0) {
      drawClickedFishAnim(ctx, f, fontFamily, gameTerminal, pondContainer);
      continue;
    }

    var jumpScale = 1, jumpY = 0;
    if (f.jumpTime >= 0) {
      var jt = f.jumpTime;
      jumpScale = 1 + Math.sin(jt * Math.PI) * 0.05;
      jumpY = -Math.sin(jt * Math.PI) * 3;
    }

    var totalScale = f.clickScale * jumpScale;
    var drawX = f.x + f.w / 2, drawY = f.y + f.h / 2 + jumpY;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(f.rotation);
    ctx.scale(totalScale, totalScale);
    ctx.translate(-f.w / 2, -f.h / 2);
    ctx.globalAlpha = f.opacity;

    var borderColor = f.hovered ? "rgba(191, 255, 0, 0.6)" : "rgba(255, 255, 255, " + (0.03 + f.depth * 0.04) + ")";
    var bgColor = f.hovered ? "rgba(191, 255, 0, 0.08)" : "rgba(255, 255, 255, " + (0.01 + f.depth * 0.02) + ")";

    var r = 6;
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
      ctx.fillStyle = "rgba(191, 255, 0, 0.3)";
      ctx.beginPath();
      ctx.arc(f.w - 8, 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = "600 " + f.fontSize + "px " + fontFamily;
    ctx.fillStyle = f.hovered ? "#BFFF00" : "rgba(154, 154, 154, " + (0.5 + f.depth * 0.5) + ")";
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

  drawParticles(ctx);
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
  var skewX = Math.sin(t * Math.PI) * 0.15 * (targetX > startX ? 1 : -1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.transform(1, 0, skewX, 1, 0, 0);
  ctx.scale(scale, scale);
  ctx.translate(-f.w / 2, -f.h / 2);

  if (t > 0.1 && t < 0.8) {
    spawnParticle(
      cx + (Math.random() - 0.5) * 20, cy + (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2,
      0.3 + Math.random() * 0.3, 191, 255, 0, 2, "dot"
    );
  }

  ctx.fillStyle = "rgba(191, 255, 0, 0.15)";
  ctx.strokeStyle = "rgba(191, 255, 0, 0.5)";
  ctx.lineWidth = 1;
  var r = 6;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(f.w - r, 0);
  ctx.quadraticCurveTo(f.w, 0, f.w, r); ctx.lineTo(f.w, f.h - r);
  ctx.quadraticCurveTo(f.w, f.h, f.w - r, f.h); ctx.lineTo(r, f.h);
  ctx.quadraticCurveTo(0, f.h, 0, f.h - r); ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.font = "600 " + f.fontSize + "px " + fontFamily;
  ctx.fillStyle = "#BFFF00";
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
    if (dist < 300 && dist > 0) {
      var force = (1 - dist / 300) * 3;
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
