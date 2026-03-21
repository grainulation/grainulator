---
name: init
description: Initialize a new research sprint with a question, audience, and constraints.
tools:
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_status
  - Write
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
   - **Constraints**: Any hard requirements or boundaries.

2. Generate a sprint slug from the question (lowercase, hyphenated, max 4 words). Example: "how does auth work" -> `auth-architecture`.

3. Create the sprint directory at `.wheat/sprints/<slug>/`.

4. Create `claims.json` with schema_version "1.0" and meta fields (question, initiated date, audience, phase: "define", connectors: []).

5. Add define-phase claims:
   - `d001`: constraint claim capturing the core question scope
   - `d002`: constraint claim for audience and output expectations
   - Additional `d###` claims for any stated constraints

6. Run `wheat_compile` to validate the initial sprint.

7. Print a summary:

   ```
   Sprint initialized: <slug>
   Question: <question>
   Audience: <audience>
   Claims: <count>

   Next steps:
     /research <topic>  -- start gathering evidence
     /status             -- view sprint dashboard
   ```
