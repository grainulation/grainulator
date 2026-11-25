# Install Grainulator

For Claude Code or Codex, start with [agent setup](AGENT-SETUP.md). The steps below cover the source release and local archive. You do not need to install Grainulator's components one by one.

Already using 1.x? Start with the [upgrade checklist](UPGRADING.md). Updating source or a marketplace catalog does not update an installed plugin, its host scope, or a running conversation.

## Install the CLI with Homebrew

The shared tap installs the portable CLI, its Node 24 dependency and the matching native runtime asset:

```sh
brew tap grainulation/homebrew https://github.com/grainulation/homebrew
brew install grainulation/homebrew/grainulator
grainulator doctor --json
grainulator demo
```

Check the [tap version table](https://github.com/grainulation/homebrew#available-formulae) for the current stable version. Use `brew upgrade grainulation/homebrew/grainulator` to update the formula. Uninstall with `brew uninstall grainulator`; your project data and separately enrolled required hooks are retained. Formula installation does not enroll a workspace or install an agent plugin. Continue with [agent setup](AGENT-SETUP.md) or [native enrollment](RUNTIME.md) for those operations.

## Install from tagged source

Use Node.js 24 or later. [GitHub releases](https://github.com/grainulation/grainulator/releases) distribute the portable CLI/plugin archive, separate native runtime archives and offline converter. The npm package and component workspaces remain private; do not use the npm registry to select this release. For Homebrew, check the [shared tap](https://github.com/grainulation/homebrew#available-formulae) for currently published formulas.

Compiled release archives include `build-info.json`, an integrity manifest with an ID such as `release-3.0.0-<hash>`. Doctor checks its shipped-file checksums. A standard `npm pack --ignore-scripts` archive preserves that identity; `pack:local` below creates a distinct development build.

Clone the release tag and install its source dependencies:

```sh
git clone --branch v3.1.0 https://github.com/grainulation/grainulator.git
cd grainulator
npm ci --ignore-scripts
npm run build
node bin/grainulator.js doctor
```

Use `node bin/grainulator.js research --question "Your question" --dir ./research-session --prepare-only` to create a portable session without provider access. See [CLI research](RESEARCH.md).

## Install an identified local archive

From the full source checkout, create an archive with a build identity:

```sh
npm run pack:local
```

This creates a local version such as `3.0.0-local.<16-character-hash>` without publishing it. The command prints the archive path and build details. Copy the exact archive path it prints.

In a new, empty consumer directory, replace `<archive>` below with that exact printed path:

```sh
npm init -y
npm install --offline --ignore-scripts "<archive>"
node node_modules/@grainulation/grainulator/bin/grainulator.js doctor --json
```

Confirm `build.id` and `build.version` match the report and `build.verified` is `true`. The installed `build-info.json` records packaged file checksums; doctor checks those files instead of relying on the package version alone. Prepare a headless research session with the installed CLI:

```sh
node node_modules/@grainulation/grainulator/bin/grainulator.js research --question "Your question" --dir ./research-session --prepare-only
```

These commands do not install global tools. Resume existing research by running the installed CLI with `research --session /path/to/session.json --dir ./continued-session` using a new output directory.

## Activate updates in the copy you use

The source checkout, an npm consumer installation, and a host's plugin cache are separate copies. Editing source does not update either installed copy or a running process.

For an existing local CLI installation, stop its CLI process, install the newly printed archive path from that consumer directory, verify its build ID with doctor, and restart it. For a plugin, reinstall the intended local artifact through the host's local plugin mechanism, reload the plugin, and start a fresh test session. Verify the actual loaded cache, including skills, agents, and hooks; a direct MCP test does not exercise the full plugin.

The bundled Claude marketplace entry does not pin your local artifact. Use the `v3.1.0` tagged checkout or an identified archive for release testing, and verify the loaded build. Follow the [fresh full-plugin acceptance guide](PLUGIN-TESTING.md) for the local installation and cache checks. Existing user sessions and global configuration are not automatically changed by packing or installing a CLI archive.

For an authenticated compatible endpoint, configure a local environment variable such as `MODEL_API_KEY` and append `--api-key-env MODEL_API_KEY` to the research command. Pass the variable name, never the secret itself. Custom endpoints do not inherit OpenAI or OpenRouter environment keys, and credential fields are excluded from exports.

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

## Homebrew and stable registration

The [shared tap repository](https://github.com/grainulation/homebrew) owns Homebrew formulas and installation/upgrade tests. Grainulator supplies immutable application and native runtime archives with a pinned release manifest. Formula updates use a separately reviewed change in the tap, populated from verified release assets; see the [manual update procedure](RELEASING.md#homebrew-distribution-boundary). No unpublished transfer tooling is required.

The shared tap is `grainulation/homebrew`. Its [installation guide](https://github.com/grainulation/homebrew#install) and version table identify the formulas currently available. Use the explicit repository URL when adding this tap. Homebrew owns package upgrades, not workspace enrollment or user memory. Its wrapper uses the tested Node 24 dependency and a stable `opt/bin/grainulator` launcher. `grainulator connect` uses that launcher when invoked through the explicit Homebrew wrapper; other channels can select `--launcher <absolute-path>` themselves. Register the printed literal command in the authorized host scope; connect changes no host settings.

The portable base includes evidence, memory, exports, analytics, orchestration and the JS adapter runner. Native convergence requires a separate verified target asset; ordinary commands do not download it or fall back to Cargo or PATH. Run `grainulator runtime --help` for explicit installation and enrollment.

`grainulator demo` writes to a new temporary workspace by default. Use `--dir` to retain a chosen writable demo workspace. It runs a synthetic offline protocol fixture, not a model-quality evaluation.
