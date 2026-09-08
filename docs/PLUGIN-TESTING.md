# Test the installed plugin

Start from the `v2.0.1` tag of the [GitHub repository](https://github.com/grainulation/grainulator/tree/v2.0.1), or the identified archive you intend to test. The GitHub release does not publish an npm package.

CLI installation, direct MCP connection, full plugin loading, and subagent tool access are separate checks. A passing `grainulator connect` test does not establish that a host discovered the plugin's skills or hooks.

For an existing 1.x installation, follow the [upgrade checklist](UPGRADING.md) first: refresh the correct marketplace, update the existing installation scope, inspect pins, and restart the host. Preserve host security wrappers and user-owned configuration throughout these checks.

## Identify the build

From the full source checkout with Node 24 or later, run `npm run pack:local`. It stages the npm distribution, creates a unique `2.0.1-local.<hash>` version, and prints the archive path. The source version stays unchanged and nothing is published. The report at `.dogfood/builds/latest.json` records the archive SHA-256 and source fingerprint.

Install that exact archive into the separate consumer directory. `grainulator doctor --json` reports `build.id`, `build.version`, and `build.verified`. It checks the recorded packaged files, reporting changed or missing files. Tagged releases and marketplace builds include a committed `build-info.json` with an ID such as `release-2.0.1-<hash>`. Doctor verifies the shipped file checksums. A development checkout without a manifest is reported as a source checkout with its version; that alone is not an unhealthy installation. A recognized host security wrapper is reported under `host_adaptations` only when its original server configuration still matches; arbitrary command or configuration changes fail verification. Local packaging preserves the live host configuration and stages its portable server definition.

Repacking source does not update an installed package. Reinstalling a package does not update a copied marketplace plugin or an already running host. Verify the build ID and files at each layer, then start a fresh host session. Preserve the previous archive and session data for rollback.

## Claude Code

Load the installed package for one invocation with `claude --plugin-dir /absolute/path/to/installed/grainulator`. Its Claude manifest registers the MCP server, skills, agent, and hooks. The subagent allowlist includes the actual plugin-prefixed tool names as well as direct-MCP names. Optional external connectors are not prerequisites.

In a disposable sprint, verify actual tool events for initialization, conflicting claim creation, compilation, resolution, and search after native session resume. Separately invoke the packaged Grainulator agent and require a real MCP status call. A parent session's tool access is not proof of subagent access. For the write guard, verify an unchanged protected-file hash and a successful ordinary notes write.

## Codex

Codex 0.153.4 loads the Agent Plugin manifest at root `plugin.json` and its bundled server from root `mcp.json`. This format expands `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`; the `.codex-plugin/plugin.json` overlay supplies presentation metadata and passes through `GRAINULATOR_WORKSPACE`. The older native manifest format alone does not expand these path variables. Claude continues using its separate manifest and `.mcp.json`.

Use a dedicated local marketplace whose plugin entry points to the installed package copy, then register that marketplace and install its Grainulator entry through Codex. The bundled `.claude-plugin/marketplace.json` points to the existing remote product; it is not the local test marketplace. Verify the cached plugin's build ID, start a fresh session, and require both bundled skill discovery and actual plugin-provided MCP calls. Do not inject a separate direct-MCP server into this test.

Codex starts Agent Plugin servers inside the plugin directory. Save the real project before restarting the host, using the CLI from the installed build:

```sh
node /absolute/path/to/installed/grainulator/bin/grainulator.js setup --dir /absolute/path/to/project
```

This writes `~/.config/grainulator/workspace.json`, a shared default for this user's native sessions, without changing host settings. It also works for Codex Desktop after restart. An absolute `GRAINULATOR_CONFIG` can select another config file. To override the saved workspace for one host launch:

```sh
GRAINULATOR_WORKSPACE=/absolute/path/to/project codex
```

Use an existing directory and ensure Node 24 or later is on the host's PATH (25 preferred). The launcher uses that directory as its containment boundary; another sprint must remain within it. Missing or invalid configuration leaves tool discovery available but every tool call returns a configuration error without reading or creating sprint files. Restart the host after changing the saved default. An environment override must reach the actual desktop process; setting it in an unrelated terminal does not update an already running application.

The native acceptance helper passes only this workspace binding through the environment and disables unrelated plugins and direct MCP connections for its test invocations. It preserves their stored settings. The helper selects plugins using one `-c 'plugins={...}'` TOML table. Quote plugin identifiers inside that table; Codex 0.153.4 does not interpret quoted segments in dotted override keys as TOML paths, which can create a different key instead of selecting the intended plugin. The helper saves the discovered skill catalog, real native tool calls, its own thread UUID, and an explicit resume of that exact UUID. No `--last` session selection is used.

## Maintainer acceptance helpers

These commands run from the full source checkout, using existing authenticated hosts and model usage:

```sh
node scripts/claude-plugin-agent-check.mjs --plugin-dir /absolute/path/to/installed/grainulator
node scripts/codex-plugin-check.mjs /absolute/path/to/local-marketplace /absolute/path/to/cached/grainulator/version grainulator-local-test
```

Keep the exact archive fingerprint, installed/cache verification, host version, observed tool events, and fixture hashes with the result. Failed, blocked, and source-only findings stay in the issue register until the relevant installed-host check passes. A successful user run is additional evidence, not automatic closure of unrelated failures.
