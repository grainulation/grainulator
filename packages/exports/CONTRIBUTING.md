# Contributing to Mill

Thanks for considering contributing. Mill is the format and export engine for the grainulation ecosystem -- it transforms structured claim data into multiple output formats.

## Quick setup

```bash
git clone https://github.com/grainulation/mill.git
cd mill
node bin/mill.js --help
```

No `npm install` needed -- mill has zero dependencies.

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

### Add a format or exporter

Formats live in `lib/formats/` and exporters in `lib/publishers/`. To add one:

1. Create your module in the appropriate directory
2. Follow the pattern of existing formats/exporters
3. Register it in `lib/formats.js` or the relevant index
4. Add a test in `test/`

## Architecture

```
bin/mill.js               CLI entrypoint -- dispatches subcommands
lib/index.js              Core library -- format resolution and pipeline
lib/formats.js            Format registry and selection
lib/formats/              Individual format implementations
lib/exporters/            Output target adapters (file, clipboard, etc.)
lib/publishers/           Publishing integrations
lib/json-ld-common.js     Shared JSON-LD vocabulary helpers
lib/serve-mcp.js          MCP (Model Context Protocol) server
lib/server.js             Local preview server (SSE, zero deps)
public/                   Web UI -- format preview and conversion
site/                     Public website (mill.grainulation.com)
test/                     Node built-in test runner tests
```

The key architectural principle: **mill is a pipeline.** Data flows in as structured claims, passes through a format transform, and exits as the target format. Each format is a pure function: data in, string out.

## Code style

- Zero dependencies. If you need something, write it or use Node built-ins.
- No transpilation. Ship what you write.
- ESM imports (`import`/`export`). Node 20+ required.
- Keep functions small. If a function needs a scroll, split it.
- No emojis in code, CLI output, or generated formats.

## Testing

```bash
node test/basic.test.js
```

Tests use Node's built-in test runner. No test framework dependencies.

## Commit messages

Follow the existing pattern:

```
mill: <what changed>
```

Examples:

```
mill: add JSON-LD export format
mill: fix Markdown table alignment in brief output
mill: update MCP server protocol handling
```

## License

MIT. See LICENSE for details.
