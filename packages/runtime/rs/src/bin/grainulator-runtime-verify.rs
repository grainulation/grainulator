// grainulator-runtime-verify — the (only) execution path for Grainulator runtime oracles (Rust).
//
// grainulator-runtime-check is a pure adjudicator: it reads recorded verdicts, never runs anything.
// grainulator-runtime-verify is the quarantined, opt-in counterpart that RUNS a declared oracle command and
// deposits a scrubbed verdict grainulator-runtime-check can replay. Keeping execution here is what lets
// grainulator-runtime-check stay deterministic and side-effect-free.
//
//   grainulator-runtime-verify --dir <path> --claim <id> --verifier <name>
//
// Reads .grainulator/runtime/claims.json + .grainulator/runtime/run.json (the `oracles` registry). Runs the registered
// command (argv, no shell, claim JSON on stdin). Writes:
//   .grainulator/runtime/verdicts/<claim>.<verifier>.json      committed, SCRUBBED (hashes + verdict only)
//   .grainulator/runtime/verdicts-raw/<claim>.<verifier>.log   local diagnostic (gitignore it)
//
// Exit: 0 = pass recorded, 1 = fail recorded, 2 = error recorded, 3 = usage/load error.

use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
#[path = "../runtime_lock.rs"]
mod runtime_lock;
use runtime_lock::exit;

