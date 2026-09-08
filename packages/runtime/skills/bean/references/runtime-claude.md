# Reference: runtime-claude

How the convergence loop runs on Claude Code.

## Runtime

- **Primary:** grainulator/wheat, if present — the full ledger + compiler. See
  [grainulation.md](grainulation.md). This is the preferred runtime on Claude Code.
- **Fallback:** the minimal built-in `bean-stalk.md` with hand-run compile checks, if
  grainulator isn't connected. See [runtime.md](runtime.md). Say which one you're on.

## Survey (step 1)

- **Skills:** the available-skills list in context names what's loaded; invoke one with
  the `Skill` tool. Compose an existing skill before hand-rolling a round's investigation.
- **Delegation:** the `Agent` tool; multiple independent agents in one message run
  concurrently.
- **Connectors:** enumerate the reachable MCP servers surfaced this session and read real
  data for grounding.

## Investigate / delegate (step 2)

- Fan out the round's open front with parallel `Agent` calls in a single message.
- For research fronts on grainulator, dispatch the `grainulator:grainulator` autoresearch
  subagent — it records evidence-tiered claims as it goes.
- Brief each agent per the contract in [delegate.md](delegate.md).

## Record / compile / revise (steps 3-5)

- Run real checks with `Bash` (tests, scripts, parsers, diffs) to earn evidence tiers.
- On grainulator: `wheat add` / `wheat compile` / `wheat resolve`. On the fallback: edit
  `bean-stalk.md` and hand-run the checks in [runtime.md](runtime.md).
- For the independent cross-model check, shell out to `codex exec` per [codex-blindspot.md](codex-blindspot.md).

## Plan mode

For a non-trivial implementation, run the Frame step (and the first survey) inside plan
mode and get sign-off before the loop starts mutating things.
