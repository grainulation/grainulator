var shaderAnimId = null;
var shaderPaused = false;
var motionTogglePaused = false;

// ===================================================================
// WEBGL SHADER — preserved from production v10
// ===================================================================
var c = document.getElementById("c");
var isMobileDevice =
	window.matchMedia("(max-width:768px)").matches ||
	navigator.maxTouchPoints > 0;
var isFirefox = /Firefox\//i.test(navigator.userAgent);
var gl = isFirefox
	? null
	: c.getContext("webgl", {
			preserveDrawingBuffer: true,
			antialias: false,
			alpha: false,
			powerPreference: "low-power",
		});

function activateFallback() {
	document.body.classList.add("webgl-fallback");
}

function isSoftwareRenderer(g) {
	var ext = g.getExtension("WEBGL_debug_renderer_info");
	if (!ext) return false;
	var renderer = g.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
	return /swiftshader|llvmpipe|software|basic render/i.test(renderer);
}

if (!gl) {
	activateFallback();
} else if (isSoftwareRenderer(gl)) {
	activateFallback();
}

if (gl && !document.body.classList.contains("webgl-fallback")) {
	// Context loss handler (w711)
	c.addEventListener("webglcontextlost", (e) => {
		e.preventDefault();
		pauseShader();
		window._shaderRender = null;
		window._shaderResize = null;
		activateFallback();
	});

	const isMobile =
		/Mobi|Android/i.test(navigator.userAgent) || innerWidth < 768;
	const NUM = 8;
	const STEPS = isMobile ? 56 : 72;
	const HIT_THRESH = isMobile ? "0.002" : "0.001";
	const STEP_MULT = isMobile ? "0.85" : "0.8";
	const NORM_EPS = isMobile ? "0.003" : "0.002";
	const GLITCH_ON = isMobile ? 0 : 1;
	const IS_MOBILE = isMobile ? 1 : 0;

	const vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}";
	const fs =
		"\n\
precision highp float;\n\
uniform float t;\n\
uniform vec2 r;\n\
uniform float seed;\n\
uniform float u_preloadProgress;\n\
\n\
#define NUM " +
		NUM +
		"\n\
#define STEPS " +
		STEPS +
		"\n\
#define HIT_THRESH " +
		HIT_THRESH +
		"\n\
#define STEP_MULT " +
		STEP_MULT +
		"\n\
#define NORM_EPS " +
		NORM_EPS +
		"\n\
#define GLITCH_ON " +
		GLITCH_ON +
		"\n\
#define IS_MOBILE " +
		IS_MOBILE +
		"\n\
\n\
float smin(float a, float b, float k) {\n\
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);\n\
  return mix(b, a, h) - k*h*(1.0-h);\n\
}\n\
\n\
float sdSphere(vec3 p, float s) {\n\
  return length(p) - s;\n\
}\n\
\n\
float hash(float n) { return fract(sin(n) * 43758.5453); }\n\
\n\
float g_nearestBlob = 0.0;\n\
\n\
vec3 getNeonColor(float idx) {\n\
  int i = int(mod(idx, 8.0));\n\
  if (i == 0) return vec3(0.984, 0.749, 0.141);\n\
  if (i == 1) return vec3(0.957, 0.247, 0.369);\n\
  if (i == 2) return vec3(0.133, 0.773, 0.369);\n\
  if (i == 3) return vec3(0.231, 0.510, 0.965);\n\
  if (i == 4) return vec3(0.655, 0.545, 0.980);\n\
  if (i == 5) return vec3(0.984, 0.573, 0.235);\n\
  if (i == 6) return vec3(0.133, 0.827, 0.933);\n\
  return vec3(0.612, 0.639, 0.686);\n\
}\n\
\n\
float map(vec3 p) {\n\
  float d = 1e10;\n\
\n\
  for (int i = 0; i < NUM; i++) {\n\
    float fi = float(i);\n\
    float h1 = hash(fi * 412.531 + seed * 3.7);\n\
    float h2 = hash(fi * 317.892 + seed * 5.1);\n\
    float h3 = hash(fi * 253.147 + seed * 7.9);\n\
    float h4 = hash(fi * 173.29 + seed * 2.1);\n\
\n\
    float baseX = (h1 * 2.0 - 1.0) * 2.5;\n\
    float baseY = (h2 * 2.0 - 1.0) * 2.5;\n\
    float baseZ = (h4 - 0.5) * 0.3;\n\
\n\
#if IS_MOBILE\n\
    float sx = 0.06 + h1 * 0.08;\n\
    float sy = 0.05 + h2 * 0.07;\n\
    float sz = 0.04 + h3 * 0.06;\n\
#else\n\
    float sx = 0.03 + h1 * 0.04;\n\
    float sy = 0.025 + h2 * 0.035;\n\
    float sz = 0.02 + h3 * 0.03;\n\
#endif\n\
    float px = h2 * 6.28 + seed * 100.0;\n\
    float py = h3 * 6.28 + seed * 100.0;\n\
    float pz = h1 * 6.28 + seed * 100.0;\n\
\n\
    float dx = sin(t*sx + px)*0.35 + sin(t*sx*0.37 + py + 1.7)*0.2;\n\
    float dy = sin(t*sy + py + 0.5)*0.3 + cos(t*sy*0.43 + px + 2.1)*0.2;\n\
    float dz = cos(t*sz + pz + 1.0)*0.15;\n\
\n\
    vec3 blobPos = vec3(baseX + dx, baseY + dy, baseZ + dz);\n\
\n\
    float growFactor = 1.0 + u_preloadProgress * 0.6;\n\
\n\
#if IS_MOBILE\n\
    float blobR = (0.8 + h4 * 1.0) * growFactor;\n\
#else\n\
    float blobR = (0.20 + h4 * 0.30) * growFactor;\n\
#endif\n\
\n\
    vec3 evalP = p;\n\
\n\
#if GLITCH_ON\n\
    {\n\
      float gw = sin(t*0.3 + fi*3.7) * sin(t*0.13 + fi*2.1);\n\
      float burst = smoothstep(0.65, 0.9, gw);\n\
      if (burst > 0.01) {\n\
        vec3 toB = p - blobPos;\n\
        float near = smoothstep(1.5, 0.1, length(toB));\n\
        float amt = burst * near * 0.28;\n\
        if (amt > 0.005) {\n\
          float vs = mix(0.28, 0.10, fract(sin(fi*73.1 + floor(t*2.0))*438.5));\n\
          vec3 snapped = floor(p/vs + 0.5) * vs;\n\
          evalP = mix(p, snapped, amt);\n\
        }\n\
      }\n\
    }\n\
#endif\n\
\n\
    vec3 localP = evalP - blobPos;\n\
    float baseDist = length(localP) - blobR;\n\
    float blobD = baseDist;\n\
    if (baseDist < blobR * 1.5) {\n\
      vec3 nc = localP * (2.5 + fi * 0.3) + t * 0.06 + fi * 7.0;\n\
      float warp = sin(nc.x * 1.7 + nc.y * 1.3) * sin(nc.y * 2.1 + nc.z * 0.9);\n\
      blobD = baseDist - warp * blobR * 0.35;\n\
    }\n\
    float k = 0.3 + 0.1 * sin(fi * 1.7 + t * 0.05);\n\
    if (blobD < d) g_nearestBlob = fi;\n\
    d = smin(d, blobD, k);\n\
  }\n\
\n\
  return d;\n\
}\n\
\n\
vec3 calcNormal(vec3 p) {\n\
  vec2 e = vec2(NORM_EPS, 0.0);\n\
  return normalize(vec3(\n\
    map(p+e.xyy) - map(p-e.xyy),\n\
    map(p+e.yxy) - map(p-e.yxy),\n\
    map(p+e.yyx) - map(p-e.yyx)\n\
  ));\n\
}\n\
\n\
void main() {\n\
  vec2 uv = (gl_FragCoord.xy - 0.5*r) / min(r.x, r.y);\n\
\n\
  vec3 ro = vec3(0.0, 0.0, 3.8);\n\
  vec3 fwd = vec3(0.0, 0.0, -1.0);\n\
  vec3 rgt = vec3(1.0, 0.0, 0.0);\n\
  vec3 up2 = vec3(0.0, 1.0, 0.0);\n\
  vec3 rd = normalize(fwd * 1.2 + rgt * uv.x + up2 * uv.y);\n\
\n\
  float dist = 0.0;\n\
  float hit = -1.0;\n\
  float lastH = 1.0;\n\
  for (int i = 0; i < STEPS; i++) {\n\
    vec3 p = ro + rd * dist;\n\
    float h = map(p);\n\
    lastH = h;\n\
    if (h < HIT_THRESH) { hit = dist; break; }\n\
    if (dist > 15.0) break;\n\
    dist += h * STEP_MULT;\n\
  }\n\
\n\
  vec3 col = vec3(0.005, 0.004, 0.003);\n\
  vec2 gridUV = gl_FragCoord.xy;\n\
  float gridSize = 40.0;\n\
  float lineW = 1.0;\n\
  float gx = abs(mod(gridUV.x, gridSize) - gridSize * 0.5);\n\
  float gy = abs(mod(gridUV.y, gridSize) - gridSize * 0.5);\n\
  float gridLine = 1.0 - smoothstep(0.0, lineW, min(gx, gy));\n\
  col += vec3(1.0) * gridLine * 0.035;\n\
  vec3 bgCol = col;\n\
\n\
  if (hit > 0.0) {\n\
    vec3 p = ro + rd * hit;\n\
    vec3 n = calcNormal(p);\n\
\n\
    float NdotV = max(dot(n, -rd), 0.0);\n\
    float fres = pow(1.0 - NdotV, 2.5);\n\
\n\
    vec3 neon = getNeonColor(g_nearestBlob);\n\
\n\
    vec3 waxCol = neon * mix(0.06, 0.18, fres * 0.5);\n\
    float hemiAmt = 0.5 + 0.5 * n.y;\n\
    vec3 hemiAmb = neon * mix(0.02, 0.05, hemiAmt);\n\
    float sss = pow(max(dot(rd, n), 0.0), 2.0) * 0.15;\n\
    col = waxCol + hemiAmb + neon * sss * 0.12;\n\
\n\
    float fog = exp(-hit * 0.05);\n\
    col = mix(vec3(0.006, 0.005, 0.003), col, fog);\n\
\n\
    float edgeAA = smoothstep(HIT_THRESH, 0.0, lastH);\n\
    col = mix(bgCol, col, edgeAA);\n\
\n\
    float rimWide = pow(fres, 1.3);\n\
    float rimTight = pow(fres, 2.0);\n\
    float rimHot = pow(fres, 3.5);\n\
    col += neon * rimWide * 0.35;\n\
    col += neon * rimTight * 1.8;\n\
    col += neon * rimHot * 1.2;\n\
  }\n\
\n\
  float vig = 1.0 - dot(uv * 0.55, uv * 0.55);\n\
  col *= smoothstep(0.0, 0.5, vig);\n\
\n\
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + t) * 43758.5453);\n\
  col += grain * 0.004 - 0.002;\n\
\n\
  gl_FragColor = vec4(col, 1.0);\n\
}\n\
";

	const compileShader = (src, type) => {
		const s = gl.createShader(type);
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
			console.error("Shader:", gl.getShaderInfoLog(s));
		return s;
	};

	const prog = gl.createProgram();
	gl.attachShader(prog, compileShader(vs, gl.VERTEX_SHADER));
	gl.attachShader(prog, compileShader(fs, gl.FRAGMENT_SHADER));
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
		console.error("Link:", gl.getProgramInfoLog(prog));
	gl.useProgram(prog);

	const buf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
		gl.STATIC_DRAW,
	);
	const pLoc = gl.getAttribLocation(prog, "p");
	gl.enableVertexAttribArray(pLoc);
	gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

	const tLoc = gl.getUniformLocation(prog, "t");
	const rLoc = gl.getUniformLocation(prog, "r");
	const seedLoc = gl.getUniformLocation(prog, "seed");
	const preloadLoc = gl.getUniformLocation(prog, "u_preloadProgress");
	const seedVal = Math.random();
	gl.uniform1f(seedLoc, seedVal);
	gl.uniform1f(preloadLoc, 0.0);

	// The shader is decorative: bound its cost independently of Retina/4K screens.
	const MAX_PIXELS = isMobileDevice ? 400000 : 800000;
	let animationTime = 0;
	let lastFrame = 0;
	const FRAME_INTERVAL = isMobileDevice ? 1000 / 15 : 1000 / 24;
	const draw = () => {
		gl.uniform1f(tLoc, animationTime);
		gl.uniform2f(rLoc, c.width, c.height);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	};
	const resize = () => {
		const w = c.clientWidth || innerWidth;
		const h = c.clientHeight || innerHeight;
		const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
		const width = Math.max(1, Math.floor(w * scale));
		const height = Math.max(1, Math.floor(h * scale));
		if (c.width === width && c.height === height) return;
		c.width = width;
		c.height = height;
		gl.viewport(0, 0, width, height);
		draw(); // Keep a visible static frame when motion is disabled.
	};
	window._shaderResize = resize;
	resize();

	const render = (time) => {
		shaderAnimId = null;
		if (shaderPaused) return;
		if (time - lastFrame >= FRAME_INTERVAL) {
			// Do not jump ahead after a scroll pause or a hidden tab.
			animationTime += lastFrame ? Math.min(time - lastFrame, 100) * 0.001 : 0;
			lastFrame = time;
			draw();
		}
		shaderAnimId = requestAnimationFrame(render);
	};
	window._shaderRender = render;
	window._shaderWake = () => {
		lastFrame = 0;
	};
	c.classList.add("active");

	window._setPreloadProgress = (v) => {
		gl.useProgram(prog);
		gl.uniform1f(preloadLoc, Math.min(1.0, Math.max(0.0, v)));
	};
} // end if (gl && !fallback)

