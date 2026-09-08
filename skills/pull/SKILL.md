---
name: pull
description: Pull a sprint from Confluence and import it as local claims.
tools:
  - Bash
  - mcp__grainulator__add_claim
  - mcp__grainulator__compile
  - mcp__claude_ai_Atlassian__getConfluencePage
  - mcp__claude_ai_Atlassian__searchConfluenceUsingCql
  - mcp__claude_ai_Atlassian__getConfluenceSpaces
  - Read
  - Write
---

# /pull -- Import sprint from Confluence

The user wants to import a sprint from a Confluence page into the local Grainulator sprint.

## Arguments

$ARGUMENTS

Expected: Confluence page URL or page ID, or a search query.

## Instructions

If the connector is unavailable, use an already supplied export or source document; request access only when the source cannot otherwise be obtained.

1. **Find the source page** using `getConfluencePage` or `searchConfluenceUsingCql`.

2. **Parse the page content** to extract claims.

3. **Initialize a dedicated local sprint** with `grainulator.init` or `grainulator init --dir <sprint>`. Preserve existing ledgers and pass this directory to every import.

4. **Import claims** using `grainulator.add_claim`.

5. **Run `grainulator.compile`** to validate.

6. **Print result**:

   ```
   Imported from Confluence: <page_title>
   Claims imported: <count>

   Auto

   - <authorized next action>

   Manual

   - <action requiring the user, or None.>
   ```

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
