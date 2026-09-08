# Reference: discover (survey)

Step 1 of every round. Fable's strength was learning the environment first and acting on
a grounded picture — and doing it _continuously_, not once at the start. Survey at the top
of each round, because what's relevant changes as the answer converges.

## What to survey, each round

1. **Skills.** What skills are loaded right now? Another skill may already do the round's
   investigation better than hand-rolling it (a review skill, a coverage skill, a research
   harness). Prefer composing an existing skill.
2. **Subagent / delegation tooling.** Agent tool, parallel `codex exec`, or nothing? This
   decides whether the round fans out or runs serially.
3. **Connectors and data sources.** List the MCP connectors and tools surfaced to you in
   this session — they appear in your available tool list and context notes (issue
   trackers, chat, docs, drives, design tools, error dashboards, the codebase). You can
   only see what the runtime exposed: inventory that, and confirm a connector works by
   using it. **Read any and all data you can access** that bears on the open front. Do not
   claim to have surveyed connectors the session never surfaced.

## Why every round, not once

The compiler tells you which front to investigate next (see [convergence.md](convergence.md)).
That front may need a tool the previous round didn't — a connector to corroborate a
single-source topic, a test runner to lift evidence from `stated` to `tested`. Re-survey
so each round's delegation targets the right capability instead of assuming last round's
inventory still fits.

## Ground, don't guess

If the open front depends on a fact you could look up — a ticket's acceptance criteria, the
real schema, the actual error rate — read it through an available connector before
recording a claim. If the source exists but you can't reach it, record the claim at its
honest (low) evidence tier and flag it, rather than inflating it to a guess.

## Output of this step

A short line each round: "Available: <skills>; delegation via <tool/none>; connectors:
<list>." Surfacing it is part of bean's verbose-by-default contract — see
[verbosity.md](verbosity.md). Delegation mechanics: [delegate.md](delegate.md).
