# Research playground and portable sessions

Start `npm run dev`, then open http://127.0.0.1:4517/playground/. The playground uses a static background, the mascot wordmark, and a home link in the top-right corner. The older `/research.html` and `/playground.html`, shared-question links, and `?offline=1` links lead here too.

Choose a provider and exact model ID. OpenAI uses the Responses API (default `gpt-6-astra`, low reasoning), with optional web search. OpenRouter uses Chat Completions, including current model discovery; the initial suggestion is `anthropic/claude-fable-5.1`. Compatible endpoints use Chat Completions and provider-default reasoning. Enter a local URL such as `http://127.0.0.1:11434/v1` and the model name actually served there.

These model IDs were checked against the official OpenAI docs and the OpenRouter catalog on September 7, 2026. They are selectable starting points, not a benchmark claim. Account/model availability can differ. Sources: [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Responses web search](https://developers.openai.com/api/docs/guides/tools-web-search), [OpenRouter catalog](https://openrouter.ai/api/v1/models), [OpenRouter quickstart](https://openrouter.ai/docs/quickstart).

The connection uses an API key entered in the password field or a local-server `OPENAI_API_KEY` / `OPENROUTER_API_KEY`. Keys are never included as configuration fields in exports. Custom endpoints cannot inherit the server's provider environment keys. Calls use the chosen account and its billing. Pass, retry, output-token, and timeout controls are not a dollar spending cap.

## Configure and run

The same configuration drives the browser and CLI: question, supplied context, additional instructions, provider, model, optional endpoint, reasoning effort, web search, challenge pass, output budget, timeout, and retry limit. Research and synthesis are always included; challenge is optional. Each pass streams visible text and records the provider-returned model, token usage when available, and citation URLs. There are no timed claim animations or synthetic confidence scores.

No web-search tool is enabled for OpenRouter/custom connections in this increment. Those modes use provided context and model knowledge. Provider-returned citations are shown as links but are not automatically promoted to independently verified evidence. Browser output is text, so model HTML/scripts cannot execute.

A failed, cancelled, or truncated pass never becomes a completed checkpoint. Completed passes remain available for export and continuation. Changing the question, context, or configuration starts a fresh run. An imported transcript whose settings no longer match its recorded settings is rejected.

## Continue the actual session

Download `session.json` from the playground. From this checkout:

```sh
node bin/grainulator.js research --session /path/to/session.json --dir ./research-session
```

The target directory must be new. The CLI validates the file, reuses completed passes, executes only the remaining passes, and checkpoints `session.json` and `SESSION.md` locally. It reads the same provider environment keys as the preview. For a custom endpoint requiring authentication, add `--api-key-env YOUR_KEY_VARIABLE` explicitly. It never executes commands supplied in a session file.

Use `--restart` to rerun all passes. Use `--prepare-only` to create the session files without making model calls. `SESSION.md` can be opened in an agent; the handoff carries the question, context, findings, sources, and complete configuration, while the host still controls its own model and permissions. The playground's Export brief and Copy handoff prompt provide the same artifact.

Session exports exclude the credential fields, not sensitive material you deliberately include in research text. No browser storage is used: export before refreshing or closing the page. Imported sessions clear entered keys.

## Validation and boundaries

`npm run test:core` includes serialization, credential isolation, configuration matching, Unicode streaming, source extraction, incomplete-stream handling, cancellation, cross-origin proxy rejection, and a real CLI continuation against a local fixture provider. `scripts/playground-check.mjs` checks model settings, downloads, reimport, partial resume, navigation, and four responsive widths. `npm run test:site` requires the preview server and an available Playwright Chromium installation. `node scripts/static-site-check.mjs` separately builds and serves the final artifacts with Python’s ordinary static HTTP server, then verifies clean and legacy routes, zero public API requests, configuration export/reimport, local handoff instructions, and responsive navigation.

The local API is available only through the loopback preview server and checks browser origins before accepting model requests. The generated static artifact explicitly enters configuration mode: it does not probe an API, accept keys, or start model passes. It supports example sessions, configuration, and import/export. Expand “Run this setup locally” for the exact preview and CLI commands. The static server needs no application rewrites because `/playground/` is a directory index; old `.html` links redirect while preserving question hashes and query parameters. See [DEPLOYMENT.md](DEPLOYMENT.md) for artifact checks and the hosting boundary.

Live paid-provider execution has not been verified in this environment because no OpenAI or OpenRouter key is configured. Transport contracts are covered with simulated provider streams and a real local HTTP provider. A controlled model-quality comparison remains separate work.

## Grainulator feature controls

The feature section sits above the model connection. Each control includes a keyboard-accessible explanation, and the workflow shows the selected pass count before running:

- **Challenge findings:** one optional review pass, on by default.
- **Find blind spots:** one optional gap-analysis pass.
- **Build a claims ledger:** one optional extraction pass after reviews. Validates 1–24 typed claims, IDs, source lists, and explicit conflict references. Malformed output fails that pass and can be retried without repeating completed research.
- **Gate the brief on evidence:** a deterministic check before synthesis, requiring the ledger. Stops if no factual claims were extracted, a factual claim lacks a source URL, or an explicit conflict remains. It adds no provider call. With the gate off, ledger issues are still visible and synthesis may proceed.

Research and synthesis are the base workflow. Optional passes run in this order: challenge, blind spots, claims ledger. Additional passes cost time and tokens; the defaults retain the original three-pass workflow. The offline example shows a blocked gate using explicitly illustrative material.

The gate checks the model-extracted ledger. It does not establish completeness, detect every semantic contradiction, fetch URLs, or verify source truth. Claim classification and conflict identification still depend on the selected model. All exported claims are assigned `stated`, even if the model tries to assign a stronger tier. This playground gate is a source-link/conflict policy; the evidence compiler separately checks its own schema and readiness rules.

Export claims downloads `claims.json` in the existing evidence schema. The CLI writes this file and runs the actual evidence compiler to produce `compilation.json` whenever a ledger checkpoint exists. A blocked gate remains blocked after import or CLI continuation; changing context/settings or using Run again creates a fresh run. Older playground exports without these new settings remain importable with the new features off.

Persistent cross-session memory, orchestration across research sprints, and host tool enforcement remain available through the corresponding CLI/MCP workflows; this page does not present switches for those integrations until they can run here.

Session JSON export and browser/CLI file import share an 8 MiB limit. Provider request and context limits are separate; a portable session does not guarantee that every provider can consume its whole transcript.
