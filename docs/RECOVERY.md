# Session recovery

The research CLI writes `session.json` atomically after each completed pass. `SESSION.md` carries the readable handoff. Stop with Ctrl-C; a partially streamed answer is not recorded as a completed pass. Exported sessions describe the remaining work as `partial`, even when the CLI reports that the current process was cancelled.

Resume into a new directory:

```sh
grainulator research --session ./stopped/session.json --dir ./continued-session
```

The CLI preserves the source checkpoint and reuses its completed passes. It refuses an existing destination before calling a provider. Changing the question or configuration requires a fresh session; `--restart` deliberately repeats the investigation. API credential fields are excluded from JSON and Markdown exports. Research text itself may contain sensitive material and should be reviewed before sharing.

The atomic checkpoint protects the completed session JSON. It is not a transaction across JSON, Markdown, and compiled evidence files, and a terminated machine cannot preserve output that has not reached a checkpoint. Resume from the last valid JSON into a new directory to rebuild derived artifacts.

## Local CLI interruption acceptance

The acceptance commands below are maintainer checks run from the full source checkout, where `scripts/` and test dependencies are available. They are not installed-package commands. Installed users can exercise recovery with the `grainulator research` command above.

```sh
node scripts/session-recovery-check.mjs
```

This starts a real local HTTP provider fixture, runs the actual CLI, sends SIGINT while synthesis is streaming, and resumes its exported checkpoint in another CLI process. It checks that research is called once, synthesis is retried once, unfinished deltas are discarded, source and existing output files are preserved, and credential fields are not exported. The same regression runs in `test/dogfood/session-recovery.test.mjs`.

Set `GRAINULATOR_TEST_CLI` to an installed artifact's `bin/grainulator.js` to test that distribution instead of the checkout. Results are written to `.dogfood/session-recovery-audit.json` by the standalone command.

## Native host interruption acceptance

```sh
node scripts/host-recovery-check.mjs
# Or choose one host: codex | claude
```

This requires authenticated native CLI accounts and a passing local `test:install` artifact. It creates its own disposable session, records a synthetic claim with the installed Grainulator MCP server, then interrupts a pending fixture tool in that session. It resumes the same session through the host's normal continuation command and checks an actual MCP retrieval of the unchanged claim. It does not attach to existing user conversations, bypass active-writer protection, or modify global host settings. Results are `.dogfood/host-recovery-audit.json`; individual host logs are local audit artifacts.

This covers the installed CLI versions and tested tool interruption. It is not a guarantee of recovery for every host crash, model, tool, or native remote interface.

## Live provider acceptance

```sh
node scripts/provider-live-check.mjs openai
node scripts/provider-live-check.mjs openrouter
```

Configure the matching `OPENAI_API_KEY` or `OPENROUTER_API_KEY` in the process environment. Do not put it in a command argument or session file. Optional `GRAINULATOR_LIVE_MODEL` selects an exact provider model ID. Each successful check makes two model calls: one through the actual local research HTTP endpoint, then the remaining synthesis pass through the actual CLI after export/import. It verifies provider completion, unchanged prior work, and credential exclusion. Web search and retries are disabled; each pass has a 4,096 output-token limit and 120-second timeout. Provider billing still applies.

Missing credentials produce a `blocked` report and exit code 2 without making any request. Provider or continuation failures produce exit code 1. Success produces exit code 0. Reports are `.dogfood/provider-live-openai.json` and `.dogfood/provider-live-openrouter.json`; they contain model and pass metadata, not credentials. A successful transport check does not establish a model-quality improvement.
