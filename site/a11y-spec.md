# Accessibility Patch Spec for grainulator.app v2

> Apply these changes AFTER the core `index.html` build is complete.
> Every section includes copy-pasteable code. Integrate in order.

---

## 0. SR-Only Utility Class

Add to the `<style>` block:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

---

## 1. Screen Reader Support

### 1.1 Canvas decoration

The WebGL canvas is purely decorative. Add these attributes to the `<canvas>` element:

```html
<canvas aria-hidden="true" role="presentation" ...></canvas>
```

### 1.2 Hidden progress bar

Add immediately after the canvas (inside `<body>`, outside any visual container):

```html
<div
  role="progressbar"
  aria-valuenow="0"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label="AI model download progress"
  class="sr-only"
  id="model-progress"
></div>
```

Update it from JS whenever model download progresses:

```js
function updateModelProgress(pct) {
  const bar = document.getElementById('model-progress');
  bar.setAttribute('aria-valuenow', String(Math.round(pct)));
}
```

### 1.3 Live regions

Add these three elements inside `<body>`, grouped together for clarity:

```html
<!-- Announces at 25/50/75/100% milestones -->
<div aria-live="polite" id="progress-announcer" class="sr-only"></div>

<!-- Announces critical state changes ("Demo ready") -->
<div aria-live="assertive" id="state-announcer" class="sr-only"></div>

<!-- Per-pass narration during compilation -->
<div aria-live="polite" id="compiler-announcer" class="sr-only"></div>
```

Announce milestones from JS:

```js
const MILESTONES = [25, 50, 75, 100];
let lastMilestone = 0;

function announceProgress(pct) {
  const milestone = MILESTONES.find(m => pct >= m && m > lastMilestone);
  if (milestone) {
    lastMilestone = milestone;
    document.getElementById('progress-announcer').textContent =
      milestone === 100
        ? 'Model download complete.'
        : `Model download ${milestone}% complete.`;
  }
}

function announceState(msg) {
  document.getElementById('state-announcer').textContent = msg;
}

function announceCompilerPass(msg) {
  document.getElementById('compiler-announcer').textContent = msg;
}
```

Call `announceState('Demo ready')` when the model finishes loading.

### 1.4 Claim cards reading order

Claim cards MUST be appended to the DOM in reading order (the order they are generated). When a new card is added, announce it:

```js
function addClaimCard(container, cardEl) {
  container.appendChild(cardEl);
  // Announce the new card to screen readers
  document.getElementById('compiler-announcer').textContent =
    `New claim: ${cardEl.querySelector('.claim-title')?.textContent || 'generated'}`;
}
```

### 1.5 Question input label

The demo question `<input>` or `<textarea>` needs an associated label:

```html
<label for="demo-question" class="sr-only">Research question</label>
<input id="demo-question" type="text" placeholder="Ask a research question..." />
```

If using a `<textarea>`, replace accordingly but keep the same `id` and `for` pairing.

---

## 2. Keyboard Navigation

### 2.1 Focus indicator

Add to the `<style>` block:

```css
*:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
```

### 2.2 FLIP transition focus management

During any FLIP animation that rearranges the page (e.g., hero-to-demo transition):

```js
function flipTransition(departingEl, arrivingEl) {
  // 1. Mark departing content as inert so focus can't land there
  departingEl.inert = true;
  departingEl.setAttribute('aria-hidden', 'true');

  // 2. Mark arriving container as busy during animation
  arrivingEl.setAttribute('aria-busy', 'true');

  // 3. Run the FLIP animation...
  // (your existing FLIP code here)

  // 4. On transitionend, clean up and move focus
  arrivingEl.addEventListener('transitionend', function handler() {
    arrivingEl.removeEventListener('transitionend', handler);
    arrivingEl.removeAttribute('aria-busy');

    const questionInput = document.getElementById('demo-question');
    if (questionInput) questionInput.focus();
  }, { once: true });
}
```

### 2.3 Claim cards as interactive elements

Each claim card must be keyboard-operable:

```html
<div class="claim-card" role="button" tabindex="0" aria-label="Claim: [title]">
  ...
</div>
```

Roving tabindex with arrow keys across the card container:

