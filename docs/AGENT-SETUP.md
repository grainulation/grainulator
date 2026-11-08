# Use Grainulator with your agent

Grainulator adds evidence-tracked research to the coding agent you already use. Pick your agent, run one install, start a new session.

You need Node.js 24 or later and git. Grainulator runs on your machine; there is no account or hosted service.

| Agent | Install | What you get |
| --- | --- | --- |
| [Claude Code](#claude-code) | `claude plugin install grainulator --marketplace grainulation/grainulator` | Full plugin: tools, research skills, research agent and hooks |
| [Codex](#codex) | `codex plugin marketplace add grainulation/grainulator`<br>`codex plugin add grainulator@grainulation-marketplace` | Full plugin, plus a one-time project setup |
| [Gemini CLI](#gemini-cli) | `gemini extensions install https://github.com/grainulation/grainulator` | Extension: tools and Gemini context |
| [Other agents](#other-agents) | MCP server: `npx -y github:grainulation/grainulator#v2.1.0 mcp --dir <project>` | Tools only |

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
npx -y github:grainulation/grainulator#v2.1.0 setup --dir "$PWD"
```

Then restart Codex. This saves a default project in `~/.config/grainulator/workspace.json`. Run it again from another folder to switch projects or set `GRAINULATOR_WORKSPACE=/absolute/path/to/project` when launching Codex to override it for one session.

## Gemini CLI

Run this in your terminal:

```sh
gemini extensions install https://github.com/grainulation/grainulator
```

Gemini asks you to trust the extension source and, if you run the command inside a folder you have not trusted yet, that folder too. Answer `y` to both. Add `--ref <tag>` to install a specific release instead of the latest code.

Start a new Gemini session from your project folder. Grainulator uses the folder Gemini runs in as its project. If Gemini asks whether to trust the folder, answer yes; Gemini turns off project tools in folders it does not trust.

## Other agents

Any agent that supports MCP (Cursor, opencode, Claude Desktop, Gemini and others) can run Grainulator as an MCP server. Add a server with this command, replacing the path with your project folder:

```json
{
	"mcpServers": {
		"grainulator": {
			"command": "npx",
			"args": ["-y", "github:grainulation/grainulator#v2.1.0", "mcp", "--dir", "/absolute/path/to/project"]
		}
	}
}
```

The first start downloads Grainulator and takes a few seconds; later starts are faster. Change `#v2.1.0` to move to a newer release.

For example, Gemini CLI can add it from your project folder without the extension:

```sh
gemini mcp add grainulator npx -y github:grainulation/grainulator#v2.1.0 mcp --dir "$PWD"
```

MCP gives your agent Grainulator's tools. The research skills, research agent and hooks come with the Claude Code and Codex plugins.

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
| Gemini CLI | `gemini extensions update grainulator` | `gemini extensions uninstall grainulator` |
| Other agents | Change the `#v2.1.0` tag in your MCP settings | Delete the `grainulator` server from your MCP settings |

Restart your agent after updating.

## Troubleshooting

| Message | What to do |
| --- | --- |
| `Plugin "grainulator" not found in marketplace "grainulation-marketplace"` | The marketplace was not added. Use the one-line Claude Code command above, which adds it. |
| `Run grainulator setup --dir /absolute/project once, then restart Codex` | Run the Codex project setup command from your project folder, then restart Codex. |
| `Workspace must be an absolute project directory` | Pass a full path, for example `--dir "$PWD"`, not `--dir .`. |
| `The packages it lists were not installed ... folder link or a bundled copy` | Safe to ignore. Grainulator ships with everything it needs. |
| Gemini: `Do you trust the files in this folder?` or `workspace ... is not trusted` | Answer `y`. To avoid trusting an unrelated folder, run the install from your home or project folder. |
| Gemini lists the server as `Disabled` | Trust the project folder in Gemini, then start a new session. |
| Node.js version errors | Install Node.js 24 or later and make sure your agent can find it on `PATH`. |

Still stuck? [Open an issue](https://github.com/grainulation/grainulator/issues) with the command you ran and the full message.

## More detail

- [Installation](INSTALLATION.md): run a tagged release from a checkout or an identified local archive.
- [Plugin testing](PLUGIN-TESTING.md): verify a local plugin build in Claude Code or Codex.
