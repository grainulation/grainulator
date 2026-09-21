# Install Grainulator

For Claude Code or Codex, start with [agent setup](AGENT-SETUP.md). The steps below cover the source release and local archive. You do not need to install Grainulator's components one by one.

Already using 1.x? Start with the [upgrade checklist](UPGRADING.md). Updating source or a marketplace catalog does not update an installed plugin, its host scope, or a running conversation.

## Obtain the v2.0.2 GitHub release

Use Node.js 24 or later. Get the tagged source from the [v2.0.2 GitHub release](https://github.com/grainulation/grainulator/releases/tag/v2.0.2). This version is not published to npm, so an npm registry install will not give you this release. The [local setup page](../site/install.html) shows the same source and archive steps.

Tagged releases and marketplace builds include `build-info.json`, an integrity manifest with an ID such as `release-2.0.2-<hash>`. Doctor checks its shipped-file checksums. A standard `npm pack --ignore-scripts` archive preserves that identity; `pack:local` below creates a distinct development build.

Clone the release tag and install its source dependencies:

```sh
git clone --branch v2.0.2 https://github.com/grainulation/grainulator.git
cd grainulator
npm ci --ignore-scripts
node bin/grainulator.js doctor
node bin/grainulator.js preview
```

Open http://127.0.0.1:4517/playground/ and import the session you exported. Enter a provider key locally or configure `OPENAI_API_KEY` / `OPENROUTER_API_KEY` in the preview server's environment.

## Install an identified local archive

From the full source checkout, create an archive with a build identity:

```sh
npm run pack:local
```

This creates a local version such as `2.0.2-local.<16-character-hash>` without publishing it. The command prints the archive path and build details. Copy the exact archive path it prints.

In a new, empty consumer directory, replace `<archive>` below with that exact printed path:

```sh
npm init -y
npm install --offline --ignore-scripts "<archive>"
node node_modules/@grainulation/grainulator/bin/grainulator.js doctor --json
```

Confirm `build.id` and `build.version` match the report and `build.verified` is `true`. The installed `build-info.json` records packaged file checksums; doctor checks those files instead of relying on the package version alone. Then start the installed preview:

```sh
node node_modules/@grainulation/grainulator/bin/grainulator.js preview
```

These commands do not install global tools. Resume exported research through the local playground, or run the installed CLI with `research --session /path/to/session.json --dir ./continued-session` using a new output directory.

## Activate updates in the copy you use

The source checkout, an npm consumer installation, and a host's plugin cache are separate copies. Editing source does not update either installed copy or a running process.

For an existing local CLI installation, stop its preview or CLI process, install the newly printed archive path from that consumer directory, verify its build ID with doctor, and restart it. For a plugin, reinstall the intended local artifact through the host's local plugin mechanism, reload the plugin, and start a fresh test session. Verify the actual loaded cache, including skills, agents, and hooks; a direct MCP test does not exercise the full plugin.

The bundled Claude marketplace entry does not pin your local artifact. Use the `v2.0.2` tagged checkout or an identified archive for release testing, and verify the loaded build. Follow the [fresh full-plugin acceptance guide](PLUGIN-TESTING.md) for the local installation and cache checks. Existing user sessions and global configuration are not automatically changed by packing or installing a CLI archive.

For an authenticated compatible endpoint, configure a local environment variable such as `MODEL_API_KEY` and append `--api-key-env MODEL_API_KEY` to the research command. Pass the variable name, never the secret itself. Custom endpoints do not inherit OpenAI or OpenRouter environment keys, and credential fields are excluded from exports. The playground shows this handoff note when Compatible endpoint is selected.

## Bind the native Codex plugin to a workspace

After installing the intended plugin, save an existing absolute project directory with the CLI from that same build:

```sh
node /absolute/path/to/grainulator/bin/grainulator.js setup --dir /absolute/path/to/project
```

Then restart Codex, including Codex Desktop. Grainulator saves this default in `~/.config/grainulator/workspace.json`; it does not edit the host's MCP settings or security wrapper. The saved default applies to native Codex sessions started by this user, so choose the directory deliberately. Its sprint directories must remain within that workspace. Run setup again to change the default, then restart affected hosts. An absolute `GRAINULATOR_CONFIG` file path can select a separate Grainulator configuration.

For a different workspace on a single launch, override the saved default:

```sh
GRAINULATOR_WORKSPACE=/absolute/path/to/project codex
```

The same environment binding applies to `codex exec ...`. Codex starts the native server from its plugin cache; Grainulator uses the explicit environment override or saved default to keep tool access scoped to your project. Missing or invalid configuration allows plugin discovery but returns a configuration-required error on tool calls, without writing data.

The persistent setup works without launching Codex Desktop from a terminal. If you use an environment override, it must be available to the actual app process; a terminal export does not update an already running app. You can also use a direct MCP connection:

```sh
node /absolute/path/to/grainulator/bin/grainulator.js connect --dir /absolute/path/to/project
```

Register the printed command and arguments in the host's MCP configuration for the authorized scope. This command only prints configuration; it does not install it. The explicit `--dir` binds direct MCP access without `GRAINULATOR_WORKSPACE`. Direct MCP access does not load or verify the plugin's bundled skills, agents, or hooks. Confirm a real status call against your intended sprint after setup. Claude's plugin registration remains automatic and does not require this Codex-specific workspace variable. See [full-plugin checks](PLUGIN-TESTING.md) for installation and verification details.

## Check a local installation

Run `node bin/grainulator.js doctor` from the release folder. If you built a local archive, run `doctor` from the installed copy so you check the files you will actually use. Maintainers can run `npm run test:install` for the full package test. See [release checks](READINESS.md) for test results and limits.
