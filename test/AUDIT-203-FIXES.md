# Grainulator 2.0.3 audit fixes

Tested on 2026-09-22. Final package identity: `release-2.0.3-48253acf1a8bf5ac`.
Base: `0db1da0` (2.0.3). Existing installed plugin/global settings were not changed.

## Finding-to-test map

| Finding | Change | Verification |
|---|---|---|
| S1: incomplete target retrieval | Exact `search.id`, complete `full` records, explicit lifecycle selection; skills use complete context | Public MCP lookup of overlapping IDs absent from content, >200-character caveat and timestamp, superseded lookup |
| S2: unsupported reciprocal edits | Challenge/feedback add one conflict edge and preserve original | Original record equality, compiler blocked, actual resolution, no duplicate mutation |
| S3: calibration/scorer disconnect | Validated `calibration` data in add API/CLI; scorer supports explicit estimate/risk/recommendation links | Public-tool correct/wrong/partial/unknown outcomes, deltas, rejected invalid target, cross-sprint isolation, unknown excluded from binary scores |
| S4: analytics instructions/output/freshness | Explicit nested sprint, absolute report destination, mkdir, separate velocity command, full-support witness freshness and canonical content | Clean unrelated cwd report; fresh witness, partial/contradictory support and cross-sprint freshness fixtures |
| S5: fetch routing/completeness | Existing DeepWiki route, accurate fallback/flag guidance, concise auto output and honest truncation after retry | Controlled HTTP degraded/failed/concise/full/body-truncated/error fixtures |
| S6: import lifecycle/provenance | Atomic active-findings import; skip inactive source records, deterministic IDs, retained provenance, conservative evidence, repeat no-op/changed-source rejection | MCP + CLI import, conflict mapping, repeat after local resolution, atomic rejection, hostile conflict IDs |
| S7: inaccurate status fields | Active/total counts, all six types, topics, tiers, complete active conflict pairs | Feedback/supersession/conflict fixtures; explicit compilation read for per-topic aggregates |
| S8: publication contract | Discover connector representation; destination authorization/ambiguity rules; single-attempt coordinator with confirmed result; visible blockers | Stub adapter: zero unauthorized writes, ADF payload/version, blocked warning, conflict/failed/ambiguous replies cannot report success; hostile CDATA roundtrip |
| Patch guard input | Recognize apply_patch add/update/delete/move paths | Blocking exit 2 for each protected path; ordinary patch allowed |
| Export catalogue | Exclude `_shared` helper | Unified formats tool plus all 25 actual exports |
| Memory lifecycle | Return status/resolved_by/resolution in memory search | Stored superseded record identified correctly through public search |
| CSV/Jira/YAML | Quote CR, guard formula prefixes including whitespace, serialize YAML strings/keys losslessly | Independent Python CSV/PyYAML parsing; raw-ledger export fidelity fixtures |
| Mobile HTML | Wrap long strings and constrain tables/cards | Headless Chrome, three formats × 390/1280px, no document overflow, injected scripts or page errors; keyboard entry |
| Markdown raw HTML | Escape source HTML without mutating ledger | Four Markdown-family converters with hostile metadata/content |
| Cross-cutting skills | Nested sprint discovery, no unrelated compiler work, evidence rubric, read-only orchestration wording, supported allowlist metadata and host prefixes | All 20 skills pass skill-creator validation; repository workflow contracts; instruction review |

## Checks run

- `npm test`: all nine package suite groups and dogfood integration pass on Node **24.14.0**. Suite groups include helper/unit tests; they are not counts of native integration scenarios.
- Final unpacked archive: **14 named audit regression scenarios plus one independent YAML parser subtest**, all pass (15 Node test records, zero skips).
- Original acceptance harness replay against the final archive: **9/9 scenario groups** pass, including 8 concurrent writers/160 acknowledged mutations, SIGKILL-before-rename recovery, stale locks, malformed/future schemas, injected disk/rename failure and workspace/symlink boundaries. Synthetic 5,000-claim compile/search sample: 261ms/3ms; not an SLA.
- Original independent export parser suite: **14/14 checks**, all 25 formats generated. CSV/Jira row counts and YAML content now preserve the original fixture semantics.
- `npm run lint`, `npm run build:site`, `npm run check:package`, `npm run test:install` pass. Lint retains pre-existing non-failing warnings/information.
- `npm run test:runtime`: **34/34** conformance/driver/gate/lessons checks.
- `scripts/audit-render-check.mjs`: **6/6** viewport/format cases pass in Chrome. This is targeted responsive/script/keyboard-entry coverage, not full WCAG certification.

## Repeatable checks

```sh
npm ci --ignore-scripts
npm test
npm run lint
npm run check:package
npm run test:install
npm run test:runtime
node --test test/dogfood/audit-regressions.test.mjs
node scripts/audit-render-check.mjs
```

Browser check uses Playwright Chromium by default; `GRAINULATOR_CHROME` selects an existing Chrome executable. Python 3 is used for independent CSV parsing; the YAML subtest explicitly skips if PyYAML is unavailable (it was installed and passed in this run). Original acceptance replay fixtures/reports are local audit artifacts, separate from the committed regression suite.

## Limits retained

- **Codex CLI 0.155.1 does not load portable AgentPlugin hooks.** This PR repairs the handler and documents explicit compile fallback; it does not claim native hook dispatch/protection was repaired. Recheck host discovery after a compatible host update. Shell writes remain outside the guard.
- **No live Atlassian acceptance.** Publication behavior uses a stub connector; a separately authorized live roundtrip is still required. Native execution of every skill, full custom brief/deck authoring, and PDF/WCAG certification are not established by these tests.
- Import is explicitly an active-document projection, not historical restoration. CSV/SQL are flattened formats; raw-ledger NDJSON retains full provenance. Markdown renderers still own URL/plugin sanitization policy.
- Earlier native session resume and nested-agent access evidence remains scoped to the original installed 2.0.3 build; this PR does not rebrand it as acceptance of the new package.
