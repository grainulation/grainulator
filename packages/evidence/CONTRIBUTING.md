# Contributing to Wheat

Thanks for your interest in contributing to wheat.

## Getting started

```bash
git clone https://github.com/grainulation/wheat.git
cd wheat
npm test
```

## Filing issues

- Search existing issues before opening a new one
- Include steps to reproduce for bugs
- For feature requests, describe the use case and expected behavior

## Pull requests

1. Fork the repo and create a branch from `main`
2. Add tests if you're adding functionality
3. Make sure `npm test` passes
4. Keep PRs focused -- one change per PR

## Development

Wheat is zero-dependency (Node built-in modules only). Do not add external dependencies.

```bash
npm test              # Run all tests
node compiler/wheat-compiler.js --summary   # Test the compiler
```

## Code style

- No external dependencies
- No emojis in output or UI
- Self-contained HTML artifacts (inline CSS/JS, no CDN links)
- Exit codes: 0 = success, 1 = error/blocked

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
