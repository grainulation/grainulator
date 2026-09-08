// bean-check — bean's convergence compiler, Rust runtime (bean 2.0 north star).
//
// Reconverges with the Bran core (already Rust): a single static binary with no install
// dependency — the portability bean-check.js could not give, since Node is itself a dep.
// Ports the static checks, the temporal checks (state.json / dry-round / budget), AND the 2.0
// oracle gate (verification mode + verified_by + recorded verdicts, with bean-verify). Held to
// the JS reference by a differential conformance oracle (test/conformance.mjs) for static +
// temporal, plus assertion-based behavioral checks for the oracle gate.
//
//   bean-check --dir <path> [--json] [--no-state]
//
// Exit: 0 = ready, 1 = blocked, 2 = budget-exceeded, 3 = usage/load error,
//       4 = converged-with-residuals.

use serde_json::Value;
use sha2::{Digest, Sha256};
use std::process::exit;

const TIERS: [&str; 5] = ["stated", "web", "documented", "tested", "production"];
const TYPES: [&str; 6] = [
    "constraint",
    "factual",
    "estimate",
    "risk",
    "recommendation",
    "feedback",
];

fn tier_rank(t: &str) -> i32 {
    TIERS
        .iter()
        .position(|&x| x == t)
        .map(|i| i as i32)
        .unwrap_or(-1)
}
fn sha_hex(s: &str) -> String {
    sha_hex_bytes(s.as_bytes())
}
fn sha_hex_bytes(b: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(b);
    h.finalize().iter().map(|x| format!("{:02x}", x)).collect()
}
fn die(code: i32, msg: &str) -> ! {
    eprintln!("bean-check: {msg}");
    exit(code);
}

