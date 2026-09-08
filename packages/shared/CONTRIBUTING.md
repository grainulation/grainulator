# Contributing to Barn

Thanks for considering contributing. Barn is the template engine for the grainulation ecosystem -- it turns structured data into polished HTML artifacts.

## Quick setup

```bash
git clone https://github.com/grainulation/barn.git
cd barn
node bin/barn.js --help
```

No `npm install` needed -- barn has zero dependencies.

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

### Add a template

Templates live in `templates/`. Each template is a pair: an HTML file and a JSON schema file. To add one:

1. Create `templates/your-template.html` and `templates/your-template.json`
2. Follow the pattern of existing templates (use `template.schema.json` as the base schema)
3. Ensure the HTML is self-contained (inline CSS/JS, no external dependencies)
4. Add it to the README templates table

## Architecture

```
bin/barn.js           CLI entrypoint -- dispatches subcommands
lib/index.js          Core library -- template resolution and rendering
lib/server.js         Local preview server (SSE, zero deps)
templates/            HTML + JSON schema pairs for each artifact type
public/               Web UI -- two-column template nav + preview
site/                 Public website (barn.grainulation.com)
tools/                Utility scripts
test/                 Node built-in test runner tests
```

The key architectural principle: **templates are self-contained HTML with inline CSS/JS.** No external dependencies, no build step, no CDN links.

## Code style

- Zero dependencies. If you need something, write it or use Node built-ins.
- No transpilation. Ship what you write.
- ESM imports (`import`/`export`). Node 20+ required.
- Keep functions small. If a function needs a scroll, split it.
- No emojis in code, CLI output, or templates.

## Testing

```bash
node test/basic.test.js
```

Tests use Node's built-in test runner. No test framework dependencies.

## Commit messages

Follow the existing pattern:

```
barn: <what changed>
```

Examples:

```
barn: add postmortem template
barn: fix server SSE reconnection
barn: update schema validation for nested fields
```

## License

MIT. See LICENSE for details.
