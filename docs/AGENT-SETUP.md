# Use Grainulator with your agent

Grainulator works inside Claude Code and Codex. Choose the agent you use; you do not need to change models.

First, get the [v2.0.3 GitHub release](https://github.com/grainulation/grainulator/releases/tag/v2.0.3) and use Node.js 24 or later. This version is not on npm. See [installation](INSTALLATION.md) if you need help getting the release.

## Claude Code

Load the Grainulator plugin from the installed release folder:

```sh
claude --plugin-dir /absolute/path/to/grainulator
```

The plugin adds Grainulator's research steps, evidence tools, and checks to Claude Code. Start a new session after changing the installed plugin. See the [Claude Code plugin guide](PLUGIN-TESTING.md#claude-code) for installation and verification details.

## Codex

Install Grainulator as a Codex plugin from the release, using the [Codex plugin guide](PLUGIN-TESTING.md#codex). Then choose the project Grainulator may access:

```sh
node /absolute/path/to/grainulator/bin/grainulator.js setup --dir /absolute/path/to/project
```

Use an existing project folder, then restart Codex. This saves a default project for future Codex sessions. The [Codex plugin guide](PLUGIN-TESTING.md#codex) explains how to install and check the plugin.

## Other agents

Grainulator also provides an MCP connection. See [Connect your agent](../README.md#other-agents-connect-through-mcp). MCP is an alternative connection; it does not load the Claude Code or Codex plugin features.
