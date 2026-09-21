# Upgrade from Grainulator 1.x to 2.x

Version 2 consolidates the ecosystem into one package and one MCP server. Updating the plugin does not rewrite your host settings, active conversations, project instructions, or saved research. Follow this checklist in the copy and host scope you actually use.

## 1. Identify the installation

Use Node.js 24 or later. Keep the existing installation and research data until the replacement works. A source checkout, an npm consumer installation, a marketplace checkout, a host's plugin cache, and a running host are separate copies; updating one does not update the others.

Run `node /path/to/loaded/grainulator/bin/grainulator.js doctor --json` against the installed or cached copy, rather than a different checkout on your PATH. Compare its version and build identity with the intended release or local archive. Tagged releases and marketplace builds include a committed integrity manifest; local archives created with `npm run pack:local` also have a distinct verifiable identity. A development checkout without a manifest reports its source version and does not claim integrity verification. See [installation](INSTALLATION.md) for identified archives and [full-plugin checks](PLUGIN-TESTING.md) for loaded-cache verification.

The 2.x releases are distributed through [GitHub releases](https://github.com/grainulation/grainulator/releases), not a new npm registry publication. `npm update` against the registry does not select this release.

## 2. Update through your host

For Claude Code, inspect the marketplace and installed scope first:

```sh
claude plugin marketplace list --json
claude plugin list --json
```

For an existing installation from `grainulation-marketplace`, refresh that marketplace, then update the plugin in its existing scope. This example is for a **user-scoped** installation:

```sh
claude plugin marketplace update grainulation-marketplace
claude plugin update grainulator@grainulation-marketplace --scope user
```

Use `--scope project` or `--scope local` if that is the installation you intend to update. An absent plugin needs `claude plugin install grainulator@grainulation-marketplace --scope user` instead. Managed installations may require the host administrator. Check `claude plugin update --help` in your installed host if its options differ.

A marketplace refresh updates its catalog; it does not by itself update the installed plugin. Check for an older project/local installation or marketplace source pinned to a commit, tag, or local directory if the selected build stays old. Review that specific pin or scope with its owner; do not uninstall every copy or delete the cache as a routine fix. Restart Claude Code and verify the loaded version in a fresh conversation. An already running conversation can retain its old tool catalog.

For Codex, refresh and update through its plugin manager, verify the selected marketplace and cached build, then restart the host. A CLI archive installation does not replace a native plugin cache. For local build testing, use a local marketplace that actually points to the intended installed archive; the bundled remote Claude marketplace points to GitHub and does not select your local edits. See [native plugin testing](PLUGIN-TESTING.md).

Host-managed security wrappers and approved MCP launch commands belong to the host. Preserve them; do not replace them with a bare Node command to make a configuration or build check pass.

## 3. Reconnect Grainulator

Version 2 uses one server named `grainulator`. If you added a manual connection in 1.x, check it and update it to the new server. The plugin handles its own connection; only change custom tool lists or instructions that refer to old names. Keep unrelated connections as they are.

Claude's plugin registers `grainulator` automatically. For a direct MCP installation, `node /path/to/grainulator/bin/grainulator.js connect --dir /absolute/project` prints the replacement configuration for review. Remove a retired manual registration only after confirming it belongs to this installation and the new connection works. Keep unrelated connectors intact.

For native Codex, save the workspace using the CLI from the new installed build, then restart Codex:

```sh
node /path/to/grainulator/bin/grainulator.js setup --dir /absolute/path/to/project
```

This writes `~/.config/grainulator/workspace.json` and works for Codex Desktop without a terminal launch. It is a shared default for this user's native sessions; it does not edit host settings. The process environment can override it for one launch:

```sh
GRAINULATOR_WORKSPACE=/absolute/path/to/project codex
```

The project must exist and contain the intended sprint directories. The plugin cache is not the project. See [workspace setup](INSTALLATION.md#bind-the-native-codex-plugin-to-a-workspace) for persistent desktop setup and connection alternatives.

## 4. Keep data and review old instructions

Keep existing `claims.json`, `compilation.json`, session exports, and sprint directories in place. Do not initialize over an existing sprint to repair a connection. Test `status` against its explicit directory first.

Check the memory store separately. The old Claude plugin selected `${CLAUDE_PLUGIN_DATA}/silo`; the new plugin selects `${CLAUDE_PLUGIN_DATA}/memory`. Changing the server registration does not copy that store. If `memory_list` appears empty, locate and back up the original store before selecting it through an authorized `GRAINULATOR_MEMORY_DIR` configuration or moving data. The resolver still accepts `SILO_STORE`, but an explicit `GRAINULATOR_MEMORY_DIR` takes precedence. Its `~/.silo` fallback does not migrate an old plugin-data directory. Do not merge stores or overwrite their indexes without reviewing both.

Review applicable `CLAUDE.md`, `AGENTS.md`, and custom agent instructions for setup steps from 1.x. Remove instructions for features that are no longer installed. Keep your own rules, active research folders, permission settings, and unrelated connections. Your agent still controls permissions and remote access.

Existing source/data files can retain historical names for compatibility. Do not perform a repository-wide rename of words or JSON fields merely to remove old branding.

## 5. Verify the new session

- Confirm the intended installed/cache version and build identity, then start a fresh host session.
- Check the host exposes `grainulator`, and make a real `status` call with the existing sprint's explicit `dir`. Check `memory_list` against the intended store.
- Invoke the bundled Grainulator workflow or agent if you use the full plugin. A successful direct MCP connection alone does not verify skills, agents, or hooks.

If a check fails, keep the original data and previous archive available. Report the actual loaded path, host version, selected scope, and error without including credentials. [Full-plugin acceptance](PLUGIN-TESTING.md) describes the reproducible checks.
