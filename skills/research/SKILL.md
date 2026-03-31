---
name: research
description: Execute a multi-pass research investigation, adding claims with evidence.
tools:
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_search
  - mcp__wheat__wheat_status
  - mcp__deepwiki__ask_question
  - mcp__deepwiki__read_wiki_structure
  - mcp__deepwiki__read_wiki_contents
  - mcp__silo__silo_search
  - mcp__silo__silo_pull
  - WebSearch
  - WebFetch
  - Read
  - Grep
  - Glob
---

# /research -- Investigate a topic

The user wants to research a topic within the current sprint.

## Arguments

$ARGUMENTS

## Instructions

1. **Identify the active sprint** by checking for `claims.json` in the project root, or ask which sprint to target if none exists.

2. **Plan research passes** (2-4 passes depending on topic breadth):
   - Pass 1: Broad landscape -- what exists, key concepts, major players
   - Pass 2: Deep dive -- technical details, implementation specifics
   - Pass 3: Risk and trade-offs -- failure modes, limitations, alternatives
   - Pass 4 (if needed): Synthesis -- cross-cutting insights, recommendations

3. **For each pass**:
   - Use WebSearch and WebFetch for general research
   - When the user references a GitHub repo or the current repo is on GitHub, use DeepWiki tools to gather codebase context
   - For private repos, use Read/Grep/Glob to analyze code directly
   - Add 3-5 claims per pass via `wheat_add-claim`:
     - Use `r###` ID prefix
     - Set appropriate evidence tier (web, documented, tested)
     - Include source URLs in source.artifact when available
     - Mix claim types: factual, estimate, risk, recommendation
   - Run `wheat_compile` after each pass
   - Announce progress: "Pass 2/3 complete: 11 claims across 4 topics."

4. **Completion check**: After all passes, run `wheat_status`.
   - If total_claims >= 8 and the user's original message included words like "write up", "summarize", "brief", or "report", immediately run the /brief workflow.
   - Otherwise, suggest next steps.

5. **Print summary**:

   ```
   Research complete: <pass_count> passes, <claim_count> claims across <topic_count> topics.

   Next steps:
     /brief              -- generate a compiled brief
     /challenge r003     -- stress-test a specific finding
     /witness r005 <url> -- corroborate with external source
   ```
