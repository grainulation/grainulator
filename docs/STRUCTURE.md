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
├── bootstrap/           Maintained Node-native plugin launcher
├── bin/                 Ignored compiled CLI entry point
├── docs/                Architecture, migration and local test guides
├── evals/               Evaluation cases and fixtures
├── hooks/               Evidence hooks and write guard
├── lib/                 Research, providers and execution loop
├── packages/
│   ├── analytics/       Sprint metrics and Markdown reports
│   ├── evidence/        Claims, compiler and MCP operations
│   ├── exports/         Evidence data and Markdown conversion
│   ├── memory/          Retrieval and source context
│   ├── orchestration/   Sprint dependencies
│   ├── runtime/         Managed execution and verification
│   └── shared/          Shared utilities and schemas
├── scripts/             Audits and acceptance checks
├── skills/              Portable and host workflow instructions
├── test/                Generated plugin and regression tests
├── typescript/          Canonical TypeScript sources mirroring runtime paths
│   └── outputs.json     Complete source/output inventory
├── tsconfig.json        Strict checking for the complete TypeScript graph
├── migration/           Separate offline conversion artifact, excluded from base
├── share/               Generated manpage and completions
├── package.json
└── package-lock.json
```

The former permission dashboard and component browser apps are no longer part of Grainulator. Analytics reports use Markdown, and JSON/Markdown exports preserve evidence for other tools. Presentation templates and renderers are retired. Local build files, caches, and test reports are omitted from this map.

First-party JavaScript in the runtime directories is generated from the mirrored `typescript/` tree. Edit the canonical source and run `npm run build:types`; see [TYPESCRIPT.md](TYPESCRIPT.md) for the generation and verification workflow. Rust, shell, schemas and other data stay in their native directories.
