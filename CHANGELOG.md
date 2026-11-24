# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-11-24

### Product scope and core types

- Retire built-in HTML reports, slide decks, static-site output, PDF generation and presentation templates. Briefs and analytics reports use Markdown; JSON and Markdown exports preserve evidence for external presentation tools. Existing user outputs are retained.
- Keep Homebrew installation through the shared tap; formula tooling and channel acceptance now belong to that repository. Product CI still verifies native archives and immutable release manifests.
- Convert all maintained first-party CLI, workspace, hook, research, release/migration, evaluation and test sources to strict TypeScript. Checked-in generated JavaScript preserves direct CLI and installed-package execution without a runtime compiler dependency. CI checks the full type graph, complete source/output inventory and generated-file freshness.
- Fix the compact MCP regression tests' filesystem races by reading bytes and metadata through one file descriptor, retaining content, timestamp and file-identity assertions.

### Premortem corrections

- Reject orphan generated JavaScript and malformed structured MCP results; enforce own-property schemas, structural JSON enums and compact conditional arguments before dispatch.
- Commit MCP roots capabilities only after the first accepted initialization, preserve explicit invalid stdio params, and honor only negotiated valid roots-change notifications.
- Preserve compiler conflict graphs, claim statuses and distinct evidence sources in Markdown; honor configured source paths and report full-document preview limits accurately.
- Refuse failed or colliding CI artifact/summary outputs and return structured MCP filesystem errors.
- Bind release identities to exact base/converter archive contents, exercise the archived converter before acceptance, and verify the peeled live tag before publication.
- Correct retired command references and document the actual supported manual Homebrew update procedure.
- Correct orchestration cycle rendering to use Set size, and keep decomposition previews free of an undefined filesystem-root reference.
- Preserve prototype-named manifest topics and analytics keys without inherited-property collisions or prototype pollution, and reject malformed manifest source metadata before string operations.

### Added

- Add `mcp --toolset compact` discovery with 15 consistently named tools for evidence, local memory and exports, selected explicitly by the Docker image. Authored claims and document imports remain separate; CLI and bundled plugin registrations retain the legacy 29-tool default, and containers can select it explicitly.
- Document nested input semantics, conditional modes, result shapes, side effects, sibling selection and valid call examples in both MCP profiles; verify real wire discovery and compact lifecycle calls against those contracts. These checks do not assert a new Glama score.
- Negotiated MCP protocol support with matching output schemas and structured results on `2025-06-18`, while preserving text-only responses for older supported clients.
- Installed-package checks for compact discovery, resource access, legacy-name refusal and protocol compatibility.

### Fixed

- Read complete hook stdin asynchronously before making write-guard decisions, avoiding a reproduced Node 24 delayed-pipe race that could leave managed-file writes unblocked.
- Describe initialization, local writes and replacement behavior with explicit tool hints, and align result contracts with successful and business-error responses.
- Preserve historical audit access and project finding metadata from the same selected claim snapshot; bound diagnostic output and report truncation.
- Reject malformed request IDs, metadata and tool arguments before negotiation or mutation, and align compact criteria constraints with dispatch validation.
- Correct the removed-alias documentation and document compact scope, format discovery and migration requirements. These interface changes do not establish a new external quality score.

## [3.0.1] - 2026-11-18

### Fixed

- Remove accidentally retained browser payload: research playground, privacy pages, favicons, local preview server, browser scripts/tests and Playwright dependency. The source package provides CLI/MCP workflows and generated reports without a bundled website.
- Move the portable research session and evidence engine into `lib/research`; preserve existing session JSON and continuation. Add headless session preparation with `research --question ... --prepare-only`.
- Remove unused component site CSS/icons/templates and the website-only `utils sync-assets` route. Keep report templates, offline exports, the static-site output format and the documentation mascot.
- Preserve manifest-verified application bytes through Homebrew cleanup and exercise the actual Cleaner in candidate acceptance. Published 3.0.0 tags/archives remain immutable.

## [3.0.0] - 2026-11-18

### Changed

- Consolidate evidence, memory, exports, analytics, orchestration and native verification under one Grainulator CLI/plugin and MCP surface. Component packages are private implementation workspaces; legacy command aliases and standalone MCP/plugin entrypoints are removed.
- Use `grainulator.config.json` and canonical `.grainulator` data locations. Normal commands do not silently discover or convert historical product data. Follow the upgrade guide before switching an existing workspace or required hook.
- Retire unused component dashboards, their servers and stale auxiliary artifacts. Retain the research playground, offline generated reports and reviewed report templates.

