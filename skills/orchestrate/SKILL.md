---
name: orchestrate
description: Multi-sprint orchestration — view dependency graph, identify the next ready sprint
allowed-tools:
  - Bash
  - Read
  - Glob
---

# /orchestrate -- Multi-sprint orchestration

View the sprint dependency graph, check sprint states, and dispatch the next ready sprint for execution.

## Arguments

$ARGUMENTS

## Instructions

### Step 1: Locate orchard.json

Search for `orchard.json` in these locations (in order):

1. Project root (current working directory)
2. `.grainulator/` subdirectory

Use Glob to find it:

```
**/orchard.json
```

If found, read it and resolve its absolute parent directory as `<config-parent>`. Run every subsequent orchestration CLI call with its working directory set to `<config-parent>`, including when the file is under `.grainulator/`. The CLI searches the working directory and ancestors, not child directories; `--root` is not a directory override for `plan` or `next`. Sprint paths in the configuration are relative to this parent directory.

Preserve the caller’s working directory outside these scoped commands. For a shell-only host, use a subshell with a safely quoted `cd`; a command tool’s working-directory parameter is preferable. Then proceed to Step 2.

If NOT found, skip to Step 5.

### Step 2: Show the dependency graph

Run with working directory `<config-parent>`:

```bash
grainulator orchestrate plan --format ascii
```

This prints the full sprint dependency graph with status indicators. Display the output as-is -- it already includes status markers (done, active, blocked, ready).

If the user passed arguments like `--mermaid` or `--format mermaid`, forward them:

```bash
grainulator orchestrate plan --mermaid
```

### Step 3: Get next ready sprints

Run with working directory `<config-parent>`:

```bash
grainulator orchestrate next --json
```

This returns a JSON array of sprints whose dependencies are satisfied and are ready for execution. Parse the output.

If the command fails (e.g., all sprints are done or blocked), note that in the summary.

### Step 4: Display actionable commands

For each ready sprint from Step 3, format it as a concrete command the user can run:

```
Ready sprints:
  /research "Sprint question here"   -- path: .grainulator/sprints/sprint-slug
  /research "Another question"       -- path: .grainulator/sprints/other-slug
```

Then print a summary:

```
Orchestration: <total> sprints, <done> done, <active> active, <ready> ready, <blocked> blocked

Auto

- <authorized next action>

Manual

- <action requiring the user, or None.>
```

If no sprints are ready but some are blocked, explain which dependencies need to complete first.

If all sprints are done, congratulate and suggest:

```
All sprints complete.

Auto

- <authorized next action>

Manual

- <action requiring the user, or None.>
```

### Step 5: No orchard.json found

If no `orchard.json` was found in Step 1, explain how to create one:

```
No orchard.json found. Grainulator coordinates multi-sprint research with dependency tracking.

To get started, run:

  grainulator orchestrate init --root <intended-config-parent>

Or create orchard.json manually:

  {
    "sprints": [
      {
        "path": "./.grainulator/sprints/step-1-research",
        "question": "What are the key findings on topic X?",
        "depends_on": [],
        "assigned_to": "claude",
        "status": "ready"
      },
      {
        "path": "./.grainulator/sprints/step-2-validate",
        "question": "Do the findings from step 1 hold up?",
        "depends_on": ["./.grainulator/sprints/step-1-research"],
        "assigned_to": "claude",
        "status": "blocked"
      }
    ],
    "settings": {
      "sync_interval": "manual"
    }
  }

Auto

- <authorized next action>

Manual

- <action requiring the user, or None.>
```

### Rules

- Always run `plan` before `next` so the user sees the full graph context.
- Do NOT modify orchard.json -- this skill is read-only. Use `grainulator orchestrate sync` or manual edits to change state.
- Forward any extra arguments the user provides (e.g., `--mermaid`, `--verbose`) to the underlying orchestration commands.
- If `grainulator orchestrate` fails with a module-not-found error, suggest: `grainulator doctor` and use the local checkout CLI.

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
