# Contributing to Grainulator

Grainulator provides evidence, memory, exports, and portable workflows through a CLI and one MCP server. Use it with any compatible host; Claude Code and Codex also have native plugin integrations. The v2.0.3 source is distributed through GitHub. The root npm package and component workspaces are private, so a GitHub release does not publish them to npm.

## Getting started

Use Node.js 24 or later; Node 25 is the development default in `.nvmrc` and `.node-version`.

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

## Verification and CI

CI runs `npm test`, `npm run build:site`, `npm run check:package`, and `npm run test:install` on Node 24 and 25. Separate jobs run lint, Rust runtime conformance, and the Playwright static-site check on Node 25. Browser tooling is a development dependency in this repository.

```sh
npm run lint
npm run test:install
npm run test:runtime
npx playwright install chromium
npm run test:static
```

Rust/Cargo is required for runtime conformance; Python 3 and Playwright Chromium are required for the static-site test. `npm run test:site` additionally exercises the local preview, playground, demo, scrolling, and organization site. Start `npm run dev` for the preview-dependent checks; see [deployment and browser checks](docs/DEPLOYMENT.md). Paid-provider and native-host tests require the relevant credentials and are separate from CI's static and synthetic checks.

## Skills and shared templates

Skills live in `skills/<name>/SKILL.md`, with YAML metadata and a portable Markdown workflow. Every directory under `skills/` must contain a real skill. Declare only needed tools; distinguish direct and host-prefixed MCP names where the host requires an allowlist.

Shared artifact templates live in root `templates/`, outside skill discovery. Claude can resolve `${CLAUDE_PLUGIN_ROOT}/templates/<file>`; other hosts resolve templates relative to the installed plugin or checkout. Preserve the documented accessibility shell when customizing artifacts.

## Version preparation

Prepare a version change without automatically creating a Git commit or tag:

```sh
npm version <patch|minor|major> --no-git-tag-version
```

The version lifecycle synchronizes and stages `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, and root `plugin.json`. Review those changes alongside `package.json` and `package-lock.json`, regenerate identity after all shipped-file edits, then commit through the normal review flow. `npm run sync-version` alone updates manifest contents without staging them. Create a release tag only after required CI passes and the release is authorized. Npm publication is a separate action; the packages remain private.

The committed release identity uses `release-<version>-<hash>` and travels with tagged source, marketplace installations, and `npm pack --ignore-scripts` archives. `npm run pack:local` instead stages a unique local prerelease without changing the checkout version. Doctor checks packaged file integrity in both cases; keep host security wrappers intact.

## Security and conduct

See [SECURITY.md](SECURITY.md) for private disclosure and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.
