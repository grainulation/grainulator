# Grainulator Documentation

Grainulator provides portable evidence, verifiable claims, and grounded reports for model-assisted workflows.

## Getting Started & Setup

- [Installation](INSTALLATION.md): Supported Node LTS versions, source/identified archives and offline installation.
- [Upgrading](UPGRADING.md): The v3 migration, retained history and explicit host cutover.
- [Agent Setup](AGENT-SETUP.md): Plugin installation and explicit workspace binding for supported agent hosts.
- [Deployment](DEPLOYMENT.md): Container, package checks, and separate website ownership.
- [Configuration](CONFIGURATION.md): Scoped config resolution and read-only validation.
- [Native Runtime](RUNTIME.md): Verified assets, typed claims and explicit hook enrollment.
- [Uninstall](UNINSTALL.md): Remove the tool while retaining user data.

## Core Evidence & Reports

- [Tool Reference](TOOLS.md): Unified MCP tool reference (`init`, `add_claim`, `compile`, `resolve`, `search`, `status`).
- [Grounded Reports](GROUNDED-REPORTS.md): Evidence bundles, DSSE in-toto Statement v1 attestation, and Grounding Guard.
- [Next Actions](NEXT-ACTIONS.md): Automated Plan-Compile-Execute next-step resolution.
- [Research Workflow](RESEARCH.md): Evidence-backed research sprints and passage tracking.
- [Session Recovery](RECOVERY.md): Resuming interrupted research sessions from atomic checkpoints after cancellations or crashes.

## Architecture & Integration

- [Adapter Protocol](ADAPTERS.md): Command adapters, bounded execution loops, and exit codes.
- [Host Integration](HOSTS.md): Integrating skills, hooks, and MCP servers across AI agent hosts.
- [Repository Structure](STRUCTURE.md): Codebase map, packages, and internal component boundaries.

## Development & Verification

- [Local Dogfooding](DOGFOOD.md): Local CLI/MCP development, headless research, and dogfood tests.
- [Plugin Testing](PLUGIN-TESTING.md): Validating manifests, hooks, and agent tool execution.
- [Readiness Checklist](READINESS.md): Verification matrix, regression checks, and packaging gates.
- [Release Candidates](RELEASING.md): Frozen artifacts, native platform checks and Homebrew promotion.
- [Evaluation](EVALUATION.md): Benchmark results, model comparisons, and calibration metrics.

## Security & System Boundaries

- [Blind Spots & Limits](BLIND-SPOTS.md): Structural limits ledger (`L1`–`L6`) and mitigation boundaries.
- [Security Controls](SECURITY-REVIEW.md): Origin validation, path traversal containment, and credential safety.
