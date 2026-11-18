# Grainulator directory structure

```text
grainulator/
├── .claude-plugin/       Claude plugin manifest
├── .codex-plugin/        Codex host overlay
├── plugin.json          Agent Plugin manifest
├── mcp.json             Native Codex MCP configuration
├── .nvmrc               Node 24 local default
├── .node-version        Node 24 local default
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
│   ├── memory/          Retrieval and source context
│   ├── orchestration/   Sprint dependencies
│   ├── runtime/         Managed execution and verification
│   └── shared/          Shared utilities and assets
├── scripts/             Previews, audits and acceptance checks
├── public/              Local research playground runtime assets
├── skills/              Portable and host workflow instructions
├── templates/           Shared accessible artifact templates
├── test/                Plugin and regression tests
├── migration/           Separate offline conversion artifact, excluded from base
├── share/               Generated manpage and completions
├── package.json
└── package-lock.json
```

The former permission dashboard and component browser apps are no longer part of Grainulator. Generated analytics/portfolio reports and reusable document templates remain supported. Local build files, caches, and test reports are omitted from this map.
