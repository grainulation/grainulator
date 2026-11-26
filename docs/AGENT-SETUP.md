# Use Grainulator with your agent

Grainulator adds evidence-tracked research to the coding agent you already use. Pick your agent, run one install, start a new session.

You need Node.js 24 or later and git. Grainulator runs on your machine; there is no account or hosted service.

| Agent | Install | What you get |
| --- | --- | --- |
| [Claude Code](#claude-code) | `claude plugin install grainulator --marketplace grainulation/grainulator` | Full plugin: tools, research skills, research agent and hooks |
| [Codex](#codex) | `codex plugin marketplace add grainulation/grainulator`<br>`codex plugin add grainulator@grainulation-marketplace` | Full plugin, plus a one-time project setup |
| [Antigravity](#antigravity) | `agy plugin install https://github.com/grainulation/grainulator` | Full plugin: tools, research skills and research agent |
| [Other agents](#other-agents) | MCP server: `node /absolute/path/to/grainulator/bin/grainulator.js mcp --dir <project>` | Tools only |

After installing, [check that it works](#check-that-it-works).

## Runtime prerequisite for Git-based plugins

Install the matching Grainulator CLI from the trusted release archive or Homebrew channel before adding a source-only Git plugin. The plugin launcher uses that installed runtime; no compiler, package manager or download runs during plugin startup. `GRAINULATOR_CLI` can select an absolute installed CLI path when it is outside the host's PATH. The plugin and CLI must match version, bridge protocol and canonical source fingerprint. The bundled marketplace pins its Git source to the declared release tag. A manually selected moving source branch may be newer than the published CLI: select the matching release revision, or build and install a local archive from that same source. An unpublished version is not made available by `brew upgrade`.

A compiled plugin archive uses a JavaScript launcher and includes its own runtime and does not need another CLI on PATH. From a source checkout, run `npm ci --ignore-scripts` and `npm run build` before direct CLI use or local packing. The installed package, plugin cache and source tree remain separate copies.

## Claude Code

Run this in your terminal:

```sh
claude plugin install grainulator --marketplace grainulation/grainulator
```

This adds the Grainulation marketplace and installs the plugin in one step. It is safe to run again. Then start a new Claude Code session.

The optional `tips_level` setting controls post-mutation next-action hints: `on` shows next steps, `quiet` shows compiler blockers only, and `off` disables the hook. Configure it with `/plugin configure grainulator@grainulation-marketplace` in Claude Code.

## Codex

Run these in your terminal:

```sh
codex plugin marketplace add grainulation/grainulator
codex plugin add grainulator@grainulation-marketplace
```

Codex starts plugins outside your project, so Grainulator needs to know which project it may use. From your project folder, run:

```sh
node /absolute/path/to/grainulator/bin/grainulator.js setup --dir "$PWD"
```

Then restart Codex. This saves a default project in `~/.config/grainulator/workspace.json`. Run it again from another folder to switch projects or set `GRAINULATOR_WORKSPACE=/absolute/path/to/project` when launching Codex to override it for one session.

For the focused evidence, local memory and export workflow, add
`--toolset compact` to the setup command. This selects the supported 15-tool
profile after restart. Omit the flag or select `--toolset legacy` for the
29-tool compatibility profile. With an environment workspace override, set
`GRAINULATOR_TOOLSET=compact` too. See [profile capabilities](TOOLS.md#compact-profile-and-container-discovery)
before updating custom tool allowlists.

## Antigravity

Run this in your terminal:

```sh
agy plugin install https://github.com/grainulation/grainulator
```

This installs Grainulator's tools, research skills and research agent. Then start a new Antigravity session from your project folder. Grainulator uses that folder as its project.

Coming from Gemini CLI? Antigravity replaced it. Install the plugin as above rather than importing an old Gemini setup.

## Other agents

Any agent that supports MCP (Cursor, opencode, Claude Desktop and others) can run Grainulator as an MCP server. Add a server with this command, replacing the path with your project folder:

```json
{
	"mcpServers": {
		"grainulator": {
			"command": "node",
			"args": ["/absolute/path/to/grainulator/bin/grainulator.js", "mcp", "--dir", "/absolute/path/to/project"]
		}
	}
}
```

First install an identified [source checkout or archive](INSTALLATION.md), then point this command at that copy. This literal Node command uses existing local files; it does not download Grainulator.

MCP gives your agent Grainulator's tools. The research skills, research agent and hooks come with the Claude Code, Codex and Antigravity plugins.

## Check that it works

In a new session, ask your agent:

```text
Use Grainulator to show the status of this project.
```

A working install answers with Grainulator's status. In a project without research yet, that is a message saying no sprint exists and how to start one.

## Update or remove

| Agent | Update | Remove |
| --- | --- | --- |
| Claude Code | `claude plugin update grainulator@grainulation-marketplace` | `claude plugin uninstall grainulator@grainulation-marketplace` |
| Codex | `codex plugin marketplace upgrade grainulation-marketplace`, then `codex plugin add grainulator@grainulation-marketplace` | `codex plugin remove grainulator@grainulation-marketplace` |
| Antigravity | Run the install command again | `agy plugin uninstall grainulator` |
| Other agents | Update the installation named by the command; rebind its absolute path if it changes | Delete the `grainulator` server from your MCP settings |

Restart your agent after updating.

## Troubleshooting

| Message | What to do |
| --- | --- |
| `Plugin "grainulator" not found in marketplace "grainulation-marketplace"` | The marketplace was not added. Use the one-line Claude Code command above, which adds it. |
| `Run grainulator setup --dir /absolute/project once, then restart Codex` | Run the Codex project setup command from your project folder, then restart Codex. |
| `Workspace must be an absolute project directory` | Pass a full path, for example `--dir "$PWD"`, not `--dir .`. |
| `The packages it lists were not installed ... folder link or a bundled copy` | Safe to ignore. Grainulator ships with everything it needs. |
| Node.js version errors | Install Node.js 24 or later and make sure your agent can find it on `PATH`. |

Still stuck? [Open an issue](https://github.com/grainulation/grainulator/issues) with the command you ran and the full message.

## More detail

- [Installation](INSTALLATION.md): run a tagged release from a checkout or an identified local archive.
- [Plugin testing](PLUGIN-TESTING.md): verify a local plugin build in Claude Code or Codex.
