# Use Grainulator with your agent

Grainulator adds evidence-tracked research to the coding agent you already use. Pick your agent, run one install, start a new session.

You need Node.js 24 or later and git. Grainulator runs on your machine; there is no account or hosted service.

| Agent | Install | What you get |
| --- | --- | --- |
| [Claude Code](#claude-code) | `claude plugin install grainulator --marketplace grainulation/grainulator` | Full plugin: tools, research skills, research agent and hooks |
| [Codex](#codex) | `codex plugin marketplace add grainulation/grainulator`<br>`codex plugin add grainulator@grainulation-marketplace` | Full plugin, plus a one-time project setup |
| [Antigravity](#antigravity) | `agy plugin install https://github.com/grainulation/grainulator` | Full plugin: tools, research skills and research agent |
| [Other agents](#other-agents) | MCP server: `npx -y github:grainulation/grainulator#v2.2.0 mcp --dir <project>` | Tools only |

After installing, [check that it works](#check-that-it-works).

## Claude Code

Run this in your terminal:

```sh
claude plugin install grainulator --marketplace grainulation/grainulator
```

This adds the Grainulation marketplace and installs the plugin in one step. It is safe to run again. Then start a new Claude Code session.

The install may print `1 userConfig option not yet set`. That option controls background tips and is optional. To change it, run `/plugin configure grainulator@grainulation-marketplace` in Claude Code.

## Codex

Run these in your terminal:

```sh
codex plugin marketplace add grainulation/grainulator
codex plugin add grainulator@grainulation-marketplace
```

Codex starts plugins outside your project, so Grainulator needs to know which project it may use. From your project folder, run:

```sh
npx -y github:grainulation/grainulator#v2.2.0 setup --dir "$PWD"
```

Then restart Codex. This saves a default project in `~/.config/grainulator/workspace.json`. Run it again from another folder to switch projects or set `GRAINULATOR_WORKSPACE=/absolute/path/to/project` when launching Codex to override it for one session.

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
			"command": "npx",
			"args": ["-y", "github:grainulation/grainulator#v2.2.0", "mcp", "--dir", "/absolute/path/to/project"]
		}
	}
}
```

The first start downloads Grainulator and takes a few seconds; later starts are faster. Change `#v2.2.0` to move to a newer release.

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
| Other agents | Change the `#v2.2.0` tag in your MCP settings | Delete the `grainulator` server from your MCP settings |

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
