# Reference: codex-blindspot

The blindspot lane is an **independent, cross-model** review. A model checking its own
work shares its own blind spots; a different model, given the raw artifact and told to
look for problems, catches what self-review structurally cannot. This is the
architect-loop insight: judgment is most reliable when the judge did not produce the work
and is graded against the artifact, not the author's self-report.

Use it on the verify and self-critique steps for high-stakes work — anything expensive to
get wrong, or where a single check feels thin.

## Core rules

1. **Independent.** The reviewer judges the raw artifact (the diff, the file, the
   output), not your summary of it. Do not feed it your own conclusion to confirm.
2. **Bounded.** One clear review question, one output location.
3. **Evidence, not authority.** Read the reviewer's output and weigh it. A second model
   is another data point, not a verdict you must obey. Resolve disagreements explicitly:
   accept, reject, or modify, each with a one-line reason.

## Invocation (reuses the codex-review pattern)

For a pull request:

```bash
gh pr view <PR#> --json title,body,files
gh pr diff <PR#> | codex exec "Independently review this diff for correctness, missing
error paths, and spec violations. Report confirmed issues with file:line. Do not rewrite
the patch."
```

For a non-PR artifact (a file, a generated output):

```bash
codex exec "Review <path/to/artifact> for <bounded question>. Report confirmed issues,
stale claims, and exact fix recommendations. Do not edit source. End with REVIEW_DONE."
```

Prefer writing witness output under `review/<nn-slug>.md` and `review/<nn-slug>.json`,
and require a terminal marker (e.g. `REVIEW_DONE:<slug>`) so completion is detectable.

## Guardrails

- Do not ask multiple Codex sessions to write the same file.
- Do not ask Codex to patch production source during a read-only review.
- Point the reviewer at the **final artifact**, not at bean's reasoning narration. A clean
  trace and a correct deliverable are different things; judging the process invites a
  polished story over a working result. Give it the diff/file/output and ask what's wrong
  with _that_.
- If the Codex CLI is unavailable, fall back to an independent in-runtime subagent with a
  fresh context (see [delegate.md](delegate.md)) and say the cross-model lane was
  unavailable — don't silently skip it.

## On the Codex side

When bean runs _inside_ Codex (the native `/bean` skill), the blindspot lane is a
cross-model or fresh-context review in the other direction. See
[runtime-codex.md](runtime-codex.md).