// One scheduler owns the animation. Scroll, visibility, and user preference
// cannot accidentally start duplicate loops or override a manual pause.
var scrollActive = false;
var scrollTimer = null;
var resizeTimer = null;
var resizePending = false;
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
motionTogglePaused = motionPreference.matches;

function pauseShader() {
	if (shaderAnimId !== null) cancelAnimationFrame(shaderAnimId);
	shaderAnimId = null;
	shaderPaused = true;
	document.body.classList.add("background-paused");
}
function resumeShader() {
	if (motionTogglePaused || document.hidden || scrollActive) {
		pauseShader();
		return;
	}
	shaderPaused = false;
	document.body.classList.remove("background-paused");
	if (shaderAnimId === null && window._shaderRender) {
		if (window._shaderWake) window._shaderWake();
		shaderAnimId = requestAnimationFrame(window._shaderRender);
	}
}
function finishResize() {
	if (!resizePending || scrollActive || document.hidden) return;
	resizePending = false;
	if (window._shaderResize) window._shaderResize();
}
function holdForScroll() {
	scrollActive = true;
	pauseShader();
	clearTimeout(scrollTimer);
	scrollTimer = setTimeout(() => {
		scrollActive = false;
		finishResize();
		resumeShader();
	}, 220);
}
for (const name of ["scroll", "wheel", "touchstart", "touchmove"]) {
	window.addEventListener(name, holdForScroll, { passive: true });
}
window.addEventListener(
	"resize",
	() => {
		resizePending = true;
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(finishResize, 220);
	},
	{ passive: true },
);
motionPreference.addEventListener("change", () => {
	motionTogglePaused = motionPreference.matches;
	resumeShader();
});
document.addEventListener("visibilitychange", () => {
	finishResize();
	resumeShader();
});
resumeShader();
