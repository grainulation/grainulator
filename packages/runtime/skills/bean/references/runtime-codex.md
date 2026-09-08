# Reference: runtime-codex

How the convergence loop runs on Codex. bean is invoked explicitly as `/bean`
(`agents/openai.yaml` sets `allow_implicit_invocation: false`), so it runs only when asked.

Codex has two supported modes. Name which one you are using when a `/bean` run starts.

## Mode 1: installed runtime (enforced)

This is the full bean 2.0 path. `./install.sh` builds the static runtime binaries into
`bin/`, copies the skill into `~/.codex/skills/bean`, and registers `bean-hook` in
`~/.codex/hooks.json`.

In this mode:

- `.bean/claims.json` is the durable claim ledger.
- `bean-check --dir <project> --json` is the compiler/gate.
- `bean-verify` is the only path that executes declared oracles.
- `bean-hook` is inert until a project has `.bean/claims.json`; once active, it blocks a
  Codex Stop event until `bean-check` returns `ready`, `converged-with-residuals`, or
  `budget-exceeded`.
- The runtime is local. bean itself adds no network calls or telemetry.

Use this mode whenever the binaries are available. It is the only Codex mode with a hard
stop-condition.

## Mode 2: plugin-only skill (advisory)

Installing only the Codex plugin gives Codex the `/bean` skill and these instructions. It
does not by itself guarantee that the native binaries are present or that the Stop hook is
registered. In that case, keep the same loop discipline, but say explicitly that the run is
advisory until the runtime is installed.

If `bean-check` cannot run and no installed runtime is available, fall back to the
hand-checked `bean-stalk.md` table from [runtime.md](runtime.md). This is the weakest
guarantee and must be stated in the output.

## Survey (step 1)

- Identify the active control plane: installed runtime, plugin-only advisory, or
  hand-checked fallback.
- Check installed Codex plugins/skills; compose an existing one before hand-rolling.
- Check whether subagent tooling is available in the current Codex surface. Do not assume
  nested `codex exec` is allowed; managed sandboxes can block its network transport even
  when local file tools work.
- Read whatever sources the environment exposes (repo, files, configured tools) before
  recording a claim.

## Investigate / delegate (step 2)

- Prefer the runtime's existing agent/delegation tools when available.
- Use `codex exec` lanes only when the environment permits nested Codex calls. If it is
  blocked, record that as a residual or use the parent Codex session directly; do not
  silently substitute a different model.
- For file-mutating parallel work, give each lane an isolated working area (for example,
  a git worktree) so lanes do not collide; merge sequentially.
- Brief each lane per [delegate.md](delegate.md).

## Record / compile / revise (steps 3-5)

Installed runtime:

- Maintain `.bean/claims.json` and optional `.bean/run.json`.
- Run `bean-check --dir <project> --json` each round.
- Use `bean-verify` for declared strict/advisory oracle verdicts.
- Revise by superseding: mark the old claim inactive/superseded, link the new one, and
  record the reason.

Fallback:

- Maintain `bean-stalk.md`.
- Hand-run the checks from [runtime.md](runtime.md): conflicts, coverage gaps,
  single-source topics, weak evidence, and whether the round moved an open front.
- State that this path has no automatic certificate or Stop-hook enforcement.

## Independent check

The blindspot lane on Codex should be a fresh context that did not form the belief, or a
different model when one is authenticated and available. It judges the raw artifact,
reports disagreements, and its verdict is recorded as evidence. See
[codex-blindspot.md](codex-blindspot.md).

If `claude -p` or another cross-family checker is unauthenticated, tag the cross-family
check as blocked rather than replacing it silently.

## Codex portability checklist

- `/bean` is explicit-only on Codex.
- Full enforcement requires `bean-check` and `bean-hook`, not just the plugin manifest.
- `~/.codex/hooks.json` must contain a Stop hook that runs the installed `bean-hook`.
- A project without `.bean/claims.json` must not be affected by the hook.
- A project with `.bean/claims.json` must fail closed if `bean-check` cannot run.
