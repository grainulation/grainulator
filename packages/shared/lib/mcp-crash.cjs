/**
 * mcp-crash.cjs — CommonJS mirror of lib/mcp-crash.js for CJS consumers.
 * Keep in sync with mcp-crash.js (same API surface).
 */

"use strict";

const CRASH_EXIT_CODE = 1;
const CRASH_RECURSIVE_EXIT_CODE = 2;

function buildFatalPayload({ service, version, kind, err }) {
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

function installCrashHandlers(options = {}) {
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

  let crashHandlerRunning = false;

  function logFatalToStderr(kind, err) {
    if (crashHandlerRunning) {
      try {
        stderr.write(`${service}-mcp: recursive crash in ${kind}\n`);
      } catch {
        /* give up */
      }
      exit(CRASH_RECURSIVE_EXIT_CODE);
      return;
    }
    crashHandlerRunning = true;
    try {
      const payload = buildFatalPayload({ service, version, kind, err });
      stderr.write(`${JSON.stringify(payload)}\n`);
    } catch {
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
      /* swallow */
    }
  }

  const uncaughtHandler = (err) => {
    logFatalToStderr("uncaughtException", err);
    runOnExitSafely();
    exit(CRASH_EXIT_CODE);
  };

  const rejectionHandler = (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logFatalToStderr("unhandledRejection", err);
    runOnExitSafely();
    exit(CRASH_EXIT_CODE);
  };

  let installed = false;
  if (register === "install") {
    process.on("uncaughtException", uncaughtHandler);
    process.on("unhandledRejection", rejectionHandler);
    installed = true;
  }

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

module.exports = {
  CRASH_EXIT_CODE,
  CRASH_RECURSIVE_EXIT_CODE,
  buildFatalPayload,
  installCrashHandlers,
};
