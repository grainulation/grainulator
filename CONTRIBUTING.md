# Contributing to Grainulator

Grainulator provides evidence, memory, exports, and portable workflows through a CLI and one MCP server. Use it with any compatible host; Claude Code and Codex also have native plugin integrations. Source and identified release archives are distributed through GitHub; publication follows the reviewed release workflow. The root npm package and component workspaces are private, so a GitHub release does not publish them to npm.

## Getting started

Use Node.js 24 or 26 LTS; Node 24 is the development default in `.nvmrc` and `.node-version`.

```sh
git clone https://github.com/grainulation/grainulator.git
cd grainulator
npm ci --ignore-scripts
node bin/grainulator.js doctor
npm test
```

For a direct MCP connection, `node bin/grainulator.js connect --dir /absolute/path/to/project` prints configuration without changing host settings. For a local Claude plugin check, use the tested invocation:

```sh
claude --plugin-dir /absolute/path/to/grainulator
```

For native Codex, install the intended local plugin through its marketplace mechanism, run `node /path/to/installed/grainulator/bin/grainulator.js setup --dir /absolute/path/to/project`, and restart Codex. `GRAINULATOR_WORKSPACE=/absolute/path/to/project codex` overrides the saved default for one launch. Follow [plugin acceptance](docs/PLUGIN-TESTING.md) for installation, workspace binding, exact build verification, and actual host/subagent tool checks. Direct MCP success does not prove full plugin discovery.

## Filing issues

- Include reproduction steps, expected and observed behavior, Node and host versions, and the source revision or installed build ID.
- Include relevant redacted tool errors or traces. Remove credentials and private task content before sharing.
- For feature requests, describe the user task and the limitation of the current workflow.

## Pull requests

1. Create a focused branch from `main` and preserve existing user data and compatibility boundaries.
2. Update the relevant instructions when commands or behavior change. Add meaningful regression coverage for changed functionality.
3. Run `npm test` and `npm run lint`, plus the checks relevant to your change. Use `npx biome format --write <changed-files>` for files covered by the repository's Biome configuration.
4. After the final shipped-file edit, run `npm run build:identity` and include the updated `build-info.json` in the commit. Regenerate it if any packaged file changes again; CI checks that its file checksums match.
5. Describe the problem, resulting behavior, checks actually run, and remaining limits. Do not report older test results as verification of newer edits.

See [TypeScript development](docs/TYPESCRIPT.md) for canonical sources, strict checking and generated runtime JavaScript.

## Verification and CI

CI runs `npm test`, `npm run check:package`, and `npm run test:install` on Node 24 and 26. Separate jobs run lint, Rust runtime conformance, static analysis and dependency checks. Installed-package acceptance exercises CLI/MCP and headless research without a browser.

```sh
npm run lint
npm run test:install
npm run test:runtime
npm run typecheck
npm run check:types
npm run test:distribution
npm run check:surface
```

Rust/Cargo is required for runtime conformance. Routine checks use local fixtures and make no paid-provider calls. Native-host and live-provider acceptance remain separate from CLI/MCP tests; see [verification scope](docs/READINESS.md) and [packaging](docs/DEPLOYMENT.md).

## Skills and exports

Skills live in `skills/<name>/SKILL.md`, with YAML metadata and a portable Markdown workflow. Every directory under `skills/` must contain a real skill. Declare only needed tools; distinguish direct and host-prefixed MCP names where the host requires an allowlist.

Briefs and analytics reports use Markdown. JSON and Markdown exports preserve evidence for external rendering tools; this repository does not maintain presentation templates or browser rendering.

## Distribution and migration checks

The [release guide](docs/RELEASING.md) covers frozen base/native candidates, the
separate offline converter, manifest trust. Homebrew formula generation and installation acceptance belong to the separate tap repository.
The v3 normal archive exposes one product CLI; it does not preserve old component
binaries or automatically convert user data. Keep signed history and source
provenance intact. Use isolated fixtures for conversion, rollback and hook tests;
never test a migration against a contributor's active data or host settings.

## Version preparation

Prepare a version change without automatically creating a Git commit or tag:

```sh
npm version <patch|minor|major> --no-git-tag-version
```

The version lifecycle synchronizes and stages `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, and root `plugin.json`. Review those changes alongside `package.json` and `package-lock.json`, regenerate identity after all shipped-file edits, then commit through the normal review flow. `npm run sync-version` alone updates manifest contents without staging them. Create a release tag only after required CI passes and the release is authorized. Npm publication is a separate action; the packages remain private.

The committed release identity uses `release-<version>-<hash>` and travels with tagged source, marketplace installations, and `npm pack --ignore-scripts` archives. `npm run pack:local` instead stages a unique local prerelease without changing the checkout version. Doctor checks packaged file integrity in both cases; keep host security wrappers intact.

## Security and conduct

See [SECURITY.md](SECURITY.md) for private disclosure and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.
