# Contributing to Harvest

Thanks for considering contributing. Harvest is the retrospective and analytics engine for the grainulation ecosystem -- it turns sprint history into insights and calibration data.

## Quick setup

```bash
git clone https://github.com/grainulation/harvest.git
cd harvest
node bin/harvest.js --help
```

No `npm install` needed -- harvest has zero dependencies.

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
4. Run the tests: `node --test test/basic.test.js`
5. Commit with a clear message
6. Open a PR

## Architecture

```
bin/harvest.js            CLI entrypoint -- dispatches subcommands
lib/analyzer.js           Sprint data analysis and pattern detection
lib/calibration.js        Prediction vs outcome scoring
lib/decay.js              Claim staleness and evidence decay
lib/patterns.js           Recurring pattern extraction
lib/report.js             Report generation from analyzed data
lib/server.js             Local preview server (SSE, zero deps)
lib/templates.js          Template rendering for HTML output
lib/velocity.js           Sprint velocity tracking
templates/                HTML templates (retrospective, etc.)
public/                   Web UI -- retrospective dashboard
site/                     Public website (harvest.grainulation.com)
test/                     Node built-in test runner tests
```

The key architectural principle: **harvest reads sprint artifacts (claims, compilations, git history) and produces calibrated insights.** It never modifies source data -- read-only analysis, write-only reports.

## Code style

- Zero dependencies. If you need something, write it or use Node built-ins.
- No transpilation. Ship what you write.
- ESM imports (`import`/`export`). Node 18+ required.
- Keep functions small. If a function needs a scroll, split it.
- No emojis in code, CLI output, or reports.

## Testing

```bash
node --test test/basic.test.js
```

Tests use Node's built-in test runner. No test framework dependencies.

## Commit messages

Follow the existing pattern:

```
harvest: <what changed>
```

Examples:

```
harvest: add velocity trend chart
harvest: fix decay calculation for stale claims
harvest: update calibration scoring algorithm
```

## License

MIT. See LICENSE for details.
