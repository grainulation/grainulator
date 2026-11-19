# Maintainer review — September 7, 2026

This review used a pre-mortem across data integrity, first-time use, workflow state, and product evidence. It found additional defects after the earlier local acceptance checkpoint. Nothing was pushed or published.

## Found and fixed

| Finding | Evidence after correction |
| --- | --- |
| Concurrent memory writers saved collection files but lost index entries. Four processes produced 320 files and only 123 indexed collections. | The same concurrency shape now retains 320/320. Concurrent remove/insert also preserves count and integrity. |
| CLI and MCP could use different memory stores; search dropped source provenance. | Shared configuration precedence, legacy-store fallback without migration, and CLI/MCP roundtrip/provenance regressions pass. |
| The presentation exporter did not follow its own accessibility contract. | Native scrolling, focusable slides, skip link, live announcements, canonical compilation metadata, long-content pagination, and mobile/desktop checks pass. |
| First-time installation assumed an existing local install, and entry docs described Node 20 or the old organization CLI. | A local installation guide is linked from the playground; Node requirements agree; the organization README describes the new site and explicitly retained legacy source. Six static artifact checks pass across four widths. |

Memory validation: 138 component tests on Node 25, plus 15 targeted memory/unified integration tests on both Node 24 and 25. See `.dogfood/memory-blindspot-{basic,full,regressions,node24}.log`. Exporter validation includes two new regressions and real Chromium checks at 390px and 1440px with long content. These are additional checks after the earlier Node matrix; do not relabel that earlier artifact as testing later edits.

## Current limits and resolutions

The machine-readable ledger lives in [`docs/limits.json`](limits.json) and is checked against the table below in `npm test`:

| ID | Area | Limit / Boundary | Status | Mitigation / Reality |
| --- | --- | --- | --- | --- |
| `L1` | Claim lifecycle | Older active risks and time-specific facts remain beside newer evidence; resolve requires an actual conflict relationship | Deliberately bounded | Reviewed presentations select and cite the latest findings; full-ledger exports retain history |
| `L2` | Real usage acceptance | Paid-provider CLI research needs locally configured credentials; native host fixture tests do not replace real host tasks | Deliberately bounded | Install the local build in the target host and exercise it on a real task before claiming host readiness |
| `L3` | Execution boundary | Model-backed research runs only through explicit local CLI or host operations; no browser app or hosted execution service is bundled | Deliberately bounded | Use headless preparation without provider access, then authorize the intended local provider or host run |
| `L4` | Product source separation | Website code and unused site assets are excluded; the product retains CLI/MCP, generated reports and documentation branding | Resolved | Package absence gates reject public directories and retired web launchers while exercising installed CLI/MCP/report workflows |
| `L5` | Outcome evidence | Semantic-v2 found no general answer-quality or efficiency improvement; verification catches specified failures, not source truth | Deliberately bounded | Use explicit verifiers and adversarial rejected-claims checks; never claim universal accuracy or cost gains |
| `L6` | Release boundary | Local verification does not perform remote CI, deployment, publication, or repository archival without authorization | Deliberately bounded | Require green CI and explicit maintainer release authorization before tagging or publishing |

- **Claim lifecycle:** older active risks and time-specific facts remain beside newer evidence. For example, r002 still prompts migration investigation after r053 records the matrix, and r018 combines local routing with unperformed public deployment. The current `resolve` operation requires an actual conflict relationship; it is not a generic risk-closure command. Do not invent contradiction edges or exclude a whole topic to silence useful residual risks. A first-class closure/supersession workflow remained a product gap at this dated checkpoint. The reviewed presentation selects and cites the latest findings; the generic full-ledger export retains history.
- **Real usage acceptance:** CLI/provider and host scopes require their own actual evidence; mock checks do not establish a live provider or loaded host.
- **Execution boundary:** headless preparation makes no provider call. Explicit research execution remains local; no browser or hosted execution service is bundled.
- **Product source separation:** bundled web surfaces and unused site assets are removed in 3.0.1. Generated user reports and documentation branding remain purposeful.
- **Outcome evidence:** structural verification does not establish source truth or universal model-quality improvement.
- **Release boundary:** remote CI, publication and host installation are distinct operations requiring their applicable authorization and evidence.
