// bean-hook — the native Stop-hook for Claude Code AND Codex (bean 2.0 coupling).
//
// Both clients share the Stop-hook contract (stdin JSON with cwd/stop_hook_active; block via
// {"decision":"block","reason":...} on stdout), so one binary serves both. Wired via
// hooks/hooks.json (Claude) / ~/.codex/hooks.json (Codex). When the agent tries to finish, this runs
// bean-check on the project's ledger; if the loop has NOT converged it blocks the stop and
// feeds the compiler signal back as the reason, so the agent keeps driving — the runtime
// coupled to execution, natively, no wrapper.
//
// Quiet and proportional by construction: if the project has no `.bean/claims.json`, the hook
// is inert (exit 0, allow stop) — it only engages when bean is actually in use. The 8-block
// loop guard (stop_hook_active) is honored.
//
// Stdin: the Stop-hook JSON { cwd, stop_hook_active, ... }. Stdout (to block): a single line
// {"decision":"block","reason":"..."}. Exit 0 always (we never error the user's stop).

use serde_json::Value;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

fn allow() -> ! {
    // empty stdout + exit 0 = let the agent stop
    std::process::exit(0);
}
fn block(reason: &str) -> ! {
    let d = serde_json::json!({ "decision": "block", "reason": reason });
    println!("{}", serde_json::to_string(&d).unwrap());
    std::process::exit(0);
}

fn bean_check_path() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let dir = exe.parent().unwrap_or_else(|| Path::new("."));
    let p = dir.join("bean-check");
    if p.exists() {
        p
    } else {
        PathBuf::from("bean-check")
    }
}

// `bean-hook --register <config-dir> [file]` idempotently merges a Stop hook into
// <dir>/<file> (default settings.json) pointing at this binary's absolute path. Used by
// install.sh so a clone+install wires the coupling for both Claude Code (settings.json) and
// Codex (hooks.json) — the Stop-hook JSON schema and {"decision":"block"} contract are shared.
// Robust JSON, no jq.
fn register(dir: &str, file: &str) -> ! {
    let self_path = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "bean-hook".into());
    let settings = Path::new(dir).join(file);
    let mut root: Value = std::fs::read_to_string(&settings)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if !root.is_object() {
        root = serde_json::json!({});
    }
    // coerce malformed existing shapes instead of panicking: hooks must be an object, Stop an array
    let rootobj = root.as_object_mut().unwrap();
    if !rootobj.get("hooks").map(|v| v.is_object()).unwrap_or(false) {
        rootobj.insert("hooks".into(), serde_json::json!({}));
    }
    let hooks = rootobj.get_mut("hooks").unwrap().as_object_mut().unwrap();
    if !hooks.get("Stop").map(|v| v.is_array()).unwrap_or(false) {
        hooks.insert("Stop".into(), serde_json::json!([]));
    }
    let arr = hooks.get_mut("Stop").unwrap().as_array_mut().unwrap();
    // dedup: don't add if our command is already registered anywhere under Stop
    let already = arr.iter().any(|grp| {
        grp.get("hooks")
            .and_then(|h| h.as_array())
            .map(|hs| {
                hs.iter()
                    .any(|h| h.get("command").and_then(|c| c.as_str()) == Some(self_path.as_str()))
            })
            .unwrap_or(false)
    });
    if !already {
        arr.push(serde_json::json!({
            "matcher": "",
            "hooks": [{ "type": "command", "command": self_path }]
        }));
    }
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(
        &settings,
        serde_json::to_string_pretty(&root).unwrap() + "\n",
    );
    println!("bean-hook: registered Stop hook in {}", settings.display());
    std::process::exit(0);
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(|s| s.as_str()) == Some("--register") {
        let dir = args.get(1).cloned().unwrap_or_else(|| {
            eprintln!("bean-hook: --register requires a config dir");
            std::process::exit(3);
        });
        let file = args
            .get(2)
            .cloned()
            .unwrap_or_else(|| "settings.json".into());
        register(&dir, &file);
    }

    let mut input = String::new();
    let _ = std::io::stdin().read_to_string(&mut input);
    let payload: Value = serde_json::from_str(&input).unwrap_or(Value::Null);

    // loop guard: after the cap of consecutive blocks, allow the stop
    if payload.get("stop_hook_active").and_then(|v| v.as_bool()) == Some(true) {
        allow();
    }

    // project dir: CLAUDE_PROJECT_DIR, else the stop payload's cwd, else "."
    let proj = std::env::var("CLAUDE_PROJECT_DIR")
        .ok()
        .or_else(|| {
            payload
                .get("cwd")
                .and_then(|v| v.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| ".".into());

    // inert unless bean is actually in use here (quiet / proportional)
    if !Path::new(&proj).join(".bean").join("claims.json").exists() {
        allow();
    }

    // adjudicate the ledger. FAIL CLOSED: for a project that IS using bean, a checker that
    // can't run / returns no JSON / returns an unknown status must BLOCK, not silently allow
    // the stop (the loop guard prevents an infinite block). Only the explicit terminal states
    // ready / converged-with-residuals / budget-exceeded allow the stop.
    let out = match Command::new(bean_check_path())
        .args(["--dir", &proj, "--json", "--no-state"])
        .output()
    {
        Ok(o) if o.status.success() || o.status.code().is_some() => o,
        _ => block("bean-check could not be run; refusing to allow stop on an active bean ledger (fix the runtime)"),
    };
    let result: Value = match serde_json::from_slice(&out.stdout) {
        Ok(v) => v,
        Err(_) => {
            block("bean-check returned no parseable result; refusing to allow stop (fail closed)")
        }
    };
    match result.get("status").and_then(|v| v.as_str()) {
        Some("ready") | Some("converged-with-residuals") | Some("budget-exceeded") => allow(),
        Some("blocked") => {} // fall through to build the block reason
        _ => block("bean-check returned no/unknown status; refusing to allow stop (fail closed)"),
    }

    // build the reason: the open fronts the agent must drive before it may stop
    let blockers = result
        .get("blockers")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let lines: Vec<String> = blockers
        .iter()
        .map(|b| {
            format!(
                "{} {}",
                b.get("code").and_then(|v| v.as_str()).unwrap_or(""),
                b.get("claim").and_then(|v| v.as_str()).unwrap_or("")
            )
        })
        .collect();
    let reason =
        format!(
        "bean-check: the loop has not converged ({} open front(s): {}). Drive the most decisive \
open front to a terminal state — fix-and-verify, confirm a non-issue, or name a true residual \
with a reason — update .bean/claims.json, then stop.",
        blockers.len(),
        if lines.is_empty() { "see .bean".into() } else { lines.join("; ") }
    );
    let decision = serde_json::json!({ "decision": "block", "reason": reason });
    println!("{}", serde_json::to_string(&decision).unwrap());
    std::process::exit(0);
}