fn sha_hex(s: &str) -> String {
    sha_hex_bytes(s.as_bytes())
}
fn sha_hex_bytes(b: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(b);
    h.finalize().iter().map(|x| format!("{:02x}", x)).collect()
}
// contentHash MUST match grainulator-runtime-check exactly (claim_binding is compared against it).
fn content_hash(c: &Value) -> String {
    let ty = c.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let topic = c
        .get("topic")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    let content = c
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_lowercase();
    sha_hex(&format!("{ty}|{topic}|{content}"))
}
fn die(code: i32, msg: &str) -> ! {
    eprintln!("grainulator-runtime-verify: {msg}");
    exit(code);
}
// reject ids that could escape the verdicts dir (they become filenames). Matches grainulator-runtime-check.
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}
// hash a declared input set. MUST match grainulator-runtime-check's inputs_hash exactly (byte-based,
// recursive for directories).
fn hash_path(p: &Path) -> String {
    match std::fs::metadata(p) {
        Ok(m) if m.is_file() => std::fs::read(p)
            .map(|b| sha_hex_bytes(&b))
            .unwrap_or_else(|_| "unreadable".into()),
        Ok(m) if m.is_dir() => {
            let mut entries: Vec<std::path::PathBuf> = match std::fs::read_dir(p) {
                Ok(rd) => rd.filter_map(|e| e.ok().map(|e| e.path())).collect(),
                Err(_) => return "unreadable".into(),
            };
            entries.sort();
            let parts: Vec<String> = entries
                .iter()
                .map(|c| {
                    format!(
                        "{}:{}",
                        c.file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default(),
                        hash_path(c)
                    )
                })
                .collect();
            sha_hex(&parts.join("\n"))
        }
        _ => "absent".into(),
    }
}
fn inputs_hash(base: &Path, inputs: &[Value]) -> String {
    let mut paths: Vec<String> = inputs
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    if paths.is_empty() {
        return sha_hex("");
    }
    paths.sort();
    let parts: Vec<String> = paths
        .iter()
        .map(|rel| format!("{rel}:{}", hash_path(&base.join(rel))))
        .collect();
    sha_hex(&parts.join("\n"))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut dir = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .to_string();
    let mut claim_id = String::new();
    let mut verifier = String::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--dir" => {
                i += 1;
                dir = args
                    .get(i)
                    .cloned()
                    .unwrap_or_else(|| die(3, "--dir requires a path"));
            }
            "--claim" => {
                i += 1;
                claim_id = args
                    .get(i)
                    .cloned()
                    .unwrap_or_else(|| die(3, "--claim requires a value"));
            }
            "--verifier" => {
                i += 1;
                verifier = args
                    .get(i)
                    .cloned()
                    .unwrap_or_else(|| die(3, "--verifier requires a value"));
            }
            "-h" | "--help" => {
                println!("grainulator-runtime-verify --dir <path> --claim <id> --verifier <name>");
                exit(0);
            }
            other => die(3, &format!("unknown argument: {other}")),
        }
        i += 1;
    }
    if claim_id.is_empty() || verifier.is_empty() {
        die(3, "both --claim and --verifier are required");
    }
    if !safe_id(&claim_id) || !safe_id(&verifier) {
        die(
            3,
            "--claim and --verifier must match [A-Za-z0-9._-]+ (no path separators)",
        );
    }

    let runtime_dir = std::fs::canonicalize(&dir)
        .unwrap_or_else(|e| die(3, &format!("invalid workspace: {e}")))
        .join(".grainulator/runtime");
    runtime_lock::acquire(&runtime_dir)
        .unwrap_or_else(|e| die(3, &format!("runtime writer lock unavailable: {e}")));
    runtime_lock::migration_reviewed(&runtime_dir).unwrap_or_else(|e| die(3, &e.to_string()));
    let raw: Value = std::fs::read_to_string(runtime_dir.join("claims.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| die(3, "cannot read claims.json"));
    let claims = match &raw {
        Value::Array(a) => a.clone(),
        Value::Object(o) => o
            .get("claims")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_else(|| die(3, "claims.json must be an array or { claims }")),
        _ => die(3, "claims.json must be an array or { claims }"),
    };
    let claim = claims
        .iter()
        .find(|c| c.get("id").and_then(|v| v.as_str()) == Some(claim_id.as_str()))
        .unwrap_or_else(|| die(3, &format!("no claim with id {claim_id}")));

    let run: Value = std::fs::read_to_string(runtime_dir.join("run.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Null);
    // Object.hasOwn-style lookup; reject non-object / missing entries (no prototype bypass)
    let oracle = run
        .get("oracles")
        .and_then(|o| o.as_object())
        .and_then(|m| m.get(&verifier))
        .filter(|v| v.is_object())
        .unwrap_or_else(|| {
            die(
                3,
                &format!("verifier {verifier} is not declared in run.json oracles"),
            )
        });
    let cmd: Vec<String> = oracle
        .get("cmd")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    if cmd.is_empty()
        || !oracle
            .get("cmd")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().all(|v| v.is_string()))
            .unwrap_or(false)
        || cmd[0].is_empty()
    {
        die(3, &format!("verifier {verifier} has no cmd argv"));
    }
    let timeout_ms = oracle.get("timeout_ms").and_then(|v| v.as_u64());

    let pending_path = runtime_dir.join("pending-oracle.json");
    if pending_path.exists() {
        die(3,"an oracle outcome is unresolved; reconcile pending-oracle.json before any explicit rerun");
    }
    let pending = serde_json::json!({"schema":"grainulator.runtime.pending-oracle.v1","claim":claim_id,"verifier":verifier,"state":"effects-unknown-until-committed"});
    runtime_lock::atomic_write(&pending_path, pending.to_string().as_bytes())
        .unwrap_or_else(|e| die(3, &format!("cannot prepare oracle receipt: {e}")));
    // run the oracle: argv, no shell, claim JSON on stdin
    let mut child = Command::new(&cmd[0])
        .args(&cmd[1..])
        .current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let (verdict, exit_code, stdout, stderr) = match child.as_mut() {
        Ok(c) => {
            let stdin = c.stdin.take();
            let claim_bytes = serde_json::to_vec(claim).unwrap();
            std::thread::spawn(move || {
                if let Some(mut input) = stdin {
                    let _ = input.write_all(&claim_bytes);
                }
            });
            // Drain bounded stdout/stderr concurrently so a verbose child cannot
            // deadlock before the timeout is observed.
            let out = wait_bounded(c, timeout_ms.unwrap_or(60000));
            match out {
                Some(o) => {
                    let code = o.0;
                    let v = if code == Some(0) { "pass" } else { "fail" };
                    (v.to_string(), code, o.1, o.2)
                }
                None => (
                    "error".to_string(),
                    None,
                    String::new(),
                    "timeout".to_string(),
                ),
            }
        }
        Err(e) => ("error".to_string(), None, String::new(), e.to_string()),
    };
    // a JSON {verdict} on stdout may only DOWNGRADE or explain — it can NEVER upgrade a
    // nonzero exit (a failing oracle) into a pass. Exit code is authoritative for "did it fail".
    let json_verdict = serde_json::from_str::<Value>(stdout.trim())
        .ok()
        .and_then(|j| j.get("verdict").and_then(|v| v.as_str()).map(String::from))
        .filter(|v| v == "pass" || v == "fail" || v == "error");
    let verdict = match json_verdict {
        // honor a JSON verdict only when it doesn't upgrade a non-pass exit to "pass"
        Some(jv) if !(jv == "pass" && verdict != "pass") => jv,
        _ => verdict,
    };

    let inputs = oracle
        .get("inputs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let artifact = serde_json::json!({
        "schema": "grainulator.runtime.verdict.v1",
        "claim": claim_id,
        "verifier": verifier,
        "verdict": verdict,
        "oracle_digest": sha_hex(&serde_json::to_string(&cmd).unwrap()),
        "inputs_hash": inputs_hash(Path::new(&dir), &inputs),
        "claim_binding": content_hash(claim),
    });
    let vdir = runtime_dir.join("verdicts");
    let vfile = vdir.join(format!("{claim_id}.{verifier}.json"));
    let history = runtime_dir.join("history");
    std::fs::create_dir_all(&vdir).and_then(|_|std::fs::create_dir_all(&history)).unwrap_or_else(|e|die(3,&format!("oracle completed but receipt directories failed: {e}; effects may be unknown, do not automatically replay")));
    if vfile.exists() {
        let prior = std::fs::read(&vfile)
            .unwrap_or_else(|e| die(3, &format!("cannot preserve previous verdict: {e}")));
        let prior_path = history.join(format!("verdict-{}.json", sha_hex_bytes(&prior)));
        if !prior_path.exists() {
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(prior_path)
                .and_then(|mut f| f.write_all(&prior))
                .unwrap_or_else(|e| die(3, &format!("cannot preserve previous verdict: {e}")));
        }
    }
    runtime_lock::atomic_write(&vfile,(serde_json::to_string_pretty(&artifact).unwrap()+"\n").as_bytes()).unwrap_or_else(|e|die(3,&format!("oracle completed but verdict persistence failed: {e}; effects may be unknown, do not automatically replay")));
    let rdir = runtime_dir.join("verdicts-raw");
    std::fs::create_dir_all(&rdir).and_then(|_|runtime_lock::atomic_write(&rdir.join(format!("{claim_id}.{verifier}.log")),format!("exit={exit_code:?}\n--- stdout ---\n{stdout}\n--- stderr ---\n{stderr}\n").as_bytes())).unwrap_or_else(|e|die(3,&format!("oracle completed but diagnostics persistence failed: {e}; reconcile pending oracle before rerun")));
    std::fs::remove_file(pending_path)
        .unwrap_or_else(|e| die(3, &format!("cannot commit oracle completion: {e}")));

    println!("grainulator-runtime-verify: {verdict}  {claim_id}.{verifier}");
    exit(match verdict.as_str() {
        "pass" => 0,
        "fail" => 1,
        _ => 2,
    });
}

// Bounded concurrent pipe reads, with a finite default deadline. Detached readers
// cannot postpone process termination if a descendant retains a pipe descriptor.
fn wait_bounded(child: &mut std::process::Child, ms: u64) -> Option<(Option<i32>, String, String)> {
    use std::io::Read;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};
    const LIMIT: u64 = 1024 * 1024;
    let (sender, receiver) = mpsc::channel();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let output_sender = sender.clone();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(output) = stdout {
            let _ = output.take(LIMIT + 1).read_to_end(&mut bytes);
        }
        let _ = output_sender.send((0, bytes));
    });
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(output) = stderr {
            let _ = output.take(LIMIT + 1).read_to_end(&mut bytes);
        }
        let _ = sender.send((1, bytes));
    });
    let deadline = Instant::now() + Duration::from_millis(ms.min(24 * 60 * 60 * 1000));
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(_) => return None,
        }
    };
    let mut streams = [Vec::new(), Vec::new()];
    for _ in 0..2 {
        let remaining = deadline
            .saturating_duration_since(Instant::now())
            .min(Duration::from_secs(1));
        let (index, bytes) = receiver.recv_timeout(remaining).ok()?;
        if bytes.len() > LIMIT as usize {
            return None;
        }
        streams[index] = bytes;
    }
    Some((
        status.code(),
        String::from_utf8_lossy(&streams[0]).into(),
        String::from_utf8_lossy(&streams[1]).into(),
    ))
}
