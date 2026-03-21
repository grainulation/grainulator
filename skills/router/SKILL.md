---
name: router
description: Intent router that detects user intent from plain messages and dispatches to the appropriate skill.
tools:
  - mcp__wheat__wheat_status
  - Read
---

# /router -- Intent Router

Routes plain-language user messages to the appropriate grainulator skill.

## Intent Map

| User says something like... | Route to | Why |
|---|---|---|
| "look into X", "what about X", "explore X" | `/research X` | Information gathering |
| "build X", "try X", "make a quick X" | `/prototype` | Hands-on validation |
| "is p001 really true?", "I doubt X" | `/challenge <id>` | Adversarial testing |
| "check this: <url>", "does <url> support X" | `/witness <id> <url>` | External corroboration |
| "what are we missing", "any gaps?" | `/blind-spot` | Structural gap analysis |
| "where are we", "what's the status" | `/status` | Sprint snapshot |
| "write it up", "summarize for the team" | `/brief` | Decision document |
| "make slides", "prepare for the meeting" | `/present` | Stakeholder presentation |

## Instructions

1. Analyze the user's message for intent signals (verbs, keywords, URLs, claim IDs).
2. If a clear match exists, announce the routing:
   > Running as `/research "topic"` -- this will create claims and compile. Say "just answer" if you wanted a quick response instead.
3. Invoke the matched skill.
4. If intent is ambiguous, ask: "That sounds like it could be a `/research` -- want me to run it as a full research pass, or just answer the question?"

## When NOT to route

- Questions about the framework itself ("how does the compiler work?")
- Code edits to wheat files
- General conversation
- Ambiguous intent without research context
