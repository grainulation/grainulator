/**
 * MCP crash-safety handler — shared across wheat, mill, silo.
 *
 * Async errors OFF the request path (setTimeout, event emitters, stream
 * errors) bypass the per-request try/catch in an MCP stdio server and would
 * otherwise kill the process silently, leaving Claude Code with a mysterious
 * disconnect. This helper installs `uncaughtException` + `unhandledRejection`
 * listeners that:
 *   1. Emit structured JSON to stderr (stdout is reserved for JSON-RPC framing
 *      per MCP spec, 2024-11-05).
 *   2. Call an optional synchronous `onExit` cleanup hook.
 *   3. Exit with code 1 so the parent plugin host sees a clean EOF and can
 *      surface a reload prompt rather than hanging on a dead transport.
 *
 * Recursive-crash guard: if the logger itself throws (e.g., stderr.write EPIPE
 * after parent death), fall back to a minimal plaintext write and exit 2.
 *
 * Usage (ESM):
 *   import { installCrashHandlers } from "./mcp-crash.js";
 *   installCrashHandlers({ service: "wheat", version: pkg.version });
 *
 * Zero dependencies.
 */

/** Exit code for a normal fatal (uncaughtException / unhandledRejection). */
export const CRASH_EXIT_CODE = 1;

/** Exit code when the crash handler itself fails (logger threw). */
export const CRASH_RECURSIVE_EXIT_CODE = 2;

/**
 * Build the structured JSON payload written to stderr on fatal.
 *
 * Exported so unit tests can assert on shape without spawning a subprocess.
 *
 * @param {object} opts
 * @param {string} opts.service  e.g. "wheat"  -> "wheat-mcp" in the payload
 * @param {string} [opts.version="unknown"]
 * @param {"uncaughtException"|"unhandledRejection"} opts.kind
 * @param {Error|unknown} opts.err
 */
export function buildFatalPayload({ service, version, kind, err }) {
  const error = err instanceof Error ? err : new Error(String(err));
  return {
    level: "fatal",
    source: `${service || "mcp"}-mcp`,
    kind,
    name: error.name || "Error",
    message: error.message || String(error),
    stack: error.stack || null,
    version: version || "unknown",
    pid: process.pid,
    time: new Date().toISOString(),
    note:
      kind === "uncaughtException"
        ? "process state undefined; exiting so parent host can reload"
        : "unhandled promise rejection; exiting to avoid undefined state",
  };
}

/**
 * Install `uncaughtException` + `unhandledRejection` handlers on `process`.
 *
 * @param {object} [options]
 * @param {string} [options.service="mcp"]  Service label (e.g., "wheat", "mill").
 * @param {string} [options.version="unknown"]
 * @param {() => void} [options.onExit]     Synchronous cleanup; errors swallowed.
 * @param {{ write(chunk: string): unknown }} [options.stderr=process.stderr]
 * @param {(code: number) => void} [options.exit=process.exit]
 * @param {"install"|"noop"} [options.register="install"]
 *        "noop" returns the same shape but does not attach listeners to `process`
 *        (for unit tests that want to invoke the listeners directly).
 * @param {boolean} [options.includeTestHook]
 *        If truthy and `process.env.BARN_MCP_CRASH_TEST` is set, schedules a
 *        deferred throw/rejection ~50ms after install so subprocess tests can
 *        exercise the real handlers. Defaults to true when the env var is
 *        present; set false to opt out explicitly.
 * @returns {{
 *   uninstall(): void,
 *   listeners: {
 *     uncaughtException: (err: Error) => void,
 *     unhandledRejection: (reason: unknown) => void,
 *   }
 * }}
 */
export function installCrashHandlers(options = {}) {
  const {
    service = "mcp",
    version = "unknown",
    onExit,
    stderr = process.stderr,
    exit = process.exit.bind(process),
    register = "install",
  } = options;
  const includeTestHook =
    options.includeTestHook === undefined
      ? Boolean(process.env.BARN_MCP_CRASH_TEST)
      : Boolean(options.includeTestHook);

  // Per-install recursive-crash guard. Scoped to the closure so multiple
  // installs (each removed via uninstall) stay isolated.
  let crashHandlerRunning = false;

  function logFatalToStderr(kind, err) {
    if (crashHandlerRunning) {
      // Logger already failing — emergency plaintext fallback.
      try {
        stderr.write(`${service}-mcp: recursive crash in ${kind}\n`);
      } catch {
        /* give up — nothing else we can do */
      }
      exit(CRASH_RECURSIVE_EXIT_CODE);
      return;
    }
    crashHandlerRunning = true;
    try {
      const payload = buildFatalPayload({ service, version, kind, err });
      stderr.write(`${JSON.stringify(payload)}\n`);
    } catch {
      // Last-ditch plain-text fallback if JSON.stringify or stderr.write throws.
      try {
        stderr.write(
          `${service}-mcp FATAL ${kind}: ${err && err.message ? err.message : String(err)}\n`,
        );
      } catch {
        /* nothing more we can do */
      }
    }
  }

  function runOnExitSafely() {
    if (typeof onExit !== "function") return;
    try {
      onExit();
    } catch {
      // Swallow — onExit errors must never mask the original fatal.
    }
  }

  const uncaughtHandler = (err) => {
    logFatalToStderr("uncaughtException", err);
    runOnExitSafely();
    // V8 state is undefined after uncaughtException — never keep running.
    exit(CRASH_EXIT_CODE);
  };

  const rejectionHandler = (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logFatalToStderr("unhandledRejection", err);
    runOnExitSafely();
    // Match uncaughtException posture: exit so the parent host can reload.
    // Node 20+ default for --unhandled-rejections is `throw` which would
    // already terminate; being explicit is safer than relying on defaults.
    exit(CRASH_EXIT_CODE);
  };

  let installed = false;
  if (register === "install") {
    process.on("uncaughtException", uncaughtHandler);
    process.on("unhandledRejection", rejectionHandler);
    installed = true;
  }

  // Test-only hook: when BARN_MCP_CRASH_TEST is set, schedule the
  // corresponding crash shortly after startup so the test suite can verify
  // the handlers above fire correctly. Never triggered in production unless
  // the env var is explicitly set.
  if (includeTestHook && process.env.BARN_MCP_CRASH_TEST) {
    const mode = process.env.BARN_MCP_CRASH_TEST;
    setTimeout(() => {
      if (mode === "uncaught") {
        throw new Error("BARN_MCP_CRASH_TEST uncaught");
      }
      if (mode === "unhandled") {
        Promise.reject(new Error("BARN_MCP_CRASH_TEST unhandled"));
      }
    }, 50);
  }

  return {
    listeners: {
      uncaughtException: uncaughtHandler,
      unhandledRejection: rejectionHandler,
    },
    uninstall() {
      if (!installed) return;
      process.off("uncaughtException", uncaughtHandler);
      process.off("unhandledRejection", rejectionHandler);
      installed = false;
    },
  };
}
