// Self-contained native Stop hook for Claude Code and Codex. No Node, PATH lookup,
// automatic registration, or package-manager dependency. Empty stdout allows a
// stop; a JSON block decision denies it. Both protocol decisions exit zero.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

fn allow() -> ! {
    std::process::exit(0)
}
fn block(reason: &str) -> ! {
    println!(
        "{}",
        serde_json::json!({"decision":"block","reason":reason})
    );
    std::process::exit(0)
}
fn regular(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|m| m.is_file() && !m.file_type().is_symlink())
        .unwrap_or(false)
}
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("grainulator runtime hook [--required|--optional]\nRegister only through explicit grainulator runtime enroll; host configuration is never rewritten by this binary.");
        return;
    }
    if args.iter().any(|a| a != "--required" && a != "--optional") || args.len() > 1 {
        eprintln!("grainulator-runtime-hook: unsupported argument; use grainulator runtime enroll for owned host registration");
        std::process::exit(3)
    }
    // A registered global gate is required by default. An operator must explicitly
    // choose optional invocation; absent markers never establish a fresh root.
    let required = !args.iter().any(|a| a == "--optional");
    let mut input = String::new();
    if std::io::stdin()
        .take(1024 * 1024 + 1)
        .read_to_string(&mut input)
        .is_err()
        || input.len() > 1024 * 1024
    {
        block("Grainulator hook input unreadable or too large; refusing to allow stop");
    }
    let payload: Value = serde_json::from_str(&input).unwrap_or_else(|_| {
        block("Grainulator hook input is invalid JSON; refusing to allow stop")
    });
    if payload.get("stop_hook_active").and_then(|v| v.as_bool()) == Some(true) {
        allow()
    }
    let project = std::env::var("CLAUDE_PROJECT_DIR")
        .ok()
        .or_else(|| {
            payload
                .get("cwd")
                .and_then(|v| v.as_str())
                .map(String::from)
        })
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| {
            block("Grainulator hook requires an absolute workspace; refusing to allow stop")
        });
    let project = std::fs::canonicalize(project)
        .unwrap_or_else(|_| block("Grainulator workspace is unreadable; refusing to allow stop"));
    let runtime = project.join(".grainulator/runtime");
    for p in [project.join(".grainulator"), runtime.clone()] {
        if std::fs::symlink_metadata(&p)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
        {
            block("Grainulator runtime state must not use symlinked directories; refusing to allow stop");
        }
    }
    let receipt_path = runtime.join("enrollment.json");
    if !receipt_path.exists() {
        if !required && !runtime.join("claims.json").exists() {
            allow()
        }
        block("Grainulator runtime enrollment is missing; explicitly enroll this workspace or record its not-managed policy before stopping");
    }
    if !regular(&receipt_path) {
        block("Grainulator enrollment receipt is not a regular file; refusing to allow stop")
    }
    let receipt: Value = std::fs::read(&receipt_path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_else(|| {
            block("Grainulator enrollment receipt is invalid; refusing to allow stop")
        });
    if receipt.get("schema").and_then(|v| v.as_str()) != Some("grainulator.runtime.enrollment.v1")
        || receipt.get("state").and_then(|v| v.as_str()) != Some("complete")
    {
        block("Grainulator runtime enrollment is incomplete; restore or complete the recorded handoff before stopping");
    }
    let registered_workspace = receipt
        .get("workspace")
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .and_then(|p| std::fs::canonicalize(p).ok());
    if registered_workspace.as_deref() != Some(project.as_path())
        || !matches!(
            receipt.get("origin").and_then(|v| v.as_str()),
            Some("new") | Some("converted")
        )
    {
        block("Grainulator enrollment belongs to another or unknown workspace; explicitly enroll this root before stopping");
    }
    if receipt.get("policy").and_then(|v| v.as_str()) == Some("not-managed") {
        allow()
    }
    if receipt.get("policy").and_then(|v| v.as_str()) != Some("required")
        || !regular(&runtime.join("claims.json"))
    {
        block("Grainulator required runtime ledger or policy is missing; refusing to allow stop");
    }
    let exe = std::env::current_exe()
        .unwrap_or_else(|_| block("Grainulator hook identity is unknown; refusing to allow stop"));
    let asset_dir = exe.parent().unwrap_or_else(|| {
        block("Grainulator hook asset identity is unknown; refusing to allow stop")
    });
    let pinned = receipt
        .get("asset_directory")
        .and_then(|v| v.as_str())
        .map(PathBuf::from)
        .and_then(|p| std::fs::canonicalize(p).ok());
    if pinned.as_deref() != std::fs::canonicalize(asset_dir).ok().as_deref()
        || receipt.get("asset_version").and_then(|v| v.as_str()) != Some(env!("CARGO_PKG_VERSION"))
    {
        block("Grainulator hook differs from the enrolled release; complete the explicit version handoff before stopping");
    }
    let checker = asset_dir.join("grainulator-runtime-check");
    if !regular(&checker) {
        block("Grainulator checker is missing; refusing to allow stop (fail closed)")
    }
    let bytes = std::fs::read(&checker)
        .unwrap_or_else(|_| block("Grainulator checker unreadable; refusing to allow stop"));
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if receipt.get("checker_sha256").and_then(|v| v.as_str()) != Some(digest.as_str()) {
        block("Grainulator checker does not match its enrollment receipt; refusing to allow stop");
    }
    let out = Command::new(checker)
        .args(["--dir", &project.to_string_lossy(), "--json", "--no-state"])
        .output()
        .unwrap_or_else(|_| block("Grainulator checker could not run; refusing to allow stop"));
    let result: Value = serde_json::from_slice(&out.stdout).unwrap_or_else(|_| {
        block("Grainulator checker returned invalid JSON; refusing to allow stop")
    });
    match result.get("status").and_then(|v|v.as_str()) {
        Some("ready") | Some("converged-with-residuals") | Some("budget-exceeded") => allow(),
        Some("blocked") => block(&format!("Grainulator runtime has unresolved fronts: {}. Use grainulator runtime claim and verify to resolve them.", result.get("blockers").unwrap_or(&Value::Null))),
        _ => block("Grainulator checker returned an unknown status; refusing to allow stop")
    }
}