```js
function initClaimCardKeyboard(container) {
  const getCards = () => Array.from(container.querySelectorAll('.claim-card'));

  container.addEventListener('keydown', (e) => {
    const cards = getCards();
    const current = document.activeElement;
    const idx = cards.indexOf(current);
    if (idx === -1) return;

    let next = -1;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      next = (idx + 1) % cards.length;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      next = (idx - 1 + cards.length) % cards.length;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      current.click();
      return;
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = cards.length - 1;
    }

    if (next !== -1) {
      cards[idx].setAttribute('tabindex', '-1');
      cards[next].setAttribute('tabindex', '0');
      cards[next].focus();
    }
  });

  // Initialize: first card is tabbable, rest are not
  const cards = getCards();
  cards.forEach((c, i) => c.setAttribute('tabindex', i === 0 ? '0' : '-1'));
}
```

### 2.4 Skip navigation

The existing skip link target should update when the demo activates:

```js
function activateDemo() {
  const skipLink = document.querySelector('a[href^="#"]'); // adjust selector as needed
  if (skipLink) skipLink.setAttribute('href', '#demo-question');
}
```

If no skip link exists yet, add one as the first child of `<body>`:

```html
<a href="#main-content" class="sr-only" style="position:absolute;top:0;left:0;z-index:10000;padding:8px 16px;background:#000;color:#fff;text-decoration:underline;" onfocus="this.classList.remove('sr-only')" onblur="this.classList.add('sr-only')">
  Skip to main content
</a>
```

### 2.5 Cancel button

The cancel/abort button must be focusable and in tab order whenever visible:

```html
<button id="cancel-btn" type="button" aria-label="Cancel operation" tabindex="0">
  Cancel
</button>
```

When hiding/showing, toggle `hidden` attribute (not `display:none` with JS) so screen readers and tab order respect it:

```js
function showCancel() {
  document.getElementById('cancel-btn').removeAttribute('hidden');
}
function hideCancel() {
  document.getElementById('cancel-btn').setAttribute('hidden', '');
}
```

---

## 3. Motion Sensitivity

### 3.1 prefers-reduced-motion extensions

Add to the `<style>` block (extend any existing `prefers-reduced-motion` rules):

```css
@media (prefers-reduced-motion: reduce) {
  /* Cards: no drift animation */
  .claim-card {
    animation: none !important;
    transition: none !important;
  }

  /* FLIP transitions: instant */
  .flip-target,
  [data-flip] {
    transition-duration: 0s !important;
  }

  /* Compiler blob: hide animation, show text fallback */
  .compiler-blob {
    display: none !important;
  }
  .compiler-text-fallback {
    display: block !important;
  }

  /* CTA: static glow, no pulse */
  .cta-btn,
  [data-cta] {
    animation: none !important;
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.15) !important;
  }

  /* Easter egg: disabled */
  .easter-egg {
    display: none !important;
    pointer-events: none !important;
  }
}
```

### 3.2 Pause/play toggle for lava lamp background

Add a visible, keyboard-accessible toggle button:

```html
<button
  id="motion-toggle"
  type="button"
  aria-label="Pause background animation"
  aria-pressed="false"
  style="position:fixed;bottom:16px;right:16px;z-index:9999;background:rgba(0,0,0,0.7);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:8px 14px;font-size:14px;cursor:pointer;backdrop-filter:blur(8px);"
>
  Pause motion
</button>
```

```js
function initMotionToggle(pauseCallback, resumeCallback) {
  const btn = document.getElementById('motion-toggle');
  let paused = false;

  btn.addEventListener('click', () => {
    paused = !paused;
    btn.setAttribute('aria-pressed', String(paused));
    btn.setAttribute('aria-label', paused ? 'Resume background animation' : 'Pause background animation');
    btn.textContent = paused ? 'Resume motion' : 'Pause motion';

    if (paused) {
      pauseCallback();
    } else {
      resumeCallback();
    }
  });

  // Auto-pause if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    btn.click();
  }
}
```

### 3.3 Compiler red flash rate limiting

The red compilation flash must be throttled and softened:

```js
const FLASH_MIN_INTERVAL = 500; // ms
let lastFlashTime = 0;

function compilerFlash() {
  // Skip entirely for reduced-motion users
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const now = performance.now();
  if (now - lastFlashTime < FLASH_MIN_INTERVAL) return;
  lastFlashTime = now;

  // Use darkening instead of bright flash
  const overlay = document.getElementById('flash-overlay');
  overlay.style.background = 'rgba(80, 0, 0, 0.3)'; // dark red, not bright
  overlay.style.opacity = '1';
  requestAnimationFrame(() => {
    overlay.style.transition = 'opacity 300ms ease-out';
    overlay.style.opacity = '0';
  });
}
```

---

## 4. Low-End Device Support

### 4.1 Four-tier device detection

