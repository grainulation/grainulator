// bean-run — the driver that COUPLES the runtime to execution (Rust, bean 2.0).
//
// bean-check is a passive adjudicator a model invokes when it remembers to. bean-run owns the
// round-loop and drives an agent step-by-step on the injected compiler signal, so the agent
// cannot drift past the runtime. The runtime drives; the agent reasons.
//
//   bean-run --dir <path> --agent "<command>" [--max-rounds N] [--json]
//
// Per round: (1) compile via the sibling bean-check binary, (2) inject the signal + goal +
// ledger into the agent's prompt (stdin), (3) the agent does real work and emits a JSON array
// of claims on stdout, which are upserted into the ledger by id. PIVOT, DON'T STOP: a round
// that leaves the open-front FRONTIER unchanged while still blocked is a PIVOT (inject a
// change-approach directive and keep going); only after ALLOWED_PIVOTS consecutive no-progress
// rounds is it a true "stuck" stop. Exhausting --max-rounds is the hard ceiling (budget-
// exceeded), not "stuck". The only true stops are ready / converged-with-residuals / budget /
// stuck.
//
// The agent contract is model-agnostic: --agent is a command; the prompt goes on stdin, claims
// JSON comes back on stdout. Wire "claude -p", "codex exec -", or any script honoring it.
//
// Exit: 0 = ready, 4 = converged-with-residuals, 2 = budget-exceeded, 5 = stuck, 3 = usage/load.

