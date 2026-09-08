# Installation contract

The root `@grainulation/grainulator` archive is the distribution boundary. Component workspaces are private implementation modules; retained package names and CLI commands are compatibility aliases. Install the root archive, not individual component tarballs.

## Obtain the v2.0.0 GitHub release

Use Node.js 24 or later; Node 25 is the dogfood default. Get the tagged source from the [v2.0.0 GitHub release](https://github.com/grainulation/grainulator/releases/tag/v2.0.0). This GitHub release is not published to npm; installing the currently released npm package does not select this version. The playground's [local setup page](../site/install.html) provides the same source and archive instructions.

Clone the release tag and install its source dependencies:

```sh
git clone --branch v2.0.0 https://github.com/grainulation/grainulator.git
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

This stages a version such as `2.0.0-local.<16-character-hash>` without changing the checkout's public version or publishing anything. The command prints `archive`, `id`, `version`, `source_sha256`, and `archive_sha256`; the same report is saved to `.dogfood/builds/latest.json`. Copy the full `archive` path from that report. Do not substitute an older same-version tarball.

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

The bundled Claude marketplace entry does not pin your local artifact. Use the `v2.0.0` tagged checkout or an identified archive for release testing, and verify the loaded build. Follow the [fresh full-plugin acceptance guide](PLUGIN-TESTING.md) for the local installation and cache checks. Existing user sessions and global configuration are not automatically changed by packing or installing a CLI archive.

For an authenticated compatible endpoint, configure a local environment variable such as `MODEL_API_KEY` and append `--api-key-env MODEL_API_KEY` to the research command. Pass the variable name, never the secret itself. Custom endpoints do not inherit OpenAI or OpenRouter environment keys, and credential fields are excluded from exports. The playground shows this handoff note when Compatible endpoint is selected.

## Bind the native Codex plugin to a workspace

After installing the intended local plugin, launch a fresh Codex process with an existing absolute project directory:

```sh
GRAINULATOR_WORKSPACE=/absolute/path/to/project codex
```

The same environment binding applies to `codex exec ...`. The project directory should contain your sprint directories. Codex starts the native server from its plugin cache; Grainulator uses this explicit binding to keep tool access scoped to your project. Missing binding allows plugin discovery but returns a configuration-required error on tool calls, without writing data.

For Codex Desktop, the variable must be available to the actual app process. A terminal export does not update an already running app. If that launch setup is unsuitable, use a direct MCP connection instead:

```sh
node /absolute/path/to/grainulator/bin/grainulator.js connect --dir /absolute/path/to/project
```

Register the printed command and arguments in the host's MCP configuration for the authorized scope. This command only prints configuration; it does not install it. The explicit `--dir` binds direct MCP access without `GRAINULATOR_WORKSPACE`. Direct MCP access does not load or verify the plugin's bundled skills, agents, or hooks. Confirm a real status call against your intended sprint after setup. Claude's plugin registration remains automatic and does not require this Codex-specific workspace variable. See [full-plugin checks](PLUGIN-TESTING.md) for installation and verification details.

## Distribution acceptance

Internal runtime imports use relative paths inside the archive. The root has no external runtime dependencies and does not depend on workspace symlinks or a sibling source checkout.

From this checkout, run `npm ci --ignore-scripts` and `npm run test:install`. Acceptance packs current files and installs into a temporary consumer, offline, with an empty npm cache and install scripts disabled. It exercises help, doctor, every component entry point, evidence init/add/compile, research preparation, and actual initialize/list/call exchanges with the unified Grainulator MCP server and retained legacy entry points. It also rejects retired commands and checks that retired application assets and hooks are absent.

Evidence is `.dogfood/package-isolation-audit.json`, including exact checks and artifact paths. Nothing is installed globally or published. Official Node 24.20.0 and Node 25.9.0 pass the same local checks. CI checks both supported Node versions; verify the result for the exact revision when testing further changes. Node 25 is the dogfood default and Node 24 is the minimum. Rust availability remains a separate doctor/conformance check. See [host evidence](HOSTS.md) and [release gates](READINESS.md).
