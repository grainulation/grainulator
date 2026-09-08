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

## Still open or deliberately bounded

- **Claim lifecycle:** older active risks and time-specific facts remain beside newer evidence. For example, r002 still prompts migration investigation after r053 records the matrix, and r018 combines local routing with unperformed public deployment. The current `resolve` operation requires an actual conflict relationship; it is not a generic risk-closure command. Do not invent contradiction edges or exclude a whole topic to silence useful residual risks. A first-class closure/supersession workflow remains a product gap. The reviewed presentation selects and cites the latest findings; the generic full-ledger export retains history.
- **Real usage acceptance:** a paid-provider playground run needs a locally configured API key. Native host fixture tests do not replace installing the local build in the maintainer's normal host and using it on a real task.
- **Public execution:** the static playground configures, imports, and exports; model execution happens locally. A hosted model-execution service is not delivered by the Pages artifact.
- **Organization source cleanup:** the new organization website and corrected README are ready locally. Existing `bin/`, `lib/`, `public/`, tests, and legacy CLI package metadata remain in `grainulation-dogfood`; it is not yet a website-only source checkout.
- **Outcome evidence:** semantic-v2 found no general answer-quality or efficiency improvement. Verification catches specified failures; evidence structure does not establish source truth. Broader customer-task evaluations are still needed for stronger product claims.
- **Release boundary:** remote CI, deployment, publication, and repository archival were not performed under the local-only instruction. Original repositories and stars remain untouched.

Current review claims: r055–r058 in `../sprints/grainulator-dogfood/` relative to the product checkout. The presentation and its checks are in that sprint's `output/` directory.
