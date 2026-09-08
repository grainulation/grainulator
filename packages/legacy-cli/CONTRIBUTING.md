# Contributing to Grainulation

Thanks for considering contributing. Grainulation is the meta-package and ecosystem router -- it orchestrates all grainulation tools and provides the unified CLI entry point.

## Quick setup

```bash
git clone https://github.com/grainulation/grainulation.git
cd grainulation
node bin/grainulation.js --help
```

No `npm install` needed -- grainulation has zero dependencies.

## How to contribute

### Report a bug

Open an issue with:

- What you expected
- What happened instead
- Your Node version (`node --version`)
- Steps to reproduce

### Suggest a feature

Open an issue describing the use case, not just the solution. "I need X because Y" is more useful than "add X."

### Submit a PR

1. Fork the repo
2. Create a branch (`git checkout -b fix/description`)
3. Make your changes
4. Run the tests: `node test/basic.test.js`
5. Commit with a clear message
6. Open a PR

## Architecture

```
bin/grainulation.js       CLI entrypoint -- routes to individual tools
lib/router.js             Command routing to the correct tool package
lib/ecosystem.js          Ecosystem health checks and tool discovery
lib/doctor.js             Diagnostic tool -- validates tool installations
lib/setup.js              First-run setup and configuration
lib/pm.js                 Package management for grainulation tools
lib/server.mjs            Local server -- unified ecosystem dashboard (ESM)
public/                   Web UI -- ecosystem overview and status
site/                     Public website (grainulation.com)
test/                     Node built-in test runner tests
```

The key architectural principle: **grainulation is a thin router, not a monolith.** It delegates to individual tool packages (wheat, barn, etc.) and provides ecosystem-level concerns: discovery, health checks, scaffolding. Each tool remains independently usable.

## Code style

- Zero dependencies. If you need something, write it or use Node built-ins.
- No transpilation. Ship what you write.
- ESM imports (`import`/`export`). Node 20+ required.
- Keep functions small. If a function needs a scroll, split it.
- No emojis in code, CLI output, or UI.

## Testing

```bash
node test/basic.test.js
```

Tests use Node's built-in test runner. No test framework dependencies.

## Commit messages

Follow the existing pattern:

```
grainulation: <what changed>
```

Examples:

```
grainulation: add doctor diagnostic for missing tools
grainulation: fix router fallback for uninstalled packages
grainulation: update scaffold to include CLAUDE.md template
```

## License

MIT. See LICENSE for details.