// ---- claim accessors (Value-based, mirroring the JS shape exactly) ----
fn s<'a>(c: &'a Value, k: &str) -> Option<&'a str> {
    c.get(k).and_then(|v| v.as_str())
}
fn id_of(c: &Value) -> &str {
    s(c, "id").unwrap_or("")
}
fn status_of(c: &Value) -> &str {
    s(c, "status").unwrap_or("")
}
fn is_active(c: &Value) -> bool {
    let st = status_of(c);
    st != "superseded" && st != "rejected" && st != "resolved"
}
fn has_tag(c: &Value, t: &str) -> bool {
    c.get("tags")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().any(|x| x.as_str() == Some(t)))
        .unwrap_or(false)
}
fn is_load_bearing(c: &Value) -> bool {
    has_tag(c, "load-bearing") || s(c, "type") == Some("recommendation")
}
fn is_abstention(c: &Value) -> bool {
    has_tag(c, "needs-input") || has_tag(c, "unknown")
}
fn content_hash(c: &Value) -> String {
    let ty = s(c, "type").unwrap_or("");
    let topic = s(c, "topic").unwrap_or("").to_lowercase();
    let content = s(c, "content").unwrap_or("").trim().to_lowercase();
    sha_hex(&format!("{ty}|{topic}|{content}"))
}
// matches bean-verify: ids that can't escape the verdicts dir
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}
// matches bean-verify's inputs_hash exactly (so a recompute equals what was recorded).
// Byte-based (not UTF-8) and RECURSIVE for directories, so a declared `inputs: ["src/"]`
// actually detects changes inside the directory instead of collapsing to "absent".
fn hash_path(p: &std::path::Path) -> String {
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
fn inputs_hash(base: &std::path::Path, inputs: &[Value]) -> String {
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

#[derive(Clone)]
struct Blocker {
    code: String,
    claim: String,
    extra: Vec<(String, Value)>,
}
fn b(code: &str, claim: &str) -> Blocker {
    Blocker {
        code: code.into(),
        claim: claim.into(),
        extra: vec![],
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut dir = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .to_string();
    let mut json_out = false;
    let mut state_enabled = true;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--dir" => {
                i += 1;
                if i >= args.len() || args[i].starts_with("--") {
                    die(3, "--dir requires a path");
                }
                dir = args[i].clone();
            }
            "--json" => json_out = true,
            "--no-state" => state_enabled = false,
            "--quiet" => {}
            "-h" | "--help" => {
                println!("bean-check --dir <path> [--json] [--no-state]");
                exit(0);
            }
            other => die(3, &format!("unknown argument: {other}")),
        }
        i += 1;
    }

    let bean_dir = std::path::Path::new(&dir).join(".bean");
    let claims_path = bean_dir.join("claims.json");
    let raw = std::fs::read_to_string(&claims_path)
        .unwrap_or_else(|_| die(3, &format!("no claims ledger at {}", claims_path.display())));
    let parsed: Value = serde_json::from_str(&raw)
        .unwrap_or_else(|e| die(3, &format!("cannot parse claims.json: {e}")));
    let claims: Vec<Value> = match &parsed {
        Value::Array(a) => a.clone(),
        Value::Object(o) => match o.get("claims") {
            Some(Value::Array(a)) => a.clone(),
            _ => die(3, "claims.json must be an array or { \"claims\": [...] }"),
        },
        _ => die(3, "claims.json must be an array or { \"claims\": [...] }"),
    };

    // run.json (evidence_bar + budget read by this slice; defaults match the JS DEFAULT_RUN)
    let mut bar_lb = "tested".to_string();
    let mut bar_rec = "documented".to_string();
    let mut max_rounds: Option<i64> = Some(6); // DEFAULT_RUN.budget.max_rounds
    let mut mode = "compat".to_string(); // 2.0 oracle gate: compat | advisory | strict
    let mut oracles = serde_json::Map::new();
    let mut sealed_expected = false;
    if let Ok(rt) = std::fs::read_to_string(bean_dir.join("run.json")) {
        // fail closed: an existing-but-invalid run.json must NOT silently fall back to compat
        // defaults (that would disable the strict gate). Treat it as a load error.
        let rj = serde_json::from_str::<Value>(&rt)
            .unwrap_or_else(|e| die(3, &format!("cannot parse run.json: {e}")));
        {
            if let Some(eb) = rj.get("evidence_bar") {
                if let Some(v) = eb.get("load_bearing").and_then(|v| v.as_str()) {
                    if TIERS.contains(&v) {
                        bar_lb = v.into();
                    }
                }
                if let Some(v) = eb.get("recommendation").and_then(|v| v.as_str()) {
                    if TIERS.contains(&v) {
                        bar_rec = v.into();
                    }
                }
            }
            // mergeRun: a run.json budget object replaces the default; max_rounds may be absent
            if let Some(budget) = rj.get("budget") {
                max_rounds = budget.get("max_rounds").and_then(|v| v.as_i64());
            }
            if let Some(m) = rj
                .get("verification")
                .and_then(|v| v.get("mode"))
                .and_then(|v| v.as_str())
            {
                if ["compat", "advisory", "strict"].contains(&m) {
                    mode = m.into();
                }
            }
            if let Some(o) = rj.get("oracles").and_then(|v| v.as_object()) {
                oracles = o.clone();
            }
            sealed_expected = rj.get("sealed_expected").is_some();
        }
    }
    // recorded verdicts: .bean/verdicts/<claim>.<verifier>.json, admitted only under their
    // canonical filename (no last-writer-wins / shadowing), sorted for determinism.
    let mut verdicts: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    if let Ok(rd) = std::fs::read_dir(bean_dir.join("verdicts")) {
        let mut files: Vec<_> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
        files.sort();
        for p in files {
            if p.extension().and_then(|x| x.to_str()) != Some("json") {
                continue;
            }
            if let Some(a) = std::fs::read_to_string(&p)
                .ok()
                .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            {
                let cl = a.get("claim").and_then(|v| v.as_str()).unwrap_or("");
                let vf = a.get("verifier").and_then(|v| v.as_str()).unwrap_or("");
                if safe_id(cl)
                    && safe_id(vf)
                    && p.file_name().and_then(|n| n.to_str()) == Some(&format!("{cl}.{vf}.json"))
                {
                    verdicts.insert(format!("{cl}::{vf}"), a);
                }
            }
        }
    }

    let mut blockers: Vec<Blocker> = vec![];

    // partition: well-formed, unique-id claims only (mirrors JS exactly)
    let mut valid: Vec<Value> = vec![];
    let mut seen_ids: Vec<String> = vec![];
    for c in &claims {
        let ok = c.is_object()
            && !id_of(c).is_empty()
            && s(c, "type").map(|t| TYPES.contains(&t)).unwrap_or(false)
            && s(c, "evidence")
                .map(|e| TIERS.contains(&e))
                .unwrap_or(false);
        if !ok {
            let cid = if c.is_object() && !id_of(c).is_empty() {
                id_of(c).to_string()
            } else {
                "(malformed)".to_string()
            };
            blockers.push(b("E_SCHEMA", &cid));
        } else if seen_ids.iter().any(|x| x == id_of(c)) {
            blockers.push(b("E_DUP_ID", id_of(c)));
        } else {
            seen_ids.push(id_of(c).to_string());
            valid.push(c.clone());
        }
    }
    let by_id = |id: &str| -> Option<&Value> { valid.iter().find(|c| id_of(c) == id) };
    let active: Vec<&Value> = valid.iter().filter(|c| is_active(c)).collect();

    let valid_resolver = |c: &Value| -> bool {
        match s(c, "resolved_by") {
            Some(rb) if rb != id_of(c) => by_id(rb).map(is_active).unwrap_or(false),
            _ => false,
        }
    };
    let has_reason = |c: &Value| -> bool { !s(c, "content").unwrap_or("").trim().is_empty() };
    let discharged = |c: &Value| -> bool {
        valid_resolver(c)
            || has_tag(c, "confirmed-non-issue")
            || has_tag(c, "accepted")
            || (has_tag(c, "residual") && has_reason(c))
    };

    // 1. conflicts — symmetric pairing, fail-closed, dominance hint
    let mut pairs: Vec<(String, String)> = vec![];
    for c in &active {
        if let Some(cw) = c.get("conflicts_with").and_then(|v| v.as_array()) {
            for other in cw {
                let other = match other.as_str() {
                    Some(o) => o,
                    None => continue,
                };
                let o = match by_id(other) {
                    Some(o) if is_active(o) && id_of(o) != id_of(c) => o,
                    _ => continue,
                };
                if valid_resolver(c) || valid_resolver(o) {
                    continue;
                }
                let (a, bb) = if id_of(c) < id_of(o) {
                    (id_of(c), id_of(o))
                } else {
                    (id_of(o), id_of(c))
                };
                let key = (a.to_string(), bb.to_string());
                if !pairs.contains(&key) {
                    pairs.push(key);
                }
            }
        }
    }
    for (aid, bid) in &pairs {
        let ca = by_id(aid).unwrap();
        let cb = by_id(bid).unwrap();
        let mut blk = b("E_CONFLICT", aid);
        blk.extra.push(("with".into(), Value::String(bid.clone())));
        if let Some(topic) = s(ca, "topic") {
            blk.extra
                .push(("topic".into(), Value::String(topic.into())));
        }
        // dominance: strictly higher tier wins, neither an abstention
        let dom = if is_abstention(ca) || is_abstention(cb) {
            None
        } else {
            let ra = tier_rank(s(ca, "evidence").unwrap_or(""));
            let rb = tier_rank(s(cb, "evidence").unwrap_or(""));
            if ra == rb {
                None
            } else if ra > rb {
                Some((
                    id_of(ca),
                    id_of(cb),
                    s(ca, "evidence").unwrap_or(""),
                    s(cb, "evidence").unwrap_or(""),
                ))
            } else {
                Some((
                    id_of(cb),
                    id_of(ca),
                    s(cb, "evidence").unwrap_or(""),
                    s(ca, "evidence").unwrap_or(""),
                ))
            }
        };
        match dom {
            Some((win, lose, we, le)) => {
                blk.extra.push(("resolvable".into(), Value::Bool(true)));
                blk.extra
                    .push(("supersede".into(), Value::String(lose.into())));
                blk.extra.push(("keep".into(), Value::String(win.into())));
                blk.extra
                    .push(("reason".into(), Value::String(format!("{we} > {le}"))));
            }
            None => blk.extra.push(("resolvable".into(), Value::Bool(false))),
        }
        blockers.push(blk);
    }

    // 1b. dependency integrity (truth-maintenance)
    for c in &active {
        match c.get("depends_on") {
            Some(Value::Array(deps)) => {
                for dep in deps {
                    let dep = dep.as_str().unwrap_or("");
                    let stale =
                        dep == id_of(c) || by_id(dep).map(|d| !is_active(d)).unwrap_or(true);
                    if stale {
                        let mut blk = b("E_STALE_DEPENDENT", id_of(c));
                        blk.extra
                            .push(("depends_on".into(), Value::String(dep.into())));
                        blockers.push(blk);
                    }
                }
            }
            Some(_) => blockers.push(b("E_SCHEMA", id_of(c))), // present-but-malformed must not fail open
            None => {}
        }
    }

    // 2. undischarged risk
    for c in &active {
        if s(c, "type") == Some("risk") && !discharged(c) {
            let mut blk = b("E_OPEN_RISK", id_of(c));
            if let Some(t) = s(c, "topic") {
                blk.extra.push(("topic".into(), Value::String(t.into())));
            }
            blockers.push(blk);
        }
    }

    // 3. load-bearing below the evidence bar
    for c in &active {
        if is_load_bearing(c) && !is_abstention(c) {
            let bar = if s(c, "type") == Some("recommendation") {
                &bar_rec
            } else {
                &bar_lb
            };
            if tier_rank(s(c, "evidence").unwrap_or("")) < tier_rank(bar) {
                let mut blk = b("E_WEAK_LOADBEARING", id_of(c));
                blk.extra.push((
                    "have".into(),
                    Value::String(s(c, "evidence").unwrap_or("").into()),
                ));
                blk.extra.push(("need".into(), Value::String(bar.clone())));
                blockers.push(blk);
            }
        }
    }

    // 4. load-bearing abstention is an open front
    for c in &active {
        if is_abstention(c) && is_load_bearing(c) {
            let mut blk = b("E_OPEN_UNKNOWN", id_of(c));
            if let Some(t) = s(c, "topic") {
                blk.extra.push(("topic".into(), Value::String(t.into())));
            }
            blockers.push(blk);
        }
    }

    // ---- temporal checks (need round history; skipped under --no-state) ----
    let mut notes: Vec<String> = vec![];
    let mut warnings: Vec<Blocker> = vec![];
    if active.is_empty() {
        notes.push("EMPTY_LEDGER: no active claims to converge".into());
    }

    // ---- 5. THE ORACLE GATE (2.0). compat=off; advisory=warn; strict=block. Gate on
    // load-bearing STATUS (not tier). bean-check reads recorded verdicts; never runs an oracle.
    let mut residual_load_bearing: Vec<String> = vec![];
    let mut verified_info: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    if mode != "compat" {
        let base = std::path::Path::new(&dir);
        let mut used_verifiers: Vec<String> = vec![];
        for c in &active {
            if !is_load_bearing(c) || is_abstention(c) {
                continue;
            }
            let bar = if s(c, "type") == Some("recommendation") {
                &bar_rec
            } else {
                &bar_lb
            };
            if tier_rank(s(c, "evidence").unwrap_or("")) < tier_rank(bar) {
                continue; // already E_WEAK_LOADBEARING
            }
            let is_residual = has_tag(c, "residual") && has_reason(c);
            let mut fail: Option<Blocker> = None;
            let mut passed = false;
            let mut pass_verifier = String::new();
            let vb = c
                .get("verified_by")
                .and_then(|v| v.get("verifier"))
                .and_then(|v| v.as_str());
            if let Some(vname) = vb {
                let spec = oracles.get(vname).filter(|v| {
                    v.is_object()
                        && v.get("cmd")
                            .and_then(|x| x.as_array())
                            .map(|a| !a.is_empty())
                            .unwrap_or(false)
                });
                let art = verdicts.get(&format!("{}::{}", id_of(c), vname));
                match (spec, art) {
                    (None, _) => {
                        let mut blk = b("E_ORACLE_UNDECLARED", id_of(c));
                        blk.extra
                            .push(("verifier".into(), Value::String(vname.into())));
                        fail = Some(blk);
                    }
                    (Some(_), None) => {
                        let mut blk = b("E_VERIFY_ERROR", id_of(c));
                        blk.extra
                            .push(("verifier".into(), Value::String(vname.into())));
                        fail = Some(blk);
                    }
                    (Some(sp), Some(a)) => {
                        let cmd = sp.get("cmd").unwrap();
                        let want_digest = sha_hex(&serde_json::to_string(cmd).unwrap());
                        let inputs = sp
                            .get("inputs")
                            .and_then(|v| v.as_array())
                            .cloned()
                            .unwrap_or_default();
                        let want_inputs = inputs_hash(base, &inputs);
                        let stale = a.get("claim_binding").and_then(|v| v.as_str())
                            != Some(content_hash(c).as_str())
                            || a.get("oracle_digest").and_then(|v| v.as_str())
                                != Some(want_digest.as_str())
                            || a.get("inputs_hash").and_then(|v| v.as_str())
                                != Some(want_inputs.as_str());
                        let verdict = a.get("verdict").and_then(|v| v.as_str()).unwrap_or("");
                        let mk = |code: &str| {
                            let mut blk = b(code, id_of(c));
                            blk.extra
                                .push(("verifier".into(), Value::String(vname.into())));
                            Some(blk)
                        };
                        if stale {
                            fail = mk("E_ORACLE_STALE");
                        } else if verdict == "fail" {
                            fail = mk("E_ORACLE_FAILED");
                        } else if verdict != "pass" {
                            fail = mk("E_VERIFY_ERROR");
                        } else {
                            passed = true;
                            pass_verifier = vname.into();
                        }
                    }
                }
            }
            if passed {
                used_verifiers.push(pass_verifier.clone());
                let a = verdicts
                    .get(&format!("{}::{}", id_of(c), pass_verifier))
                    .unwrap();
                verified_info.insert(
                    id_of(c).into(),
                    vec![
                        pass_verifier,
                        a.get("verdict")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .into(),
                        a.get("oracle_digest")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .into(),
                        a.get("inputs_hash")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .into(),
                        a.get("claim_binding")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .into(),
                    ],
                );
            } else if let Some(blk) = fail {
                // a DECLARED verifier that didn't pass (undeclared / no verdict / stale / failed /
                // error) BLOCKS and cannot be laundered by a `residual` tag — you asserted it
                // would be verified. Residual fallback is only for claims with no verifier at all.
                if mode == "strict" {
                    blockers.push(blk);
                } else {
                    let mut w = blk.clone();
                    w.code = blk.code.replacen("E_", "W_", 1);
                    warnings.push(w);
                }
            } else if is_residual {
                // no verifier, but a named residual with a reason — converges-with-residuals
                residual_load_bearing.push(id_of(c).into());
            } else {
                // no verifier and no residual
                let mut blk = b("E_UNVERIFIED_LOADBEARING", id_of(c));
                if let Some(t) = s(c, "topic") {
                    blk.extra.push(("topic".into(), Value::String(t.into())));
                }
                if mode == "strict" {
                    blockers.push(blk);
                } else {
                    blk.code = "W_UNVERIFIED_LOADBEARING".into();
                    warnings.push(blk);
                }
            }
        }
        let distinct: std::collections::HashSet<&String> = used_verifiers.iter().collect();
        if used_verifiers.len() >= 2 && distinct.len() == 1 {
            let mut w = b("W_ORACLE_SINGLE", "");
            w.extra
                .push(("verifier".into(), Value::String(used_verifiers[0].clone())));
            warnings.push(w);
        }
        if sealed_expected {
            warnings.push(b("W_SEALED_UNENFORCED", ""));
        }
    }

    // coverage warnings (echo-chamber / type monoculture) — parity with the JS reference.
    // Ordered by first appearance of each topic among active claims, SINGLE_SOURCE then MONOCULTURE.
    {
        let mut order: Vec<String> = vec![];
        let mut map: std::collections::HashMap<
            String,
            (
                std::collections::HashSet<String>,
                std::collections::HashSet<String>,
                usize,
            ),
        > = std::collections::HashMap::new();
        for c in &active {
            let topic = s(c, "topic").unwrap_or("").to_string();
            let e = map.entry(topic.clone()).or_insert_with(|| {
                order.push(topic.clone());
                (
                    std::collections::HashSet::new(),
                    std::collections::HashSet::new(),
                    0,
                )
            });
            e.0.insert(
                c.get("source")
                    .and_then(|v| v.get("origin"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
            );
            e.1.insert(s(c, "type").unwrap_or("").to_string());
            e.2 += 1;
        }
        for topic in &order {
            let (sources, types, n) = &map[topic];
            if *n >= 3 && sources.len() == 1 {
                let mut w = b("W_SINGLE_SOURCE", "");
                w.extra.push(("topic".into(), Value::String(topic.clone())));
                warnings.push(w);
            }
            if *n >= 2 && types.len() < 2 {
                let mut w = b("W_MONOCULTURE", "");
                w.extra.push(("topic".into(), Value::String(topic.clone())));
                warnings.push(w);
            }
        }
    }

    // prior state
    let mut prior: Option<Value> = None;
    if state_enabled {
        if let Ok(t) = std::fs::read_to_string(bean_dir.join("state.json")) {
            // fail closed: a corrupt state.json must not silently reset temporal tracking
            prior = Some(
                serde_json::from_str::<Value>(&t)
                    .unwrap_or_else(|e| die(3, &format!("cannot parse state.json: {e}"))),
            );
        }
    }
    let prior_seen: Vec<String> = prior
        .as_ref()
        .and_then(|p| p.get("seen_ids"))
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let prior_superseded: Vec<String> = prior
        .as_ref()
        .and_then(|p| p.get("superseded_hashes"))
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let prior_round = prior
        .as_ref()
        .and_then(|p| p.get("round"))
        .and_then(|v| v.as_i64());
    let prior_hash = prior
        .as_ref()
        .and_then(|p| p.get("claims_hash"))
        .and_then(|v| v.as_str())
        .map(String::from);

    // W_REAPPEAR — a superseded/rejected claim resurrected as active
    for c in &active {
        if prior_superseded.contains(&content_hash(c)) {
            warnings.push(b("W_REAPPEAR", id_of(c)));
        }
    }

    let mut active_ids: Vec<String> = active.iter().map(|c| id_of(c).to_string()).collect();
    active_ids.sort();
    let new_this_round = active_ids
        .iter()
        .filter(|id| !prior_seen.contains(id))
        .count();

    // claims_hash: per-claim "id\0contentHash\0evidence" lines, sorted, concatenated. The
    // reference uses NUL delimiters (they render as spaces in a terminal — match the bytes).
    let mut hash_lines: Vec<String> = active
        .iter()
        .map(|c| {
            format!(
                "{}\u{0}{}\u{0}{}",
                id_of(c),
                content_hash(c),
                s(c, "evidence").unwrap_or("")
            )
        })
        .collect();
    hash_lines.sort();
    // JS joins the per-claim lines with \x01 (SOH); fields within a line use \x00 (NUL). Both
    // delimiters must match the reference or multi-claim claims_hash drifts (single-claim hides it).
    let claims_hash = sha_hex(&hash_lines.join("\u{1}"));

    let dry = prior.is_some() && prior_hash.as_deref() == Some(claims_hash.as_str());
    let round = match prior_round {
        Some(r) => r + if dry { 0 } else { 1 },
        None => 1,
    };
    let open_fronts = !blockers.is_empty();
    if dry && open_fronts {
        notes.push("DRY_ROUND_STUCK: a full round added nothing yet open fronts remain".into());
    }
    if dry && !open_fronts {
        notes.push("DRY_ROUND_CONVERGED".into());
    }
    let over_budget = max_rounds.map(|m| round > m).unwrap_or(false);
    if over_budget {
        notes.push(format!(
            "OVER_BUDGET: round {round} > max {} — deliver with open fronts named",
            max_rounds.unwrap()
        ));
    }

    // status precedence: budget-exceeded > blocked > converged-with-residuals (strict, no
    // blockers but load-bearing claims rest on residuals) > ready.
    let status = if over_budget {
        "budget-exceeded"
    } else if !blockers.is_empty() {
        "blocked"
    } else if mode == "strict" && !residual_load_bearing.is_empty() {
        "converged-with-residuals"
    } else {
        "ready"
    };

    // certificate: sha256(JSON({status, admitted})). When NO 2.0 feature is in play the cert is
    // byte-identical to the JS reference (v20=false). When the oracle gate is active the cert
    // binds the full regime (mode, load-bearing set, residual set, oracle registry, verdicts).
    let v20 = mode != "compat"
        || active.iter().any(|c| c.get("verified_by").is_some())
        || !oracles.is_empty();
    let mut admitted: Vec<Vec<String>> = active
        .iter()
        .map(|c| {
            let mut t = vec![
                id_of(c).to_string(),
                s(c, "evidence").unwrap_or("").to_string(),
                content_hash(c),
            ];
            if v20 {
                if let Some(info) = verified_info.get(id_of(c)) {
                    t.extend(info.clone());
                }
            }
            t
        })
        .collect();
    admitted.sort_by(|x, y| x[0].cmp(&y[0]));
    let certificate = if v20 {
        let mut lb: Vec<String> = active
            .iter()
            .filter(|c| is_load_bearing(c))
            .map(|c| id_of(c).to_string())
            .collect();
        lb.sort();
        let mut res = residual_load_bearing.clone();
        res.sort();
        // bind a canonical hash of each oracle SPEC (cmd + declared inputs + any pinned digest),
        // not just the optional oracle_digest — so changing a registry command/inputs changes the
        // certificate even in advisory/residual cases where no verdict was admitted.
        let mut orc: Vec<String> = oracles
            .iter()
            .map(|(k, v)| {
                let cmd = serde_json::to_string(v.get("cmd").unwrap_or(&Value::Null)).unwrap();
                let inps = serde_json::to_string(v.get("inputs").unwrap_or(&Value::Null)).unwrap();
                let pin = v
                    .get("oracle_digest")
                    .and_then(|x| x.as_str())
                    .unwrap_or("");
                format!("{k}:{}", sha_hex(&format!("{cmd}\u{0}{inps}\u{0}{pin}")))
            })
            .collect();
        orc.sort();
        let regime =
            serde_json::json!({ "mode": mode, "loadBearing": lb, "residual": res, "oracles": orc });
        let obj = serde_json::json!({ "status": status, "admitted": admitted, "v": regime });
        sha_hex(&serde_json::to_string(&obj).unwrap())[..16].to_string()
    } else {
        // hand-built to match JS JSON.stringify byte-for-byte (status-first key order, compact)
        let cert_str = format!(
            "{{\"status\":{},\"admitted\":{}}}",
            serde_json::to_string(status).unwrap(),
            serde_json::to_string(&admitted).unwrap(),
        );
        sha_hex(&cert_str)[..16].to_string()
    };

    // write next state (unless --no-state)
    if state_enabled {
        let mut seen: Vec<String> = prior_seen.clone();
        for id in &active_ids {
            if !seen.contains(id) {
                seen.push(id.clone());
            }
        }
        seen.sort();
        let mut superseded: Vec<String> = prior_superseded.clone();
        for c in &valid {
            let st = status_of(c);
            if st == "superseded" || st == "rejected" {
                let h = content_hash(c);
                if !superseded.contains(&h) {
                    superseded.push(h);
                }
            }
        }
        let next = serde_json::json!({
            "round": round,
            "seen_ids": seen,
            "superseded_hashes": superseded,
            "claims_hash": claims_hash,
        });
        std::fs::write(
            bean_dir.join("state.json"),
            serde_json::to_string_pretty(&next).unwrap() + "\n",
        )
        .unwrap_or_else(|e| die(3, &format!("cannot write state.json: {e}")));
    }

    if json_out {
        let to_json = |x: &Blocker| -> Value {
            let mut m = serde_json::Map::new();
            m.insert("code".into(), Value::String(x.code.clone()));
            m.insert("claim".into(), Value::String(x.claim.clone()));
            for (k, v) in &x.extra {
                m.insert(k.clone(), v.clone());
            }
            Value::Object(m)
        };
        let out = serde_json::json!({
            "status": status,
            "blockers": blockers.iter().map(to_json).collect::<Vec<_>>(),
            "warnings": warnings.iter().map(to_json).collect::<Vec<_>>(),
            "notes": notes,
            "round": round,
            "max_rounds": max_rounds,
            "new_this_round": new_this_round,
            "dry": dry,
            "certificate": certificate,
        });
        println!("{}", serde_json::to_string_pretty(&out).unwrap());
    } else {
        println!(
            "bean-check: {} (cert {})",
            status.to_uppercase(),
            certificate
        );
    }

    exit(match status {
        "ready" => 0,
        "converged-with-residuals" => 4,
        "budget-exceeded" => 2,
        _ => 1,
    });
}
