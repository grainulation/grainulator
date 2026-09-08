# Host and migration evidence

On September 7, 2026, actual Codex 0.153.4 and Claude Code 2.1.263 processes used the isolated installed Grainulator artifact to add a synthetic claim, compile, and read status. Each resumed its own native session and searched for the persisted marker. Acceptance checked both tool-call records and the resulting ledger; a model narrative alone was insufficient.

Reproduce from the full source checkout with its development dependencies and existing host authentication. These maintainer scripts are not installed-package commands:

```sh
npm run test:install
node scripts/host-integration-check.mjs
GRAINULATOR_LEGACY_WHEAT=/absolute/path/to/legacy/bin/wheat.js node scripts/migration-check.mjs
```

The live host command consumes model usage. It uses temporary fixtures and invocation-only MCP settings; it does not modify global settings or existing conversations. Evidence: `.dogfood/host-integration-audit.json`. Codex explicitly allows only the four fixture MCP tools at invocation time. Claude disables built-in tools and lifecycle hooks for this MCP test. These MCP results establish installed tool use and native continuation, not dashboard interception or cancellation in every host. A separate real-host hook check below covers the Write boundary.

A separate `node scripts/native-hook-check.mjs` run used real Claude Write calls with invocation-only hooks from the installed artifact. The protected claims fixture remained unchanged, while an ordinary notes write succeeded. Evidence: `.dogfood/native-hook-audit.json`.

The write guard now accepts Claude's stdin JSON hook payload and returns blocking exit code 2 for protected ledger writes. Regressions cover that protocol. It protects the matching Write/Edit boundary; shell writes and unrelated tools are outside its scope. See the official [Claude hooks contract](https://code.claude.com/docs/en/hooks), [Claude noninteractive usage](https://code.claude.com/docs/en/headless), and [Codex noninteractive usage](https://developers.openai.com/codex/noninteractive).

The migration rehearsal creates data with the available legacy Wheat checkout, upgrades a copy through the installed root CLI, checks unchanged IDs, old claims, custom fields and nested metadata, then uses the old CLI to read/write the upgraded copy. Snapshot rollback restores exact claims and unrelated configuration hashes; originals remain untouched. Evidence: `.dogfood/migration-audit.json`. Set `GRAINULATOR_LEGACY_WHEAT` explicitly to the legacy CLI file when repeating this check; the script does not assume a maintainer checkout. This verifies the available version and format, not every historical configuration.

Grainulator integrates through CLI/MCP and the managed execution adapter. Agent permissions and remote access remain with the native host.

## Native plugin workspace setup

The direct MCP tests above use an explicit workspace path. They do not establish native plugin discovery or subagent access. For the native Codex plugin, launch with `GRAINULATOR_WORKSPACE=/absolute/path/to/project codex` (or `codex exec ...` with the same binding), using an existing absolute directory. Codex starts the plugin server inside its package cache; the environment binding selects and scopes access to your project. Without it, discovery may succeed while tool calls return a configuration-required error without writes.

Codex Desktop must receive that variable in its own process environment; an export in another terminal is insufficient for an already running app. The alternative is a direct MCP registration using the configuration printed by `grainulator connect --dir /absolute/path/to/project`. That path binds the workspace explicitly and does not require the native plugin variable, but it does not test plugin skills or hooks. Claude's plugin registration does not need this Codex-specific binding.

The native Codex package uses the root Agent Plugin `plugin.json` and `mcp.json`, with a `.codex-plugin/plugin.json` host overlay. Refer to [installation](INSTALLATION.md) and [full-plugin acceptance](PLUGIN-TESTING.md) for the current setup and exact test scope; do not infer a native-plugin pass from the historical direct-MCP results above.
