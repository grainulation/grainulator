# Grainulator workflow audit — September 7, 2026

> Historical checkpoint, superseded for release scope. This September 7 audit predates the maintainer’s decision to remove the permission dashboard. Its paused/undecided instructions and test counts describe that earlier state; they are not current work requests. The dashboard is removed in v2.0.0. Use [README](../README.md), [structure](STRUCTURE.md), and [verification records](READINESS.md) for current guidance.

The workflow was used earlier but was not maintained consistently through the dashboard work. This is an implementation and decision-quality failure, not a missing dashboard feature to patch over.

## Evidence and correction

| Finding | Evidence | Correction |
| --- | --- | --- |
| The product problem changed without validation. | User clarification: Farmer managed permissions across agent sessions, unrelated to claims; the user stopped using it. | Record f001. Pause the rejected prototype. Retain/redesign/retire remains undecided. |
| Conversational feedback did not reach the ledger. | Before this audit the active sprint ended at r022, with no dashboard-purpose claim. | Record f001/f002 and risks r023/r024; compile the same sprint explicitly. |
| Documentation claimed nonexistent verification. | DASHBOARD.md described `npm run test:dashboard`; package.json had no such script. | Remove the claim. Separate component/handler tests, one desktop viewer smoke, and missing browser acceptance. |
| Historical green tests were too broad a readiness signal. | The previous full result preceded dashboard server/frontend edits. | Run the current full suite and record its timestamp and actual scope. |
| Pausing was reported as release exclusion. | Assistant recommended leaving the dashboard out, then reported it as planned scope. User did not decide this. | Correct README, dashboard docs, local guide, and public stub. Keep the release decision open. |

## Blind-spot methods

**Stakeholder matrix:** The operator's original job (cross-session approvals and questions) was displaced by the research user's ledger. Existing installers need preserved config/token/hook compatibility. Maintainers need traceable source imports and tests of changed boundaries. Dogfood users need an accepted task and observable success criteria, not just an attractive screen.

**Pre-mortem:** A consolidated release could ship a redundant dashboard, break an existing approval integration, route a decision to the wrong session, or claim model improvements without comparison evidence. Passing compiler checks would not detect these failures. The prototype's broad UI rewrite made browser regressions more likely; its desktop viewer smoke never exercised an administrator's decisions.

Topic coverage had no dashboard-purpose topic. Its user-value evidence remains stated and needs current dogfooding. Risk claims document the missing decision rather than asserting a rebuild is justified. A skeptic can reasonably ask why another session manager is necessary when its former user stopped using it; the present evidence does not answer that.

## Decision to investigate next

No dashboard feature expansion until its job and scope are established. Inventory the preserved permission/session integration against actual operator friction. Compare these options without treating any as approved:

| Option | What would justify it | Required acceptance evidence |
| --- | --- | --- |
| Retain a small optional permission/session integration | Existing users still need one approval inbox across supported sessions. | Two real supported host sessions, correct routing, questions, disconnect/timeout behavior, upgrade and rollback using copied configurations. |
| Rebuild a narrower session manager | Repeated dogfood friction requires a new interface. | A concrete operator task that the existing workflow handles poorly, then a usable prototype completing it with fewer interruptions. |
| Retire the capability from the new product | No demonstrated need within Grainulator's intended workflow. | An explicit product decision and a migration/support plan before repository archival or removal. |

The immediate code work is containment and verification of already-written changes, not another speculative dashboard. Original checkouts and state remain preserved. Existing claims about release packaging, deployment parity, model evaluation, host lifecycle, and upgrade recovery remain open in READINESS.md.

## Working discipline for subsequent changes

Before implementation, state the user task and observable acceptance criteria. Record material feedback and contrary evidence in the active sprint. After each meaningful change, run the relevant checks and record exactly what they established. Compile to find structural conflicts; do not treat compiler `ready` as product acceptance. Report completed, rejected, and undecided work separately. Recommendations remain recommendations until adopted.

## Current verification

The first full run failed one Codex pipeline assertion that still expected automatic approval without a dashboard. The retained behavior change denies requests requiring review when no client is connected; the test now checks that denial and preserved session/activity provenance. The initial failing result is retained in `.dogfood/workflow-audit-initial-results.json`.

The corrected full run completed at **2026-09-07T20:26:21.724Z**: all nine component suites, plugin tests, and **32 core regressions passed**. Dashboard component tests passed **80/80**. Five new core tests cover unknown/ambiguous session targeting, legacy unambiguous routing, scoped approval settings, and disconnected review denial. Results: `.dogfood/test-results.json`, `.dogfood/test-logs/`, and `.dogfood/workflow-audit-tests.log`.

`npm run test:site` exited successfully using the existing local previews and Playwright Chromium. It checked the homepage, playground, privacy, historical research URLs, scroll behavior, and organization site, including four responsive widths and existing keyboard checks. Provider responses in these checks are simulated. Log: `.dogfood/workflow-audit-browser.log`.

The rejected dashboard preview was stopped. Product/site navigation does not promote it; the retained CLI and docs identify its paused, undecided state. No complete dashboard browser/host acceptance or new Rust conformance run is claimed. The package-install failure and other release gates remain open.

## Superseded scope

This file records an earlier audit. The maintainer subsequently requested removal of the permission application from the consolidated workspace; that removal is authorized and tracked in the active sprint. Current scope and verification are in READINESS.md. Historical results above are not current product guidance.
