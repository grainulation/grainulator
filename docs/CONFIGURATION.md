# Project configuration

`grainulator.config.json` has numeric `schema_version: 1` and independent `evidence`, `orchestration` and `runtime` objects. Unknown fields are preserved by locked section updates. `GRAINULATOR_CONFIG` remains the separate native-host workspace binding file; it does not select this project configuration.

```json
{"schema_version":1,"evidence":{"dirs":{"output":"output"},"compiler":{"claims":"claims.json","compilation":"compilation.json"}},"orchestration":{"sprints":[],"settings":{"sync_interval":"manual"}}}
```

Evidence reads the exact selected sprint's section. Orchestration can ascend to the nearest defining section only inside an explicit authorized workspace: `grainulator orchestrate plan --dir ./sprints/one --workspace .`. A child evidence-only file does not shadow the parent portfolio. Relative paths are resolved from the file that defines each section and must remain within the authorized workspace. `--config <file>` explicitly selects a project configuration for config/orchestration commands; it never selects the host binding.

`grainulator config check --dir . --json` validates with the real loaders. `config explain` reports section presence and sources without revealing values. Missing optional configuration uses defaults. Present malformed, unreadable, unsupported-version or escaping configuration fails clearly. There is no legacy-name reader or automatic conversion; use the separately distributed offline migration tool for historical state.

The bundled schema is `packages/shared/schemas/project-config.schema.json`. Validation works offline. Native runtime validates its own section's execution semantics; evidence and runtime ledger schemas remain distinct. In-progress project migration markers block normal writes until verification or rollback is completed.

MCP always confines section and migration checks to its registered workspace, including nested sprints. Direct CLI calls identify an enclosing canonical project or Git root for migration/publication protection; pass an explicit workspace for ancestor portfolio lookup. These checks never search historical state locations as fallbacks. Exports cannot overwrite configured ledger/compilation files, migration journals/backups, retained originals or host settings, including aliases.

## Native plugin discovery profile

`grainulator setup --dir /absolute/project --toolset compact` saves the existing
15-tool evidence/local-memory/export profile alongside the native workspace
binding in `~/.config/grainulator/workspace.json`. Restart the host to use it.
`--toolset legacy` selects all 29 compatibility tools; omitting the flag retains
the legacy default. This setting does not change direct CLI MCP registrations or
Claude's separate registration. See [the profile reference](TOOLS.md#compact-profile-and-container-discovery)
for capabilities and the tool-name mapping.

`GRAINULATOR_TOOLSET=legacy|compact` overrides the saved profile for one native
launch. An explicit `GRAINULATOR_WORKSPACE` bypasses saved workspace/profile
settings, so set both variables to choose compact for that launch. Invalid
profiles block native tool calls; they do not silently select a broader profile.
