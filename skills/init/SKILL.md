---
name: init
description: Initialize a new research sprint with a question, audience, and constraints.
tools:
  - mcp__wheat__wheat_status
  - Bash
  - Read
---

# /init -- Start a new research sprint

The user wants to start a new research sprint.

## Arguments

$ARGUMENTS

## Instructions

1. Parse the user's input to extract:
   - **Question**: The core research question. If not explicit, ask.
   - **Audience**: Who will consume the output (engineers, product, executives, etc.). Default to the repo context if detectable.
   - **Constraints**: Any hard requirements or boundaries (semicolon-separated).
   - **Done criteria**: What "done" looks like for this sprint.

2. **Delegate to the canonical CLI init.** Do NOT manually create claims.json or call wheat_add-claim.
   Run the full init via the Bash tool:

   ```bash
   npx -y @grainulation/wheat init --headless \
     --question "<question>" \
     --audience "<audience>" \
     --constraints "<constraint1>; <constraint2>" \
     --done "<done criteria>"
   ```

   This creates all sprint files: claims.json, CLAUDE.md, AGENTS.md, .mcp.json, .gitignore, .claude/commands/wheat/, output directories, and the pre-commit hook. Using the CLI ensures the skill path and CLI path produce identical results.

3. After init completes, call `wheat_status` to verify the sprint was created successfully.

4. Print a summary:

   ```
   Sprint initialized: <slug>
   Question: <question>
   Audience: <audience>
   Claims: <count>

   Next steps:
     /research <topic>  -- start gathering evidence
     /status             -- view sprint dashboard
   ```
