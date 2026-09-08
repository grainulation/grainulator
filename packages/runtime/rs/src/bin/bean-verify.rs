// bean-verify — the (only) execution path for bean 2.0 oracles (Rust).
//
// bean-check is a pure adjudicator: it reads recorded verdicts, never runs anything.
// bean-verify is the quarantined, opt-in counterpart that RUNS a declared oracle command and
// deposits a scrubbed verdict bean-check can replay. Keeping execution here is what lets
// bean-check stay deterministic and side-effect-free.
//
//   bean-verify --dir <path> --claim <id> --verifier <name>
//
// Reads .bean/claims.json + .bean/run.json (the `oracles` registry). Runs the registered
// command (argv, no shell, claim JSON on stdin). Writes:
//   .bean/verdicts/<claim>.<verifier>.json      committed, SCRUBBED (hashes + verdict only)
//   .bean/verdicts-raw/<claim>.<verifier>.log   local diagnostic (gitignore it)
//
// Exit: 0 = pass recorded, 1 = fail recorded, 2 = error recorded, 3 = usage/load error.

use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;
use std::process::{exit, Command, Stdio};

fn sha_hex(s: &str) -> String {
    sha_hex_bytes(s.as_bytes())
}
fn sha_hex_bytes(b: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(b);
    h.finalize().iter().map(|x| format!("{:02x}", x)).collect()
}
// contentHash MUST match bean-check exactly (claim_binding is compared against it).
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
    eprintln!("bean-verify: {msg}");
    exit(code);
}
// reject ids that could escape the verdicts dir (they become filenames). Matches bean-check.
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}
// hash a declared input set. MUST match bean-check's inputs_hash exactly (byte-based,
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
                println!("bean-verify --dir <path> --claim <id> --verifier <name>");
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

    let bean_dir = Path::new(&dir).join(".bean");
    let raw: Value = std::fs::read_to_string(bean_dir.join("claims.json"))
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

    let run: Value = std::fs::read_to_string(bean_dir.join("run.json"))
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
    if cmd.is_empty() {
        die(3, &format!("verifier {verifier} has no cmd argv"));
    }
    let timeout_ms = oracle.get("timeout_ms").and_then(|v| v.as_u64());

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
            let _ = c
                .stdin
                .take()
                .unwrap()
                .write_all(serde_json::to_string(claim).unwrap().as_bytes());
            // best-effort timeout via wait loop
            let out = if let Some(ms) = timeout_ms {
                wait_timeout(c, ms)
            } else {
                c.wait_with_output_compat()
            };
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
        "schema": "bean.verdict/2",
        "claim": claim_id,
        "verifier": verifier,
        "verdict": verdict,
        "oracle_digest": sha_hex(&serde_json::to_string(&cmd).unwrap()),
        "inputs_hash": inputs_hash(Path::new(&dir), &inputs),
        "claim_binding": content_hash(claim),
    });
    let vdir = bean_dir.join("verdicts");
    let _ = std::fs::create_dir_all(&vdir);
    let _ = std::fs::write(
        vdir.join(format!("{claim_id}.{verifier}.json")),
        serde_json::to_string_pretty(&artifact).unwrap() + "\n",
    );
    // local-only raw diagnostic (may carry paths — never committed)
    let rdir = bean_dir.join("verdicts-raw");
    let _ = std::fs::create_dir_all(&rdir);
    let _ = std::fs::write(
        rdir.join(format!("{claim_id}.{verifier}.log")),
        format!("exit={exit_code:?}\n--- stdout ---\n{stdout}\n--- stderr ---\n{stderr}\n"),
    );

    println!("bean-verify: {verdict}  {claim_id}.{verifier}");
    exit(match verdict.as_str() {
        "pass" => 0,
        "fail" => 1,
        _ => 2,
    });
}

// minimal wait-with-timeout (poll) returning (exit_code, stdout, stderr)
trait WaitOutput {
    fn wait_with_output_compat(&mut self) -> Option<(Option<i32>, String, String)>;
}
impl WaitOutput for std::process::Child {
    fn wait_with_output_compat(&mut self) -> Option<(Option<i32>, String, String)> {
        use std::io::Read;
        let mut so = String::new();
        let mut se = String::new();
        if let Some(mut s) = self.stdout.take() {
            let _ = s.read_to_string(&mut so);
        }
        if let Some(mut s) = self.stderr.take() {
            let _ = s.read_to_string(&mut se);
        }
        let st = self.wait().ok()?;
        Some((st.code(), so, se))
    }
}
fn wait_timeout(c: &mut std::process::Child, ms: u64) -> Option<(Option<i32>, String, String)> {
    use std::io::Read;
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(ms);
    loop {
        match c.try_wait() {
            Ok(Some(st)) => {
                let mut so = String::new();
                let mut se = String::new();
                if let Some(mut s) = c.stdout.take() {
                    let _ = s.read_to_string(&mut so);
                }
                if let Some(mut s) = c.stderr.take() {
                    let _ = s.read_to_string(&mut se);
                }
                return Some((st.code(), so, se));
            }
            Ok(None) => {
                if std::time::Instant::now() > deadline {
                    let _ = c.kill();
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(10));
            }
            Err(_) => return None,
        }
    }
}
