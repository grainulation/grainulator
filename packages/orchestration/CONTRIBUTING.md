# Contributing to Orchard

Thanks for considering contributing. Orchard is the multi-sprint planner for the grainulation ecosystem -- it tracks dependencies, assignments, and timelines across concurrent sprints.

## Quick setup

```bash
git clone https://github.com/grainulation/orchard.git
cd orchard
node bin/orchard.js --help
```

No `npm install` needed -- orchard has zero dependencies.

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
bin/orchard.js            CLI entrypoint -- dispatches subcommands
lib/scanner.js            Auto-detects active sprints in a workspace
lib/planner.js            Sprint planning and scheduling logic
lib/tracker.js            Progress tracking across sprints
lib/dependencies.js       Cross-sprint dependency resolution
lib/conflicts.js          Conflict detection between parallel sprints
lib/assignments.js        Work assignment and load balancing
lib/timeline.js           Timeline generation and critical path
lib/sync.js               State synchronization across sprint repos
lib/export.js             Export planner data to various formats
lib/dashboard.js          Dashboard data aggregation
lib/server.js             Local preview server (SSE, zero deps)
templates/                HTML templates (orchard-dashboard, etc.)
public/                   Web UI -- multi-sprint planning dashboard
site/                     Public website (orchard.grainulation.com)
test/                     Node built-in test runner tests
```

The key architectural principle: **orchard operates above individual sprints.** It scans for active wheat sprints, detects dependencies and conflicts between them, and provides a unified planning view. It reads sprint data but never modifies it directly.

## Code style

- Zero dependencies. If you need something, write it or use Node built-ins.
- No transpilation. Ship what you write.
- ESM imports (`import`/`export`). Node 20+ required.
- Keep functions small. If a function needs a scroll, split it.
- No emojis in code, CLI output, or dashboards.

## Testing

```bash
node test/basic.test.js
```

Tests use Node's built-in test runner. No test framework dependencies.

## Commit messages

Follow the existing pattern:

```
orchard: <what changed>
```

Examples:

```
orchard: add cross-sprint dependency graph
orchard: fix timeline calculation for overlapping sprints
orchard: update scanner to detect archived sprints
```

## License

MIT. See LICENSE for details.
