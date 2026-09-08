# Adapter contract v1

The dogfood runtime has a command adapter. It can wrap a model API client, a local model executable, or an existing agent. It executes an argv array directly, without a shell. Credentials stay in the command's normal environment; the runtime does not manage provider accounts.

Each invocation receives one JSON document on stdin:

```json
{"protocol":"grainulator.adapter.v1","runId":"uuid","round":1,"task":"Your task","feedback":null,"remainingRounds":2}
```

Write one response to stdout and diagnostic logs to stderr:

```json
{"answer":"The candidate result"}
```

The command runs inside the workspace selected by `--dir`. A coding-agent wrapper may edit that workspace using the host's existing permissions. The runner is not a sandbox or an approval service.

A verifier receives the same request plus `answer` and `answerHash`. Exit 0 means its declared check passed; any other exit means it failed. Output becomes feedback for the next attempt. Pick a verifier that actually measures your task (for coding, a script running relevant independent tests). A passing check does not establish facts outside that check's scope. Trace hashes identify an answer, not an attestation of all workspace files.

```sh
node bin/grainulator.js run \
  --dir /path/to/task-workspace \
  --task 'Implement the requested change and pass the independent regression tests' \
  --adapter /absolute/path/to/your-agent-wrapper \
  --adapter-args '[]' \
  --verify '["node","/absolute/path/to/verify-task.mjs"]' \
  --max-rounds 3 --timeout-ms 60000
```

No verifier produces `unverified` and exit 2. Repeated identical answers with identical failed feedback produce `stalled`; exhausting rounds produces `budget_exhausted`. Errors and cancellation have distinct states. Each command has a timeout and a bounded output buffer. The current budget covers rounds and per-command time; it does not cap provider spend or count tokens.

The existing evidence MCP tools can also attach to a host without using the runner. `grainulator connect --dir /path/to/sprint` prints a configuration using absolute local paths and changes no host settings. The server is `grainulator`; tools use names such as `add_claim`, `compile`, `memory_search`, and `exports_convert`. Old names are accepted only as compatibility aliases. The new `/grainulator` skill lives at `skills/grainulator/SKILL.md` and can be read as Markdown by any agent.

Model API transports and host lifecycle integrations remain separate contracts. This release includes a generic command boundary and the imported host adapters; it does not claim tested support for every model or host version.

## Plain-text commands

Use `--adapter-format text` for an existing CLI that reads a prompt from stdin and prints its answer to stdout. The runtime sends the task and previous verifier feedback as text. JSON mode remains the default for structured wrappers. Diagnostic logs must still go to stderr. This lets you exercise a real model without writing a JSON adapter.
