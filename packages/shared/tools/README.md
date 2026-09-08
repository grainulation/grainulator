# barn/tools

Standalone utilities for structured research sprints. Each tool works independently and has zero npm dependencies.

## detect-sprints.js

Scans a repo for `claims.json` files and determines which sprint is active using git history heuristics. No configuration file needed -- it derives everything from the filesystem and git log.

**Heuristic ranking:**

1. Non-archived sprints beat archived ones
2. Most recent git commit touching `claims.json` wins ties
3. Falls back to `meta.initiated` date, then claim count

**Programmatic use:**

```js
import { detectSprints } from "@grainulation/barn/detect-sprints";
const { active, sprints } = detectSprints("/path/to/repo");
```

## generate-manifest.js

Builds a `wheat-manifest.json` that maps topics to claims and files. Designed to give AI search tools a single entry point into a sprint repo instead of requiring full directory scans.

The manifest includes:

- Topic map with claim IDs and evidence levels
- Sprint detection results (via detect-sprints)
- File-to-topic associations

## build-pdf.js

Thin wrapper around `npx md-to-pdf`. Validates the input file exists, runs the conversion, and reports the output path. Nothing more.