### Added

- Separately verified native runtime assets for macOS/Linux ARM64 and x86_64, explicit initialization and enrollment, and pinned user-cache hooks that survive package-manager cleanup. Enrollment currently covers one workspace and one host scope; unknown required roots block.
- A separately distributed offline converter with inventory, copy/verify/cutover/resume/rollback journals and preserved history. Remote identity reconciliation uses reviewed existing page IDs and confirmed receipts; it never creates replacement pages.
- Frozen base/native/converter release assembly, a pinned release manifest, literal Homebrew formula generation and installed Node24/26 plus actual Homebrew recipe checks.
- Evidence maintenance for source-bound premises, observations and execution receipts, with explicit correction and re-verification rather than automatic repair of conclusions.

### Fixed

- Bind migration metadata parsing and hashing to bounded descriptor snapshots; preserve matching immutable history and serialize cooperative writers. Retain conservative lock recovery for uncertain remote writes.
- Accept legitimate Cargo hardlinks only as copied native build inputs while keeping installed asset verification strict.
- Print preview help without starting a listener, reject ignored preview arguments, and create the formula wrapper directory explicitly.
- Clarify the existing post-mutation next-action setting and correct direct MCP setup/update instructions.

### Distribution and migration

- GitHub release archives; no npm publication. Native support, Homebrew support and full host-plugin discovery are separate verification scopes. Formula updates follow publication of the exact passing assets.
- Existing user data, host registrations, security wrappers and required gates are not automatically rewritten by installation or upgrade. See the upgrade, configuration, runtime and uninstall guides.

## [2.4.0] - 2026-11-17

### Added

- Grounded report packet and auditing: `grainulator report packet` generates a verifiable bundle containing claims, passages, certificates, and an audit trail of grounded sentences.
- DSSE in-toto statement attestation: `grainulator report attest` and `grainulator report verify-attestation` generate and verify cryptographically-signed DSSE envelopes enclosing in-toto Statement v1 predicates (`https://grainulation.org/attestations/grounded-report/v1`).
- Semantic evaluation and blind compare: `grainulator report verify-semantics` validates claim coverage and structured scope differences; `grainulator report compare` performs blind scoring against ungrounded draft baselines.
- Grounding Guard and strict validation: `grainulator report check --strict` flags ungrounded assertions, missing passages, or stale certificates with immediate non-zero exit codes.
- Canonical source alias normalization: automatic deduplication and normalization for DOI (`https://doi.org/...`), arXiv (`arxiv:...`), and standard web URLs in passages and evidence records.
- Reference grounded-report sprint example (`examples/grounded-report-sprint`) and comprehensive end-to-end dogfood test suite.

## [2.3.0] - 2026-11-15

### Added

- Structured scope differences on claims: `source.what_differs` (`--what-differs` in CLI `add`, `what_differs` in MCP `add_claim`), preserved through `wheat-compiler` into `compilation.json` so witnesses can record what differs between a cited source and the current scope.
- First-class verifier soundness break (`exit 3`): `grainulator run --verify <cmd>` treats exit code `3` as `status: "soundness_break"`, stops the retry loop immediately, and exits with code `3`.
- Adversarial rejected-claims evaluation corpus (`evals/rejected-claims/corpus.json` and `evals/rejected-claims/verifier.mjs`) testing three structural rejection cases: non-verbatim quotes, unresolved equal-tier contradictions, and empty source origins.
- Machine-readable limits ledger (`docs/limits.json`, `L1`–`L6`) synced with the summary table in `docs/BLIND-SPOTS.md` and verified in the test suite.
- Agent onboarding prompt block and 4-column Routes & Requirements table in `README.md`, plus explicit no-bypass verification and reporting rules in `AGENTS.md`.

## [2.2.0] - 2026-11-08

### Added

- Antigravity support: `agy plugin install https://github.com/grainulation/grainulator` installs the tools, research skills and research agent. `mcp_config.json` gives Antigravity the MCP server.
- Plugin servers use the project folder the agent shares through MCP roots. Codex and Antigravity start plugins outside the project; the server now asks the agent for its folder instead of relying on a launch argument.
- Agent setup guide rewritten with one tested install per agent (Claude Code, Codex, Antigravity, other MCP agents), a check step, update and remove commands and troubleshooting.

### Changed

