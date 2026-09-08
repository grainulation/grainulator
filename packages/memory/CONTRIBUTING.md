# Contributing to Silo

Thanks for considering contributing. Silo is the knowledge store for the grainulation ecosystem -- it indexes, searches, and manages claim packs across sprints.

## Quick setup

```bash
git clone https://github.com/grainulation/silo.git
cd silo
node bin/silo.js --help
```

No `npm install` needed -- silo has zero dependencies.

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

### Add a knowledge pack

Packs live in `packs/`. Each is a JSON file containing curated claims for a domain. To add one:

1. Create `packs/your-domain.json`
2. Follow the schema of existing packs (see `packs/architecture.json` for reference)
3. Include claims with proper typing and evidence tiers
4. Add a test case covering pack loading

## Architecture

```
bin/silo.js               CLI entrypoint -- dispatches subcommands
lib/index.js              Core library -- pack management and resolution
lib/store.js              Persistent claim storage engine
lib/search.js             Full-text and filtered claim search
lib/analytics.js          Usage analytics and pack statistics
lib/import-export.js      Bulk import/export of claim data
lib/packs.js              Knowledge pack loading and validation
lib/serve-mcp.js          MCP (Model Context Protocol) server
lib/server.js             Local preview server (SSE, zero deps)
lib/templates.js          Template rendering for HTML output
packs/                    Built-in knowledge packs (JSON)
public/                   Web UI -- search and browse interface
site/                     Public website (silo.grainulation.com)
test/                     Node built-in test runner tests
```

The key architectural principle: **silo is a content-addressable claim store.** Claims go in with typed metadata, and come out via search, pack membership, or direct ID lookup. The store is append-friendly and merge-safe.

## Code style

- Zero dependencies. If you need something, write it or use Node built-ins.
- No transpilation. Ship what you write.
- ESM imports (`import`/`export`). Node 20+ required.
- Keep functions small. If a function needs a scroll, split it.
- No emojis in code, CLI output, or pack data.

## Testing

```bash
node test/basic.test.js
```

Tests use Node's built-in test runner. No test framework dependencies.

## Commit messages

Follow the existing pattern:

```
silo: <what changed>
```

Examples:

```
silo: add security knowledge pack
silo: fix search ranking for multi-word queries
silo: update import to handle duplicate claim IDs
```

## License

MIT. See LICENSE for details.
