import { tryReadStaticFile } from "../../shared/lib/fs-safe.cjs";
/**
 * wheat serve — local HTTP server for the wheat sprint dashboard
 *
 * Three-column IDE-shell layout: topics | claims | detail.
 * SSE for live updates, POST endpoint for recompilation.
 * Zero npm dependencies (node:http only).
 *
 * Usage:
 *   wheat serve [--port 9092] [--dir /path/to/sprint]
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectSprints } from "../../shared/tools/detect-sprints.js";
import { compile as runCompiler } from "../compiler/wheat-compiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Crash handlers ──
process.on("uncaughtException", (err) => {
	process.stderr.write(
		`[${new Date().toISOString()}] FATAL: ${err.stack || err}\n`,
	);
	process.exit(1);
});
process.on("unhandledRejection", (reason) => {
	process.stderr.write(
		`[${new Date().toISOString()}] WARN unhandledRejection: ${reason}\n`,
	);
});

const PUBLIC_DIR = path.join(__dirname, "..", "public");

// ── Verbose logging ──────────────────────────────────────────────────────────

const verbose = process.argv.includes("--verbose");
function vlog(...a) {
	if (!verbose) return;
	const ts = new Date().toISOString();
	process.stderr.write(`[${ts}] wheat: ${a.join(" ")}\n`);
}

// ── Routes manifest ──────────────────────────────────────────────────────────

const ROUTES = [
	{
		method: "GET",
		path: "/events",
		description: "SSE event stream for live sprint updates",
	},
	{
		method: "GET",
		path: "/api/state",
		description: "Current sprint state (claims, compilation, sprints)",
	},
	{
		method: "GET",
		path: "/api/claims",
		description:
			"Claims list with optional ?topic, ?type, ?evidence, ?status filters",
	},
	{
		method: "GET",
		path: "/api/coverage",
		description: "Compilation coverage data",
	},
	{
		method: "GET",
		path: "/api/compilation",
		description: "Full compilation result",
	},
	{
		method: "POST",
		path: "/api/compile",
		description: "Trigger recompilation of claims",
	},
	{
		method: "GET",
		path: "/api/docs",
		description: "This API documentation page",
	},
];

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
	claims: [],
	compilation: null,
	sprints: [],
	activeSprint: null,
	meta: null,
};

const sseClients = new Set();

function broadcast(event) {
	const data = `data: ${JSON.stringify(event)}\n\n`;
	for (const res of sseClients) {
		try {
			res.write(data);
		} catch {
			sseClients.delete(res);
		}
	}
}

// ── Data loading ──────────────────────────────────────────────────────────────

function loadClaims(root) {
	const claimsPath = path.join(root, "claims.json");
	vlog("read", claimsPath);
	if (!fs.existsSync(claimsPath)) return { meta: null, claims: [] };
	try {
		const data = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
		return { meta: data.meta || null, claims: data.claims || [] };
	} catch {
		return { meta: null, claims: [] };
	}
}

function loadCompilation(root) {
	const compilationPath = path.join(root, "compilation.json");
	vlog("read", compilationPath);
	if (!fs.existsSync(compilationPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(compilationPath, "utf8"));
	} catch {
		return null;
	}
}

function loadSprints(root) {
	try {
		const data = detectSprints(root);
		return {
			sprints: data.sprints || [],
			active: (data.sprints || []).find((s) => s.status === "active") || null,
		};
	} catch {
		return { sprints: [], active: null };
	}
}

function runCompile(root) {
	try {
		const claimsPath = path.join(root, "claims.json");
		const compilationPath = path.join(root, "compilation.json");
		if (!fs.existsSync(claimsPath)) return null;
		runCompiler(claimsPath, compilationPath, root);
		return loadCompilation(root);
	} catch {
		return loadCompilation(root);
	}
}

function refreshState(viewRoot, scanRoot) {
	const sr = scanRoot || viewRoot;
	const sprintData = loadSprints(sr);
	state.sprints = sprintData.sprints;
	state.activeSprint = sprintData.active;

	if (viewRoot === "__all") {
		// Merge claims from all sprints
		const allClaims = [];
		let meta = null;
		for (const s of sprintData.sprints) {
			const sprintRoot = path.resolve(sr, s.path);
			const d = loadClaims(sprintRoot);
			if (s.status === "active" && !meta) meta = d.meta;
			for (const c of d.claims) {
				c._sprint = s.name;
				allClaims.push(c);
			}
		}
		state.meta = meta;
		state.claims = allClaims;
		state.compilation = loadCompilation(sr);
	} else {
		const claimsData = loadClaims(viewRoot);
		state.meta = claimsData.meta;
		state.claims = claimsData.claims;
		state.compilation = loadCompilation(viewRoot);
	}
	broadcast({ type: "state", data: state });
}

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
};

// ── HTTP server ───────────────────────────────────────────────────────────────

function createWheatServer(root, port, corsOrigin) {
	let activeRoot = root;
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, `http://localhost:${port}`);

		// CORS (only when --cors is passed)
		if (corsOrigin) {
			res.setHeader("Access-Control-Allow-Origin", corsOrigin);
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		}

		if (req.method === "OPTIONS" && corsOrigin) {
			res.writeHead(204);
			res.end();
			return;
		}

		vlog("request", req.method, url.pathname);

		// ── API: docs ──
		if (req.method === "GET" && url.pathname === "/api/docs") {
			const html = `<!DOCTYPE html><html><head><title>wheat API</title>
<style>body{font-family:system-ui;background:#0a0e1a;color:#e8ecf1;max-width:800px;margin:40px auto;padding:0 20px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border-bottom:1px solid #1e293b;text-align:left}
th{color:#9ca3af}code{background:#1e293b;padding:2px 6px;border-radius:4px;font-size:13px}</style></head>
<body><h1>wheat API</h1><p>${ROUTES.length} endpoints</p>
<table><tr><th>Method</th><th>Path</th><th>Description</th></tr>
${ROUTES.map(
	(r) =>
		"<tr><td><code>" +
		r.method +
		"</code></td><td><code>" +
		r.path +
		"</code></td><td>" +
		r.description +
		"</td></tr>",
).join("")}
</table></body></html>`;
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(html);
			return;
		}

		// ── SSE ──
		if (req.method === "GET" && url.pathname === "/events") {
			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			});
			res.write(`data: ${JSON.stringify({ type: "state", data: state })}\n\n`);
			const heartbeat = setInterval(() => {
				try {
					res.write(": heartbeat\n\n");
				} catch {
					clearInterval(heartbeat);
				}
			}, 15000);
			sseClients.add(res);
			vlog("sse", `client connected (${sseClients.size} total)`);
			req.on("close", () => {
				clearInterval(heartbeat);
				sseClients.delete(res);
				vlog("sse", `client disconnected (${sseClients.size} total)`);
			});
			return;
		}

		// ── API: state ──
		if (req.method === "GET" && url.pathname === "/api/state") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(state));
			return;
		}

		// ── API: claims (with optional filters) ──
		if (req.method === "GET" && url.pathname === "/api/claims") {
			let claims = state.claims;
			const topic = url.searchParams.get("topic");
			const evidence = url.searchParams.get("evidence");
			const type = url.searchParams.get("type");
			const status = url.searchParams.get("status");
			if (topic) claims = claims.filter((c) => c.topic === topic);
			if (evidence) claims = claims.filter((c) => c.evidence === evidence);
			if (type) claims = claims.filter((c) => c.type === type);
			if (status) claims = claims.filter((c) => c.status === status);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(claims));
			return;
		}

		// ── API: coverage ──
		if (req.method === "GET" && url.pathname === "/api/coverage") {
			const coverage = state.compilation?.coverage || {};
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(coverage));
			return;
		}

		// ── API: compilation ──
		if (req.method === "GET" && url.pathname === "/api/compilation") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(state.compilation));
			return;
		}

		// ── API: compile (trigger recompilation) ──
		if (req.method === "POST" && url.pathname === "/api/compile") {
			const compileRoot = activeRoot === "__all" ? root : activeRoot;
			state.compilation = runCompile(compileRoot);
			refreshState(activeRoot, root);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(state));
			return;
		}

		// ── API: switch sprint ──
		if (req.method === "POST" && url.pathname === "/api/switch") {
			let body = "";
			req.on("data", (chunk) => (body += chunk));
			req.on("end", () => {
				try {
					const { sprint } = JSON.parse(body);
					if (sprint === "__all") {
						activeRoot = "__all";
					} else if (!sprint) {
						activeRoot = root;
					} else {
						const s = state.sprints.find((sp) => sp.name === sprint);
						if (s) {
							activeRoot = path.resolve(root, s.path);
						} else {
							activeRoot = root;
						}
					}
					refreshState(activeRoot, root);
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(state));
				} catch {
					res.writeHead(400);
					res.end("bad request");
				}
			});
			return;
		}

		// ── Static files ──
		const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
		const resolved = path.resolve(PUBLIC_DIR, "." + filePath);
		if (!resolved.startsWith(PUBLIC_DIR)) {
			res.writeHead(403);
			res.end("forbidden");
			return;
		}

		const staticContent = tryReadStaticFile(PUBLIC_DIR, resolved);
		if (staticContent !== null) {
			const ext = path.extname(resolved);
			res.writeHead(200, {
				"Content-Type": MIME[ext] || "application/octet-stream",
			});
			res.end(staticContent);
			return;
		}

		res.writeHead(404);
		res.end("not found");
	});

	// ── File watching ──
	const claimsPath = path.join(root, "claims.json");
	const compilationPath = path.join(root, "compilation.json");
	if (fs.existsSync(claimsPath)) {
		fs.watchFile(claimsPath, { interval: 2000 }, () =>
			refreshState(activeRoot, root),
		);
	}
	if (fs.existsSync(compilationPath)) {
		fs.watchFile(compilationPath, { interval: 2000 }, () =>
			refreshState(activeRoot, root),
		);
	}

	// ── Start ──
	refreshState(root, root);

	// ── Graceful shutdown ──
	const shutdown = (signal) => {
		console.log(`\nwheat: ${signal} received, shutting down...`);
		for (const res of sseClients) {
			try {
				res.end();
			} catch {}
		}
		sseClients.clear();
		server.close(() => process.exit(0));
		setTimeout(() => process.exit(1), 5000);
	};
	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	server.on("error", (err) => {
		if (err.code === "EADDRINUSE") {
			console.error(`\nwheat: port ${port} is already in use.`);
			console.error(`  Try: wheat serve --port ${Number(port) + 1}`);
			console.error(`  Or stop the process using port ${port}.\n`);
			process.exit(1);
		}
		throw err;
	});

	server.listen(port, "127.0.0.1", () => {
		vlog("listen", `port=${port}`, `root=${root}`);
		console.log(`wheat: serving on http://localhost:${port}`);
		console.log(`  claims: ${state.claims.length} loaded`);
		console.log(
			`  compilation: ${
				state.compilation ? state.compilation.status : "not found"
			}`,
		);
		console.log(`  sprints: ${state.sprints.length} detected`);
		if (state.activeSprint) {
			console.log(
				`  active: ${state.activeSprint.name} (${state.activeSprint.phase})`,
			);
		}
		console.log(`  root: ${root}`);
	});

	return server;
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

export async function run(targetDir, subArgs) {
	let port = 9092;
	const portIdx = subArgs.indexOf("--port");
	if (portIdx !== -1 && subArgs[portIdx + 1]) {
		port = parseInt(subArgs[portIdx + 1], 10);
	}
	const corsIdx = subArgs.indexOf("--cors");
	const corsOrigin =
		corsIdx !== -1 && subArgs[corsIdx + 1] ? subArgs[corsIdx + 1] : null;

	// Walk up to find project root if no claims.json in targetDir
	let root = targetDir;
	if (!fs.existsSync(path.join(root, "claims.json"))) {
		let dir = path.resolve(root);
		for (let i = 0; i < 5; i++) {
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
			if (fs.existsSync(path.join(dir, "claims.json"))) {
				root = dir;
				break;
			}
		}
	}

	createWheatServer(root, port, corsOrigin);
}