use serde_json::Value;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::{exit, Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

fn die(code: i32, msg: &str) -> ! {
    eprintln!("bean-run: {msg}");
    exit(code);
}

// locate the sibling bean-check binary (same dir as this executable)
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

fn load_value(p: &Path) -> Option<Value> {
    std::fs::read_to_string(p)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
}

fn read_claims(bean_dir: &Path) -> Vec<Value> {
    let raw = load_value(&bean_dir.join("claims.json")).unwrap_or_else(|| die(3, "no claims.json"));
    match raw {
        Value::Array(a) => a,
        Value::Object(o) => match o.get("claims") {
            Some(Value::Array(a)) => a.clone(),
            _ => die(3, "claims.json must be an array or { claims }"),
        },
        _ => die(3, "claims.json must be an array or { claims }"),
    }
}

fn write_claims(bean_dir: &Path, claims: &[Value]) {
    // preserve the { claims: [...] } envelope if the file used one
    let p = bean_dir.join("claims.json");
    let out = match load_value(&p) {
        Some(Value::Object(mut o)) if o.contains_key("claims") => {
            o.insert("claims".into(), Value::Array(claims.to_vec()));
            Value::Object(o)
        }
        _ => Value::Array(claims.to_vec()),
    };
    let _ = std::fs::write(&p, serde_json::to_string_pretty(&out).unwrap() + "\n");
}

// pull the last TOP-LEVEL JSON array from the agent's stdout (string-aware; claims contain
// nested arrays, so a naive lastIndexOf('[') would grab a nested bracket).
fn parse_claims(out: &str) -> Vec<Value> {
    let (mut depth, mut start, mut in_str, mut esc) = (0i32, -1i64, false, false);
    let bytes = out.as_bytes();
    let mut spans: Vec<(usize, usize)> = vec![];
    for (i, &ch) in bytes.iter().enumerate() {
        if in_str {
            if esc {
                esc = false;
            } else if ch == b'\\' {
                esc = true;
            } else if ch == b'"' {
                in_str = false;
            }
            continue;
        }
        match ch {
            b'"' => in_str = true,
            b'[' => {
                if depth == 0 {
                    start = i as i64;
                }
                depth += 1;
            }
            b']' => {
                depth -= 1;
                if depth == 0 && start >= 0 {
                    spans.push((start as usize, i + 1));
                }
            }
            _ => {}
        }
    }
    for (a, b) in spans.iter().rev() {
        if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(&out[*a..*b]) {
            return arr
                .into_iter()
                .filter(|c| c.get("id").and_then(|v| v.as_str()).is_some())
                .collect();
        }
    }
    vec![]
}

fn id_of(c: &Value) -> &str {
    c.get("id").and_then(|v| v.as_str()).unwrap_or("")
}

// progress signal = the open-front FRONTIER (status + the sorted set of blocker code:claim
// pairs), NOT the certificate. The cert misses blocker-internal changes (discharging one of
// several blockers leaves it untouched until status flips) and trips on unrelated admitted-
// claim noise — so it both hides real progress and fakes it. The frontier moves exactly when
// a front opens or closes, which is the thing the pivot/stuck decision actually cares about.
fn frontier(sig: &Value) -> String {
    let status = sig.get("status").and_then(|v| v.as_str()).unwrap_or("");
    let mut fronts: Vec<String> = sig
        .get("blockers")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .map(|bl| {
                    format!(
                        "{}\u{1f}{}",
                        bl.get("code").and_then(|v| v.as_str()).unwrap_or(""),
                        bl.get("claim").and_then(|v| v.as_str()).unwrap_or("")
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    fronts.sort();
    format!("{status}\u{1e}{}", fronts.join("\u{1d}"))
}

// the open-front keys (code:claim) in a compiler signal — used for trace blockers_opened/closed.
fn blocker_keys(sig: &Value) -> Vec<String> {
    sig.get("blockers")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .map(|bl| {
                    format!(
                        "{}:{}",
                        bl.get("code").and_then(|v| v.as_str()).unwrap_or(""),
                        bl.get("claim").and_then(|v| v.as_str()).unwrap_or("")
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

fn epoch_ms(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
fn is_active(c: &Value) -> bool {
    let st = c.get("status").and_then(|v| v.as_str()).unwrap_or("");
    st != "superseded" && st != "rejected" && st != "resolved"
}

// upsert emitted claims into the ledger by id; returns count of new/changed
fn upsert(ledger: &mut Vec<Value>, emitted: Vec<Value>) -> usize {
    let mut changed = 0;
    for c in emitted {
        let cid = id_of(&c).to_string();
        if let Some(slot) = ledger.iter_mut().find(|x| id_of(x) == cid) {
            // shallow-merge emitted fields over the existing claim
            if let (Value::Object(dst), Value::Object(src)) = (&mut *slot, &c) {
                let before = serde_json::to_string(dst).unwrap();
                for (k, v) in src {
                    dst.insert(k.clone(), v.clone());
                }
                if serde_json::to_string(dst).unwrap() != before {
                    changed += 1;
                }
            }
        } else {
            ledger.push(c);
            changed += 1;
        }
    }
    changed
}

fn render_prompt(goal: &str, sig: &Value, claims: &[Value], pivot: bool) -> String {
    let pivot_directive = if pivot {
        "\n\nPIVOT: the last round made NO progress on the current front. Do NOT repeat the same \
move. Change the approach — attack a DIFFERENT open front, supersede a belief, escalate effort, \
or re-frame. Only if every front is genuinely unreachable from here, name them as residuals."
    } else {
        ""
    };
    let active: Vec<&Value> = claims.iter().filter(|c| is_active(c)).collect();
    let ledger = if active.is_empty() {
        "  (empty)".to_string()
    } else {
        active
            .iter()
            .map(|c| {
                format!(
                    "  - {} [{}/{}] {}: {}",
                    id_of(c),
                    c.get("type").and_then(|v| v.as_str()).unwrap_or(""),
                    c.get("evidence").and_then(|v| v.as_str()).unwrap_or(""),
                    c.get("topic").and_then(|v| v.as_str()).unwrap_or(""),
                    c.get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .chars()
                        .take(120)
                        .collect::<String>(),
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let blockers = sig
        .get("blockers")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let blk = if blockers.is_empty() {
        "  (none)".to_string()
    } else {
        blockers
            .iter()
            .map(|b| {
                format!(
                    "  - {} {}",
                    b.get("code").and_then(|v| v.as_str()).unwrap_or(""),
                    b.get("claim").and_then(|v| v.as_str()).unwrap_or("")
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    format!(
        "You are one round of a bean convergence loop. The runtime compiled the ledger; act on \
THIS signal — drive the most decisive open front, do not restate the plan.\n\nGOAL: {goal}\n\n\
COMPILER SIGNAL: status={}, certificate={}\nOPEN BLOCKERS (drive one to a terminal state):\n{}\n\n\
LEDGER (active claims):\n{}{}\n\nDo the real work to drive the top blocker, then emit ONLY a JSON \
array of claim objects recording what you established (new claims or upserts by id). Emit [] if \
nothing changed. The JSON array must be the LAST thing you print, on its own.",
        sig.get("status").and_then(|v| v.as_str()).unwrap_or(""),
        sig.get("certificate")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
        blk,
        ledger,
        pivot_directive,
    )
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut dir = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .to_string();
    let mut agent = String::new();
    let mut max_rounds = 8i64;
    let mut json_out = false;
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
            "--agent" => {
                i += 1;
                agent = args
                    .get(i)
                    .cloned()
                    .unwrap_or_else(|| die(3, "--agent requires a command"));
            }
            "--max-rounds" => {
                i += 1;
                max_rounds = args
                    .get(i)
                    .and_then(|x| x.parse().ok())
                    .unwrap_or_else(|| die(3, "--max-rounds needs an int"));
            }
            "--json" => json_out = true,
            "-h" | "--help" => {
                println!("bean-run --dir <path> --agent \"<command>\" [--max-rounds N] [--json]");
                exit(0);
            }
            other => die(3, &format!("unknown argument: {other}")),
        }
        i += 1;
    }
    if agent.is_empty() {
        die(3, "--agent <command> is required");
    }
    let agent_argv: Vec<&str> = agent.split_whitespace().collect();
    let bean_dir = Path::new(&dir).join(".bean");
    let check = bean_check_path();
    let goal = load_value(&bean_dir.join("run.json"))
        .and_then(|r| r.get("goal").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_else(|| "(no goal set in run.json)".into());

    let compile = || -> Value {
        let o = Command::new(&check)
            .args(["--dir", &dir, "--json", "--no-state"])
            .output()
            .unwrap_or_else(|e| die(3, &format!("bean-check failed: {e}")));
        serde_json::from_slice(&o.stdout)
            .unwrap_or_else(|_| die(3, "bean-check did not return JSON"))
    };

    // pivot, don't stop: tolerate this many consecutive no-progress rounds (each one pivots to
    // a different front/approach) before declaring a true "stuck" stop. ALLOWED_PIVOTS=2 means
    // two no-progress rounds are turned into pivots; a third with still no progress is "stuck".
    const ALLOWED_PIVOTS: i32 = 2;
    // trace artifact v0: stamp the run boundary + accumulate the set of open fronts ever seen.
    let run_start = SystemTime::now();
    let started_at = epoch_ms(run_start);
    let run_id = format!(
        "run-{}",
        run_start
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0)
    );
    let mut blockers_seen: BTreeSet<String> = BTreeSet::new();
    let mut trace: Vec<Value> = vec![];
    // Natural max-rounds exhaustion is the hard round ceiling (budget-exceeded, exit 2), NOT
    // "stuck": bean-check runs with --no-state here, so it never emits budget-exceeded itself —
    // the driver owns the ceiling. "stuck" is reserved for repeated pivots that made no progress.
    let mut outcome = String::from("budget-exceeded");
    let mut prev_frontier: Option<String> = None;
    let mut no_progress = 0;
    for round in 1..=max_rounds {
        let mut claims = read_claims(&bean_dir);
        let sig = compile();
        let status = sig.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let cert = sig
            .get("certificate")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let front = frontier(&sig);
        for k in blocker_keys(&sig) {
            blockers_seen.insert(k);
        }
        let has_blockers = sig
            .get("blockers")
            .and_then(|v| v.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        // TRUE STOPS — the only states that end the loop: converged (ready), a genuine residual
        // (converged-with-residuals), or the hard budget ceiling. Everything else is a pivot.
        if status == "ready" || status == "converged-with-residuals" || status == "budget-exceeded"
        {
            outcome = status.to_string();
            break;
        }
        // No progress last round? PIVOT, don't stop: tell the agent to change the front/approach
        // and keep going. Progress is measured by the open-front FRONTIER moving (a blocker
        // discharged or a new one surfaced), NOT the certificate — the cert ignores blocker-
        // driving fields (tags, resolved_by, conflicts_with, depends_on) unless status flips,
        // and resets on unrelated admitted-claim noise, so it both misses real progress and
        // fakes it. Only after ALLOWED_PIVOTS consecutive no-progress rounds is it a true
        // "stuck" stop — stopping on the first stall is the satisficing failure we guard against.
        let mut pivot = false;
        if prev_frontier.as_deref() == Some(front.as_str()) && has_blockers {
            no_progress += 1;
            if no_progress > ALLOWED_PIVOTS {
                outcome = String::from("stuck");
                break;
            }
            pivot = true;
        } else {
            no_progress = 0;
        }
        prev_frontier = Some(front.clone());
        let prompt = render_prompt(&goal, &sig, &claims, pivot);
        let out = Command::new(agent_argv[0])
            .args(&agent_argv[1..])
            .current_dir(&dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                child.stdin.take().unwrap().write_all(prompt.as_bytes())?;
                child.wait_with_output()
            })
            .unwrap_or_else(|e| die(3, &format!("agent command failed: {e}")));
        let emitted = parse_claims(&String::from_utf8_lossy(&out.stdout));
        let recorded = upsert(&mut claims, emitted);
        write_claims(&bean_dir, &claims);
        trace.push(serde_json::json!({ "round": round, "status": status, "certificate": cert, "pivot": pivot, "recorded": recorded }));
        if !json_out {
            eprintln!(
                "bean-run: round {round} {status} (cert {cert}) — recorded {recorded} claim(s)"
            );
        }
    }

    let final_sig = compile();

    // ---- trace artifact v0 ----------------------------------------------------------------
    // Leave behind a stable, useful post-run record so future tooling can analyze runs without
    // scraping transcripts. This does NOT make bean learn across tasks; it only emits the trace.
    // One file per run (.bean/runs/<run_id>.json) — cross-task analysis needs accumulated runs.
    let final_blockers: BTreeSet<String> = blocker_keys(&final_sig).into_iter().collect();
    let blockers_closed = blockers_seen
        .iter()
        .filter(|k| !final_blockers.contains(*k))
        .count();
    // the distinct blocker CODES (E_*) seen across the run — sorted+unique via BTreeSet — so the
    // trace analyzer can rank which gate conditions fire most. Derived from the code:claim keys.
    let blocker_codes: Vec<String> = blockers_seen
        .iter()
        .filter_map(|k| k.split_once(':').map(|(c, _)| c.to_string()))
        .filter(|c| !c.is_empty())
        .collect::<BTreeSet<String>>()
        .into_iter()
        .collect();
    let pivot_count = trace
        .iter()
        .filter(|t| t.get("pivot").and_then(|v| v.as_bool()).unwrap_or(false))
        .count();
    let final_claims = read_claims(&bean_dir);
    let residuals: Vec<Value> = final_claims
        .iter()
        .filter(|c| {
            c.get("tags")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().any(|t| t.as_str() == Some("residual")))
                .unwrap_or(false)
        })
        .map(|c| {
            serde_json::json!({
                "id": c.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                "reason": c.get("content").and_then(|v| v.as_str()).unwrap_or(""),
            })
        })
        .collect();
    let mut verifier_verdicts: Vec<Value> = vec![];
    if let Ok(rd) = std::fs::read_dir(bean_dir.join("verdicts")) {
        let mut paths: Vec<PathBuf> = rd
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
            .collect();
        paths.sort();
        for p in paths {
            if let Some(v) = load_value(&p) {
                verifier_verdicts.push(v);
            }
        }
    }
    let trace_artifact = serde_json::json!({
        "schema_version": "trace/v0",
        "run_id": run_id,
        "goal": goal,
        "started_at": started_at,
        "ended_at": epoch_ms(SystemTime::now()),
        "status": outcome,
        "certificate": final_sig.get("certificate").and_then(|v| v.as_str()).unwrap_or(""),
        "rounds": trace.len(),
        "pivot_count": pivot_count,
        "blockers_opened": blockers_seen.len(),
        "blockers_closed": blockers_closed,
        "blocker_codes": blocker_codes,
        "verifier_verdicts": verifier_verdicts,
        "residuals": residuals,
        "artifacts_changed": Vec::<String>::new(),
        // documented extension hatch: additive/experimental fields go HERE, so the top-level
        // shape stays fixed (the schema rejects unknown top-level keys).
        "metadata": serde_json::Map::new(),
    });
    // Fail CLOSED on a trace-write failure: the trace is part of bean-run's contract, so we must
    // not report a clean exit (0/2/4) if we couldn't persist it. Surface the outcome on stderr,
    // then exit with the infra/load error code (3) — distinct from any convergence outcome.
    let runs_dir = bean_dir.join("runs");
    let trace_path = runs_dir.join(format!("{run_id}.json"));
    let wrote = std::fs::create_dir_all(&runs_dir).and_then(|_| {
        std::fs::write(
            &trace_path,
            serde_json::to_string_pretty(&trace_artifact).unwrap() + "\n",
        )
    });
    if let Err(e) = wrote {
        eprintln!(
            "bean-run: run outcome was {} (cert {}) but the trace could not be persisted",
            outcome,
            final_sig
                .get("certificate")
                .and_then(|v| v.as_str())
                .unwrap_or("")
        );
        die(
            3,
            &format!(
                "could not write trace artifact {}: {e} — failing closed",
                trace_path.display()
            ),
        );
    }

    let report = serde_json::json!({
        "outcome": outcome,
        "rounds": trace.len(),
        "final_status": final_sig.get("status"),
        "certificate": final_sig.get("certificate"),
        "trace": trace,
    });
    if json_out {
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
    } else {
        println!(
            "bean-run: {} after {} round(s) — {} (cert {})",
            outcome,
            trace.len(),
            final_sig
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or(""),
            final_sig
                .get("certificate")
                .and_then(|v| v.as_str())
                .unwrap_or("")
        );
    }
    exit(match outcome.as_str() {
        "ready" => 0,
        "converged-with-residuals" => 4,
        "budget-exceeded" => 2,
        "stuck" => 5,
        _ => 1,
    });
}
