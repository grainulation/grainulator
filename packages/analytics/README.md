# Analytics module

This directory is an internal module of Grainulator. Install the root `@grainulation/grainulator` archive; component packages are private and are not separate installation targets. Node 25 is preferred and Node 24 is the minimum. See the [installation contract](../../docs/INSTALLATION.md).

Commands below run from the Grainulator root. An installed consumer can use the `grainulator` binary in place of `node bin/grainulator.js`.

This module summarizes evidence across sprints: type distributions, recurring topics, stale findings, prediction calibration, and available timing or cost records.

```sh
node bin/grainulator.js analytics --help
node bin/grainulator.js analytics analyze ./sprints
node bin/grainulator.js analytics calibrate ./sprints
node bin/grainulator.js analytics report ./sprints -o ./retrospective.html
```

Point it at a sprint directory or a directory containing sprints. Analysis reads `claims.json`, optional compilation output, and available Git history. Report commands write the requested artifact; the generated report is not a session or permission dashboard.

Calibration needs recorded predictions and outcomes. Missing history or outcomes cannot establish that decisions or models improved. Use the [evaluation results](../../docs/EVALUATION.md) for measured product evidence.

The Harvest package name and binary are retained compatibility aliases, not additional setup requirements. Use the root CLI and [dogfood guide](../../docs/DOGFOOD.md).
