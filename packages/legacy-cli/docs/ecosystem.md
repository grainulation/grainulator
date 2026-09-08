# Grainulation Ecosystem Reference

The grainulation CLI is the unified entry point for all seven tools in the ecosystem. Each tool has its own npm package and can be used standalone, but the `grainulation` package connects them into an integrated workflow.

## The Eight Tools

| Tool             | Package                      | Role                                                                 |
| ---------------- | ---------------------------- | -------------------------------------------------------------------- |
| **wheat**        | `@grainulation/wheat`        | Research sprint engine. Slash commands, claims, compiler.            |
| **barn**         | `@grainulation/barn`         | Template library. Sprint templates and boilerplate.                  |
| **harvest**      | `@grainulation/harvest`      | Metrics and analytics. Sprint health and prediction scoring.         |
| **mill**         | `@grainulation/mill`         | Export engine. Converts compilation output to PDF, CSV, HTML, etc.   |
| **silo**         | `@grainulation/silo`         | Knowledge packs. Portable claim bundles for reuse.                   |
| **orchard**      | `@grainulation/orchard`      | Multi-sprint orchestration. Dependencies, teams, parallel execution. |
| **grainulation** | `@grainulation/grainulation` | Unified CLI. Installs and coordinates all tools.                     |

## Data Flow

Tools communicate through files on disk. There is no background daemon or shared database. The data flow follows this path:

```
wheat (claims.json)
  |
  v
wheat compile (compilation.json)
  |
  +---> mill (export to PDF, CSV, HTML, etc.)
  +---> harvest (compute metrics, write to .harvest/)
  +---> silo (pack claims for reuse)
  |
  v
orchard (orchard.json -- coordinates multiple sprints)
  |
  v
  |
  v
barn (templates -- bootstrap new sprints)
```

Key principle: `claims.json` is the source of truth. `compilation.json` is the validated snapshot. Every downstream tool reads from `compilation.json`, never from `claims.json` directly.

## Unified CLI

The `grainulation` package provides a single command that delegates to the appropriate tool:

```bash
npx @grainulation/grainulation wheat init
npx @grainulation/grainulation mill export --format pdf
npx @grainulation/grainulation harvest report
npx @grainulation/grainulation silo load security-baseline
npx @grainulation/grainulation orchard status
```

The unified CLI adds no functionality beyond delegation. Each tool works identically whether invoked through `grainulation` or directly.

## Health Check System

Run a cross-tool health check to verify the ecosystem is configured correctly:

```bash
npx @grainulation/grainulation doctor
```

The doctor checks:

| Check          | What it validates                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Node.js        | Version is >= 18                                                                                                         |
| npm            | npm is available on the system                                                                                           |
| Tool detection | Each of the 8 packages is resolvable via global npm, npx cache, local node_modules, source checkout, or npx --no-install |

Output is a table of pass/fail results. Use `--json` for machine-readable output.

## Cross-Tool Integration Points

These are the specific integration surfaces between tools:


**wheat + mill** -- Mill reads `compilation.json` produced by `wheat compile`. No configuration needed beyond running both in the same directory.

**wheat + harvest** -- Harvest reads `compilation.json` to compute metrics. It also reads `claims.json` commit history (via git log) for velocity and decay calculations.

**wheat + silo** -- Silo reads `claims.json` to create packs, and writes merged claims back into `claims.json` when loading packs.

**wheat + barn** -- Barn provides sprint templates that include pre-configured `CLAUDE.md`, directory structure, and optional starter claims.

**orchard + wheat** -- Orchard reads `claims.json` from multiple sprint directories to detect cross-sprint conflicts and compute project-level status.


**harvest + mill** -- Mill can include harvest metrics in exported artifacts (e.g., a PDF appendix with sprint health data).

## Version Compatibility

Each tool maintains independent semver versioning. The `schema_version` field in `claims.json`, `compilation.json`, `pack.json`, and `orchard.json` ensures cross-tool compatibility. All tools in a project must agree on the same `schema_version`. Run `grainulation doctor --json` to see installed versions.