```js
async function detectTier() {
  // Tier 1: No GPU API at all
  if (!navigator.gpu) return 'minimal';

  const save = navigator.connection?.saveData;
  const speed = navigator.connection?.downlink || 100;
  const mem = navigator.deviceMemory || 8;

  // Tier 2: Data saver or very constrained
  if (save || speed < 10 || mem <= 2) return 'minimal';

  // Tier 3: Network-limited but GPU-capable
  if (speed < 50 || mem <= 4) return 'network-constrained';

  // Tier 4 check: probe VRAM via WebGPU adapter
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return 'network-constrained';

    const info = adapter.info || {};
    // If we can detect limited VRAM, downgrade
    // adapter.limits.maxBufferSize can be a rough proxy
    const maxBuf = adapter.limits?.maxBufferSize || Infinity;
    if (maxBuf < 256 * 1024 * 1024) return 'reduced-gpu';

    return 'full';
  } catch {
    return 'network-constrained';
  }
}
```

Apply tiers:

```js
async function applyTier() {
  const tier = await detectTier();
  document.documentElement.setAttribute('data-tier', tier);

  switch (tier) {
    case 'minimal':
      // No shaders, no model preload, static fallback
      disableShaders();
      disableModelPreload();
      showStaticFallback();
      break;
    case 'network-constrained':
      // Shaders OK, but defer model download
      deferModelDownload();
      break;
    case 'reduced-gpu':
      // Shaders off during inference, lighter particles
      enableInferenceShaderPause();
      reduceLavaLampComplexity();
      break;
    case 'full':
      // All features enabled
      break;
  }
}
```

### 4.2 Save-Data / saveData preload gate

Check before any resource preload:

```js
function shouldPreload() {
  // Check both the header-based and JS API-based signals
  if (navigator.connection?.saveData) return false;

  // The Save-Data HTTP header is handled server-side;
  // for client-side, the above check suffices
  return true;
}

// Usage:
if (shouldPreload()) {
  preloadModel();
  preloadShaderAssets();
}
```

### 4.3 Shader pause during inference

On `reduced-gpu` tier, pause the shader pipeline while the model is running:

```js
function enableInferenceShaderPause() {
  let shaderActive = true;

  window.addEventListener('inference-start', () => {
    if (shaderActive) {
      pauseShaderPipeline();
      shaderActive = false;
    }
  });

  window.addEventListener('inference-end', () => {
    if (!shaderActive) {
      resumeShaderPipeline();
      shaderActive = true;
    }
  });
}
```

### 4.4 Page Visibility API pause

Stop all GPU work and timers when the tab is hidden:

```js
function initVisibilityPause(pauseAll, resumeAll) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAll();
    } else {
      resumeAll();
    }
  });
}
```

### 4.5 Service Worker precache update

In `sw.js`, add `index.html` to the precache list so the page works offline:

```js
// In sw.js, add to the PRECACHE_URLS array:
const PRECACHE_URLS = [
  '/',
  '/index.html',
  // ... other assets
];
```

---

## 5. Integration Checklist

When patching `index.html`, verify each item:

- [ ] `.sr-only` class is defined in `<style>`
- [ ] `<canvas>` has `aria-hidden="true" role="presentation"`
- [ ] Hidden `role="progressbar"` element exists
- [ ] Three `aria-live` regions exist (`progress-announcer`, `state-announcer`, `compiler-announcer`)
- [ ] `announceProgress()` fires at 25/50/75/100%
- [ ] `announceState('Demo ready')` fires on model load
- [ ] `<label for="demo-question">` exists with `sr-only`
- [ ] `*:focus-visible` rule is in `<style>`
- [ ] FLIP transitions set `inert` on departing elements
- [ ] FLIP transitions call `.focus()` on `#demo-question` after `transitionend`
- [ ] FLIP transitions set `aria-busy="true"` during animation
- [ ] Claim cards have `role="button" tabindex="0"` with Enter/Space handlers
- [ ] Roving tabindex with arrow keys on claim card container
- [ ] Skip link href updates to `#demo-question` when demo activates
- [ ] Cancel button is focusable and in tab order when visible
- [ ] `prefers-reduced-motion` disables: card drift, FLIP duration, blob, CTA pulse, easter egg
- [ ] Pause/play toggle button exists (fixed position, visible, keyboard accessible)
- [ ] Red flash is max 1 per 500ms, uses dark overlay, skipped for reduced-motion
- [ ] `detectTier()` returns one of: `minimal`, `network-constrained`, `reduced-gpu`, `full`
- [ ] `navigator.connection.saveData` checked before all preloads
- [ ] Shaders paused during inference on `reduced-gpu` tier
- [ ] `visibilitychange` pauses/resumes all GPU work
- [ ] `sw.js` precaches `index.html`