- Plugin project folder order: `GRAINULATOR_WORKSPACE`, then the folder the agent shares, then the saved default from `grainulator setup`. When the agent shares a folder it now takes priority over the saved default. The plugin folder is never used as the project.
- Codex project setup and other MCP agents use `npx -y github:grainulation/grainulator#v2.2.0`, so no local clone is needed.

## [2.1.0] - 2026-10-25

### Added

- Quoted source passages for claims: `source.quote` with `source.passage` or `source.passage_sha256` (MCP `add_claim`, CLI `--quote`, `--passage-file`, `--passage-sha256`, plus `--witnessed-claim` and `--relationship`). Passages are stored content-addressed under `evidence/passages/`, and a quote must occur in its passage.
- Compiler passage audit (compiler 0.3.0): `passage_integrity`, `distinct_supporting_passages`, `conflict_support`, `basis` on each resolution, and `W_PASSAGE_INTEGRITY` warnings. Audit only: winners, statuses and blockers are unchanged.
- Freshness covers passages: the certificate's `passages_hash` makes the output guard and `status` treat a compilation as stale when a referenced passage changes.
- Conflicts where both sides quote a stored passage are routed to Manual in next actions; the witness, challenge and resolve skills record quotes, check for same-named entities and false source statements, and treat source text as untrusted.
- The evidence dashboard shows a claim's quote, passage digest and integrity result.

### Changed

