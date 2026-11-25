---
description: Generate an evidence-backed Markdown decision brief.
---

Follow the Grainulator brief skill for the explicit sprint. Compile current
evidence, resolve material conflicts, and export `compilation.json` with format
`markdown` to `output/brief.md`. Preserve claim IDs, sources, evidence tiers and
verification status when writing the decision, findings, risks and recommendations.

CLI fallback:

```sh
grainulator compile --dir <sprint>
grainulator export export --dir <sprint> --format markdown compilation.json -o output/brief.md
```

Verify the written file, link it, and report the current Auto and Manual next
steps. HTML reports, slide decks and PDF rendering belong to consumer tools.
