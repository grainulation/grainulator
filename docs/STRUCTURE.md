# Grainulator directory structure

```text
grainulator/
├── .claude-plugin/       Claude plugin manifest
├── .codex-plugin/        Codex host overlay
├── plugin.json          Agent Plugin manifest
├── mcp.json             Native Codex MCP configuration
├── .nvmrc               Node 25 local default
├── .node-version        Node 25 local default
├── .github/             CI and repository workflows
├── agents/              Host agent instructions
├── bin/                 Grainulator CLI entry point
├── docs/                Architecture, migration and local test guides
├── evals/               Evaluation cases and fixtures
├── hooks/               Evidence hooks and write guard
├── lib/                 Research, providers and execution loop
├── packages/
│   ├── analytics/       Sprint metrics and generated reports
│   ├── evidence/        Claims, compiler and MCP operations
│   ├── exports/         Briefs, decks and document conversion
│   ├── legacy-cli/      Compatibility CLI
│   ├── memory/          Retrieval and source context
│   ├── orchestration/   Sprint dependencies
│   ├── runtime/         Managed execution and verification
│   └── shared/          Shared utilities and assets
├── scripts/             Previews, audits and acceptance checks
├── site/                Product site and research playground
├── skills/              Portable and host workflow instructions
├── templates/           Shared accessible artifact templates
├── test/                Plugin and regression tests
├── package.json
└── package-lock.json
```

The former permission dashboard is no longer part of Grainulator. Local build files, caches, and test reports are omitted from this map.