- Homepage copy now says plainly what Grainulator does and does not do.
- CodeQL action 4.39.0 and Playwright 1.64.1 (supersedes Dependabot #36 and #37).

### Fixed

- `wheat-compiler --next` named conflicts as `undefined`; it now names both claims.
- Lint warning for an unused parameter in the tips hook.

### Verification scope

- Passage records are audit data. They show what a witness cited and that the stored passage is unchanged; they do not show that the passage proves the claim, and they do not change which claim wins a conflict. Letting checker-verified support decide conflicts is planned as a separate change.
- GitHub release only; no npm publication. Update the installed plugin and restart existing host sessions to load the new build.

## [2.0.4] - 2026-09-22

### Fixed

- Retrieve complete claim evidence by ID, persist prediction outcomes for scoring, and show accurate lifecycle, conflict and freshness information.
- Import active document findings without duplicate or resurrected claims; retain source provenance and label imported assertions conservatively.
- Preserve CSV/YAML content, escape raw HTML in Markdown exports, and fit HTML reports to mobile screens.
- Report fetch truncation accurately, correct skill workflows, handle patch-tool paths in the write guard, and preserve unresolved warnings in publication results.

### Verification scope

- Node 24 component/dogfood tests, package/install checks, runtime conformance, and targeted archive/browser regressions passed for the fixes. Release CI verifies Node 24 and 25, lint, runtime, site, dependencies and CodeQL before publication.
- Codex CLI 0.155.1 still does not dispatch portable-plugin hooks; explicitly compile after mutations. Live Atlassian acceptance remains untested.
- GitHub release only; no npm publication. Update the installed plugin and restart existing host sessions to load the new build.

## [2.0.3] - 2026-09-22

### Fixed

- Replace predictable temporary writes with exclusive, randomly named files and owned-file cleanup. Use descriptor-based regular-file reads, exclusive new-file creation, and resolved-root containment for static serving.
- Fail cache updates on lock timeout and stop taking tips-hook locks based only on age.
- Preserve hostile metadata as quoted YAML scalars, escape BibTeX in one pass, and convert HTML to Markdown without activating encoded HTML or executable link schemes.
- Decode HTML entities once, match parsed documentation hostnames, and replace expensive delimiter regular expressions with direct scanning.
- Wait for session import completion in the static browser regression check.

### Changed

- New files and atomic replacements use owner-only permissions. Session and clipboard reads reject final symbolic links and non-regular files; static serving permits internal links whose resolved targets remain within the serving root.
- A crashed tips-hook lock requires inspecting its owner and removing the abandoned lock before retrying. Filesystem parent directories and custom endpoints remain trusted configuration.
- Update development dependencies and pinned GitHub Actions. Add CodeQL, dependency auditing, automated dependency updates, and required CI verification before release publication.
- Simplify installation and agent setup guidance.

### Verification scope

- Full security-remediation branch scan: 83 baseline findings removed and seven source-reviewed false positives dismissed. No CodeQL rules or source directories were excluded.
- Component/dogfood regressions, runtime conformance, product browser checks, and isolated package installation passed for the security fixes. See [security review](docs/SECURITY-REVIEW.md) for behavior changes and limits.
- GitHub release only; no npm publication. The integrity manifest remains unsigned. Restart existing host sessions after updating the installed plugin.

## [2.0.2] - 2026-09-08

### Fixed

- Recognize the supported host security wrapper in both MCP configuration formats without changing or removing the wrapper. Verify that it references the expected configuration and server, and retain checks on the original launch command, arguments and environment.
- Protect native plugin configuration and integrity metadata from export overwrites, including paths through symbolic links and missing destination children.
- Enforce the workspace boundary when reading the implicit synchronization log through MCP tools.
- Return HTTP 400 for malformed preview request URLs instead of terminating the local server.
- Make workspace configuration cleanup remove only temporary files created by the current save operation.
- Redact known environment credential values from managed-runner results, stored traces and progress callbacks while preserving operational adapter/verifier inputs.

### Verification scope

- Added focused regressions for these defects and checked provider redirects, origin validation, request/response limits and cancellation. See the [security review](docs/SECURITY-REVIEW.md) for boundaries and remaining limits.
- GitHub release only; no npm publication. Previously published release tags are unchanged.

## [2.0.1] - 2026-09-08

### Fixed

- Make evidence command help read-only, including compile, initialization, and server commands.
- Export compiled sprint content instead of silently producing empty reports; reject incomplete input with actionable errors.
- Accept `--dir` consistently for export paths and report the actual unknown option.
- Add `--version` / `-v` and ship a verifiable file manifest in marketplace and tagged-source installations.
- Save the native Codex workspace once with `grainulator setup --dir /absolute/project`; explicit launch environment bindings still override the saved default.

### Documentation

- Add a 1.x upgrade guide covering marketplace refresh, scope pins, host restarts, retired MCP server names, memory-store selection, and reviewed cleanup of generated instructions.
- Clarify that hidden tool aliases do not restore removed server registrations or the former remote DeepWiki connection.

### Release scope

- GitHub release only; no npm registry publication. Existing source-verification, research-quality, and cumulative-cost limitations remain unchanged.

## [2.0.0] - 2026-09-07

### Changed

- Consolidate evidence, memory, exports, analytics, orchestration, and execution support into one Grainulator workspace and CLI.
- Expose one MCP server with 19 canonical tools and seven resources; retain hidden compatibility aliases for existing integrations.
- Require Node.js 24 or later, with Node 25 used for local development and both versions checked in CI.
- Replace the demo with a configurable research playground supporting session import, export, stop, resume, provider selection, and credential-safe handoff.
- Refresh the product site and installation guidance, and require grouped Auto/Manual next actions in core workflows.

### Fixed

- Preserve provenance and custom claim fields across mutation, search, compilation, and migration.
- Protect concurrent ledger and memory writes, export destinations, and workspace boundaries.
- Correct installed Node-version diagnostics, relative sprint paths, packaged documentation, and Claude subagent tool access.
- Add Codex native plugin loading with explicit `GRAINULATOR_WORKSPACE` binding and tested session continuation.
- Give local archives unique build identifiers and verify installed files against their manifests.

### Removed

- Remove the standalone dashboard, permission connectors, and notification hook. Native hosts manage permissions and remote access.

### Release scope

- Published as a GitHub release. Local archives can be installed from the tagged source; no npm registry publication is included in this release.
- Live-provider acceptance, independent citation verification, general research-quality gains, cumulative spending limits, and risk-closure semantics remain separately tracked limitations; structural validation is not source verification.

## [1.7.1] - 2026-04-19

### Changed

- Grainulator devDeps (`@playwright/test`, `serve`) moved out of this
  repo into the maintainer's private ranch harness. Grainulator is
  now truly zero-devDep, matching the published ecosystem's zero-dep
  philosophy. E2E tests still pass (27/27); they now run locally only
  via the ranch harness — see `CONTRIBUTING.md`.

### Internal

- Biome autofix pass on hooks and plugin JSON files.
- CI: removed the e2e job (moved to the ranch harness, local-only).
- Added `release.yml` — `v*` tag pushes now auto-create GitHub
  Release objects with CHANGELOG-extracted notes.

## [1.7.0] - 2026-04-19

### Added

- **Bearer auth on farmer hooks.** The sprint-status notifier hook now
  attaches a Bearer token when `.farmer-token` is present. Narrow-scope
  tokens ensure admin/viewer credentials can't be reused against hook
  endpoints — aligns grainulator's hook transport with farmer's
  opportunistic-auth hardening.
- **`/healthcheck` host-capability probe.** Checks Claude Code's
  current tool/MCP contract and flags drift before it causes silent
  skill failures. Run before a sprint to verify the environment is
  compatible.

### Fixed

- **Windows hook compatibility.** Inline JS in `hooks.json` silently
  failed on Windows cmd.exe (no fail-closed). Extracted to `.cjs`
  files invoked via `node ${CLAUDE_PLUGIN_ROOT}/hooks/<name>.cjs` so
  Windows runs the same code path as macOS/Linux.
- Port env override now respected by hook scripts.

### Changed

- Skills: extracted shared WCAG checklist so `brief` and `present`
  skills reference one source instead of duplicating.

### Internal

- `.env` added to `.gitignore`.

## [1.6.2] - 2026-04-18

### Added

- `SECURITY.md` — private-disclosure policy via GitHub Security
  Advisories or `security@grainulator.app`, 90-day window, explicit
  scope and credit clauses.
- `CODE_OF_CONDUCT.md` + `CONTRIBUTING.md` — standard OSS files aligned
  with the rest of the ecosystem.
- README "Troubleshooting" section covering MCP server reconnect
  (`claude mcp add wheat|mill|silo ...`) and pointing at the
  `/healthcheck` skill for diagnostics.
- `skills/_templates/wcag-shared.md` — shared WCAG checklist that
  brief + present skills now reference instead of inlining twice.
- `scripts/sync-version.js` — source-of-truth for the 3-way version
  sync (package.json → plugin.json → marketplace.json), wired into
  the `npm version` lifecycle hook so bumps stay in sync.

### Changed

- Bumped `package.json` version from 1.6.0 to 1.6.2 so it matches
  plugin.json and marketplace.json entries; prior drift meant users
  pointing at the git HEAD saw one version while the marketplace
  served another.

### Fixed

- Smart-fetch skill wrote `mcp__silo__smart-fetch` but the runtime
  tool name is `mcp__silo__silo_smart-fetch`. Tool was unreachable.

## [1.3.0] - 2026-04-03

### Added

- `/healthcheck` skill — pre-flight MCP server verification with parallel pings, failure class diagnosis, and fix commands
- Agent definition updated with healthcheck skill reference

## [1.1.0] - 2026-03-31

### Added

- `/setup` skill for post-install MCP server verification and onboarding.
- Privacy policy page (`site/privacy.html`) for marketplace submission.

### Changed

- MCP server source in marketplace.json switched from GitHub SSH to HTTPS git URL.
- Wheat MCP invocation changed from `wheat mcp` subcommand to dedicated `wheat-mcp` binary (fixes connection drops in Claude Code plugin transport).

### Fixed

- `plugin.json`: renamed `mcpConfig` to `mcpServers` (official schema).
- `plugin.json`: added `./` prefix to all paths (required by plugin spec).
- `plugin.json`: explicit agent file path instead of directory glob.
- `hooks.json`: converted to event-keyed object format with `{ hooks: {} }` wrapper for auto-discovery.
- Smoke tests updated to match new plugin schema.
- Biome schema bumped to 2.4.9, template string lint warnings resolved.
- Contact email updated to info@grainulator.app.

## [1.0.0] - 2026-03-21

### Changed

- Removed all pricing and cost references from the landing page and metadata.
- Added focus trap to terminal dialog overlay for keyboard accessibility.
- Final copy polish pass (typography, quotes, dashes).

### Fixed

- Terminal overlay now traps Tab focus and restores focus on close.

## [0.1.0] - 2026-03-21

### Added

- Plugin manifest (`.claude-plugin/plugin.json`) with skills, agents, hooks, and MCP config.
- 9 skills in subdirectory format (`skills/<name>/SKILL.md`):
  - `/init` -- start a new research sprint
  - `/research` -- multi-pass investigation with evidence gathering
  - `/challenge` -- adversarial testing of a specific claim
  - `/witness` -- corroborate a claim against an external source
  - `/brief` -- generate a compiled decision brief
  - `/status` -- sprint dashboard snapshot
  - `/present` -- generate a presentation deck
  - `/blind-spot` -- structural gap analysis
  - `/router` -- intent detection for plain-language messages
- Autonomous sprint agent (`agents/grainulator.md`) with Plan-Compile-Execute loop.
- MCP server configuration for wheat, mill, silo, and DeepWiki.
- Hooks: auto-compile on claim mutation, write-guard on `.wheat/` directory.
- Landing page at `site/index.html` for grainulator.app.
- Smoke tests (`test/smoke.test.js`) validating plugin structure.
- MIT license.
