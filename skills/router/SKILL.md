---
name: router
description: Intent router that detects user intent from plain messages and dispatches to the appropriate skill.
tools:
  - Bash
  - mcp__grainulator__status
  - Read
---

# /router -- Intent Router

Routes plain-language user messages to the appropriate grainulator skill.

## Intent Map

| User says something like...                                            | Route to              | Why                        |
| ---------------------------------------------------------------------- | --------------------- | -------------------------- |
| "look into X", "what about X", "explore X"                             | `/research X`         | Information gathering      |
| "is p001 really true?", "I doubt X"                                    | `/challenge <id>`     | Adversarial testing        |
| "check this: <url>", "does <url> support X"                            | `/witness <id> <url>` | External corroboration     |
| "what are we missing", "any gaps?"                                     | `/blind-spot`         | Structural gap analysis    |
| "where are we", "what's the status"                                    | `/status`             | Sprint snapshot            |
| "write it up", "summarize for the team"                                | `/brief`              | Decision document          |
| "make slides", "prepare for the meeting"                               | `/present`            | Stakeholder presentation   |
| "publish to confluence", "sync to confluence", "push to wiki"          | `/sync`               | Confluence publish         |
| "pull from confluence", "import from wiki", "backfill from confluence" | `/pull <slug>`        | Confluence pull            |
| "show the plan", "what sprints are next", "dependency graph"           | `/orchestrate`            | Multi-sprint orchestration |
| "show analytics", "how healthy is this sprint", "stale claims"         | `/analytics`            | Sprint analytics           |
| "fetch this url", "what does &lt;url&gt; say", "summarize &lt;url&gt;"             | `/fetch &lt;url&gt;`        | Size-efficient URL fetch   |

## Instructions

1. Analyze the user's message for intent signals (verbs, keywords, URLs, claim IDs).
2. If a clear match exists, announce the routing:
   > Running as `/research "topic"` -- this will create claims and compile. Say "just answer" if you wanted a quick response instead.
3. Invoke the matched skill.
4. Preserve the active task and use its context to resolve routine ambiguity. Ask only for missing information that materially changes the work. An explicit `/grainulator` engineering request routes to `skills/grainulator/SKILL.md` and includes implementation and verification.

## When NOT to route

- Questions about the framework itself ("how does the compiler work?")
- Ordinary code edits without an explicit Grainulator workflow request
- General conversation
- Ambiguous intent without research context

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
