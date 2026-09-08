// bean-lessons — the first consumer of the trace artifact (Rust, read-only).
//
// Reads .bean/runs/*.json (trace/v0) and emits a ranked LESSONS-CANDIDATES report to
// .bean/lessons.json (+ optional .bean/lessons.md). It proposes; it never applies. NO mutation
// of claims, prompts, skills, or memory. Deterministic — no LLM, no network.
//
//   bean-lessons --dir <project> [--markdown]
//
// This is NOT cross-task learning. It surfaces patterns for a human (or a later, separate step)
// to act on. See skills/bean/references/lessons.md and schemas/lessons.schema.json.
//
// Exit: 0 = report written with >=1 candidate; 2 = no runs / no candidates above threshold
//       (still writes a report); 3 = invalid trace corpus or write failure.

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::exit;
use std::time::{SystemTime, UNIX_EPOCH};

fn die(code: i32, msg: &str) -> ! {
    eprintln!("bean-lessons: {msg}");
    exit(code);
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}

fn norm(reason: &str) -> String {
    reason
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

// The trace/v0 required keys. bean-lessons is downstream of a strict trace schema; a partial or
// hand-copied corpus must FAIL CLOSED rather than be silently summarized into misleading
// candidates (missing run_id/status/arrays would otherwise default to empty).
const TRACE_REQUIRED: &[&str] = &[
    "schema_version",
    "run_id",
    "goal",
    "started_at",
    "ended_at",
    "status",
    "certificate",
    "rounds",
    "pivot_count",
    "blockers_opened",
    "blockers_closed",
    "blocker_codes",
    "verifier_verdicts",
    "residuals",
    "artifacts_changed",
];

fn validate_trace(v: &Value) -> Result<(), String> {
    for k in TRACE_REQUIRED {
        if v.get(*k).is_none() {
            return Err(format!("missing required field `{k}`"));
        }
    }
    if v.get("run_id")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .is_none()
    {
        return Err("`run_id` must be a non-empty string".into());
    }
    if v.get("status")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .is_none()
    {
        return Err("`status` must be a non-empty string".into());
    }
    if v.get("pivot_count").and_then(|x| x.as_u64()).is_none() {
        return Err("`pivot_count` must be a non-negative integer".into());
    }
    for arr in ["blocker_codes", "verifier_verdicts", "residuals"] {
        if !v.get(arr).map(|x| x.is_array()).unwrap_or(false) {
            return Err(format!("`{arr}` must be an array"));
        }
    }
    Ok(())
}

// A candidate accumulates the distinct runs it covers; count == number of distinct runs.
struct Cand {
    kind: &'static str,
    signal: String,
    // run_id -> status, kept ordered + deduped by run_id
    evidence: BTreeMap<String, String>,
}
impl Cand {
    fn add(&mut self, run_id: &str, status: &str) {
        self.evidence
            .entry(run_id.to_string())
            .or_insert_with(|| status.to_string());
    }
    fn count(&self) -> usize {
        self.evidence.len()
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut dir = ".".to_string();
    let mut markdown = false;
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
            "--markdown" => markdown = true,
            "-h" | "--help" => {
                println!("bean-lessons --dir <path> [--markdown]");
                exit(0);
            }
            other => die(3, &format!("unknown argument: {other}")),
        }
        i += 1;
    }

    let bean_dir = Path::new(&dir).join(".bean");
    let runs_dir = bean_dir.join("runs");

    // ---- read the trace corpus (fail closed on any malformed/foreign trace) ----
    let mut runs: Vec<Value> = vec![];
    if runs_dir.is_dir() {
        let mut paths: Vec<PathBuf> = std::fs::read_dir(&runs_dir)
            .unwrap_or_else(|e| die(3, &format!("cannot read {}: {e}", runs_dir.display())))
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
            .collect();
        paths.sort();
        for p in paths {
            let txt = std::fs::read_to_string(&p)
                .unwrap_or_else(|e| die(3, &format!("cannot read {}: {e}", p.display())));
            let v: Value = serde_json::from_str(&txt)
                .unwrap_or_else(|_| die(3, &format!("invalid trace JSON: {}", p.display())));
            if s(&v, "schema_version") != "trace/v0" {
                die(3, &format!("not a trace/v0 artifact: {}", p.display()));
            }
            if let Err(why) = validate_trace(&v) {
                die(3, &format!("invalid trace {}: {why}", p.display()));
            }
            runs.push(v);
        }
    }
    let source_run_count = runs.len();

    // ---- derive candidates (deterministic) ----
    let mut cands: Vec<Cand> = vec![];

    // 1. recurring_residual: distinct runs per normalized residual reason (threshold >= 2).
    //    signal = the original reason from the smallest run_id in the group.
    let mut residual_groups: BTreeMap<
        String,
        (BTreeMap<String, String>, BTreeMap<String, String>),
    > = BTreeMap::new(); // norm -> (run_id->status, run_id->original_reason)
    for r in &runs {
        let rid = s(r, "run_id");
        let st = s(r, "status");
        if let Some(arr) = r.get("residuals").and_then(|v| v.as_array()) {
            for res in arr {
                let reason = s(res, "reason");
                if reason.is_empty() {
                    continue;
                }
                let g = residual_groups.entry(norm(reason)).or_default();
                g.0.entry(rid.to_string()).or_insert_with(|| st.to_string());
                g.1.entry(rid.to_string())
                    .or_insert_with(|| reason.to_string());
            }
        }
    }
    for (_n, (ev, originals)) in residual_groups {
        if ev.len() >= 2 {
            // smallest run_id's original reason (BTreeMap iterates sorted by key)
            let signal = originals.values().next().cloned().unwrap_or_default();
            cands.push(Cand {
                kind: "recurring_residual",
                signal,
                evidence: ev,
            });
        }
    }

    // 2. high_pivot: runs with pivot_count >= 2.
    let mut high = Cand {
        kind: "high_pivot",
        signal: "pivot_count >= 2".into(),
        evidence: BTreeMap::new(),
    };
    for r in &runs {
        if r.get("pivot_count").and_then(|v| v.as_u64()).unwrap_or(0) >= 2 {
            high.add(s(r, "run_id"), s(r, "status"));
        }
    }
    if high.count() >= 1 {
        cands.push(high);
    }

    // 3. budget_exceeded: runs that hit the round ceiling.
    let mut budget = Cand {
        kind: "budget_exceeded",
        signal: "budget-exceeded".into(),
        evidence: BTreeMap::new(),
    };
    for r in &runs {
        if s(r, "status") == "budget-exceeded" {
            budget.add(s(r, "run_id"), s(r, "status"));
        }
    }
    if budget.count() >= 1 {
        cands.push(budget);
    }

    // 4. blocker_code_frequency: distinct runs per blocker code (no threshold; ranked by count).
    let mut by_code: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    for r in &runs {
        if let Some(arr) = r.get("blocker_codes").and_then(|v| v.as_array()) {
            for c in arr {
                if let Some(code) = c.as_str() {
                    by_code
                        .entry(code.to_string())
                        .or_default()
                        .entry(s(r, "run_id").to_string())
                        .or_insert_with(|| s(r, "status").to_string());
                }
            }
        }
    }
    for (code, ev) in by_code {
        cands.push(Cand {
            kind: "blocker_code_frequency",
            signal: code,
            evidence: ev,
        });
    }

    // 5. verifier_failure: distinct runs per verifier with a non-pass embedded verdict.
    let mut by_verifier: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    for r in &runs {
        if let Some(arr) = r.get("verifier_verdicts").and_then(|v| v.as_array()) {
            for vd in arr {
                let verdict = s(vd, "verdict");
                if verdict.is_empty() || verdict == "pass" {
                    continue;
                }
                let who = {
                    let v = s(vd, "verifier");
                    if v.is_empty() {
                        s(vd, "claim")
                    } else {
                        v
                    }
                };
                by_verifier
                    .entry(format!("{who} failed"))
                    .or_default()
                    .entry(s(r, "run_id").to_string())
                    .or_insert_with(|| s(r, "status").to_string());
            }
        }
    }
    for (signal, ev) in by_verifier {
        cands.push(Cand {
            kind: "verifier_failure",
            signal,
            evidence: ev,
        });
    }

    // ---- rank: count desc, kind asc, signal asc ----
    cands.sort_by(|a, b| {
        b.count()
            .cmp(&a.count())
            .then(a.kind.cmp(b.kind))
            .then(a.signal.cmp(&b.signal))
    });
    let candidates: Vec<Value> = cands
        .iter()
        .enumerate()
        .map(|(idx, c)| {
            let evidence: Vec<Value> = c
                .evidence
                .iter()
                .map(|(rid, st)| json!({ "run_id": rid, "status": st }))
                .collect();
            json!({
                "kind": c.kind,
                "rank": idx + 1,
                "count": c.count(),
                "signal": c.signal,
                "evidence": evidence,
            })
        })
        .collect();

    let generated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let report = json!({
        "schema_version": "bean.lessons.v0",
        "generated_at": generated_at,
        "source_run_count": source_run_count,
        "candidates": candidates,
    });

    // ---- write (read-only w.r.t. everything except the report files); fail closed ----
    if let Err(e) = std::fs::create_dir_all(&bean_dir).and_then(|_| {
        std::fs::write(
            bean_dir.join("lessons.json"),
            serde_json::to_string_pretty(&report).unwrap() + "\n",
        )
    }) {
        die(
            3,
            &format!("could not write lessons.json: {e} — failing closed"),
        );
    }
    if markdown {
        if let Err(e) = std::fs::write(bean_dir.join("lessons.md"), render_md(&report)) {
            die(
                3,
                &format!("could not write lessons.md: {e} — failing closed"),
            );
        }
    }

    eprintln!(
        "bean-lessons: {} candidate(s) from {} run(s) -> {}",
        candidates.len(),
        source_run_count,
        bean_dir.join("lessons.json").display()
    );
    // 0 = something to report; 2 = nothing (no runs or no candidates above threshold).
    exit(if candidates.is_empty() { 2 } else { 0 });
}

fn render_md(report: &Value) -> String {
    let mut out = String::from("# bean lessons (candidates)\n\n");
    out.push_str(&format!(
        "Source runs: {}\n\n",
        report
            .get("source_run_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    ));
    let cands = report.get("candidates").and_then(|v| v.as_array());
    match cands {
        Some(a) if !a.is_empty() => {
            out.push_str("| rank | kind | count | signal |\n|---|---|---|---|\n");
            for c in a {
                out.push_str(&format!(
                    "| {} | {} | {} | {} |\n",
                    c.get("rank").and_then(|v| v.as_u64()).unwrap_or(0),
                    s(c, "kind"),
                    c.get("count").and_then(|v| v.as_u64()).unwrap_or(0),
                    s(c, "signal").replace('|', "\\|"),
                ));
            }
        }
        _ => out.push_str("_No candidates above threshold._\n"),
    }
    out.push_str("\n_Candidates are observations for a human to triage — nothing is applied._\n");
    out
}
