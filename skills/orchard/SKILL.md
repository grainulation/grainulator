---
name: orchard
description: Multi-sprint orchestration — view dependency graph, dispatch next ready sprint
tools:
  - Bash
  - Read
  - Glob
---

# /orchard -- Multi-sprint orchestration

View the sprint dependency graph, check sprint states, and dispatch the next ready sprint for execution.

## Arguments

$ARGUMENTS

## Instructions

### Step 1: Locate orchard.json

Search for `orchard.json` in these locations (in order):

1. Project root (current working directory)
2. `.wheat/` subdirectory

Use Glob to find it:

```
**/orchard.json
```

If found, read it and proceed to Step 2.

If NOT found, skip to Step 5.

### Step 2: Show the dependency graph

Run:

```bash
npx @grainulation/orchard plan --format ascii
```

This prints the full sprint dependency graph with status indicators. Display the output as-is -- it already includes status markers (done, active, blocked, ready).

If the user passed arguments like `--mermaid` or `--format mermaid`, forward them:

```bash
npx @grainulation/orchard plan --mermaid
```

### Step 3: Get next ready sprints

Run:

```bash
npx @grainulation/orchard next --json
```

This returns a JSON array of sprints whose dependencies are satisfied and are ready for execution. Parse the output.

If the command fails (e.g., all sprints are done or blocked), note that in the summary.

### Step 4: Display actionable commands

For each ready sprint from Step 3, format it as a concrete command the user can run:

```
Ready sprints:
  /research "Sprint question here"   -- path: .wheat/sprints/sprint-slug
  /research "Another question"       -- path: .wheat/sprints/other-slug
```

Then print a summary:

```
Orchard: <total> sprints, <done> done, <active> active, <ready> ready, <blocked> blocked

Next steps:
  /research "<first ready sprint question>"  -- execute the next ready sprint
  /orchard                                   -- refresh after sprint completes
  orchard sync                               -- re-sync sprint states from directories
```

If no sprints are ready but some are blocked, explain which dependencies need to complete first.

If all sprints are done, congratulate and suggest:

```
All sprints complete.

Next steps:
  /brief              -- compile findings across all sprints
  /blind-spot         -- check for gaps across the full orchard
  orchard dashboard   -- generate a unified HTML dashboard
```

### Step 5: No orchard.json found

If no `orchard.json` was found in Step 1, explain how to create one:

```
No orchard.json found. Orchard coordinates multi-sprint research with dependency tracking.

To get started, run:

  npx @grainulation/orchard init

Or create orchard.json manually:

  {
    "sprints": [
      {
        "path": "./.wheat/sprints/step-1-research",
        "question": "What are the key findings on topic X?",
        "depends_on": [],
        "assigned_to": "claude",
        "status": "ready"
      },
      {
        "path": "./.wheat/sprints/step-2-validate",
        "question": "Do the findings from step 1 hold up?",
        "depends_on": ["./.wheat/sprints/step-1-research"],
        "assigned_to": "claude",
        "status": "blocked"
      }
    ],
    "settings": {
      "sync_interval": "manual"
    }
  }

Next steps:
  npx @grainulation/orchard init       -- scaffold orchard.json
  npx @grainulation/orchard decompose  -- auto-decompose a question into sub-sprints
```

### Rules

- Always run `plan` before `next` so the user sees the full graph context.
- Do NOT modify orchard.json -- this skill is read-only. Use `orchard sync` or manual edits to change state.
- Forward any extra arguments the user provides (e.g., `--mermaid`, `--verbose`) to the underlying orchard commands.
- If `npx @grainulation/orchard` fails with a module-not-found error, suggest: `npm install -g @grainulation/orchard` or `npx -y @grainulation/orchard`.
