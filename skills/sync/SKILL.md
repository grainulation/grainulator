---
name: sync
description: Publish the current sprint to Confluence as a page with structured content.
tools:
  - Bash
  - mcp__grainulator__compile
  - mcp__grainulator__status
  - mcp__claude_ai_Atlassian__createConfluencePage
  - mcp__claude_ai_Atlassian__updateConfluencePage
  - mcp__claude_ai_Atlassian__getConfluenceSpaces
  - mcp__claude_ai_Atlassian__searchConfluenceUsingCql
  - Read
---

# /sync -- Publish sprint to Confluence

The user wants to publish the current sprint's compiled output to Confluence.

## Arguments

$ARGUMENTS

Optional: Confluence space key, parent page ID.

## Instructions

Publish only when the user has authorized publishing to this destination. A request for a local brief does not authorize a wiki write. When the connector is unavailable, prepare a local export and identify the required access; do not claim publication.

1. **Run `grainulator.compile`** to ensure compilation is current.

2. **Read `compilation.json`** as the source of truth.

3. **Find the target space** using `getConfluenceSpaces` or the user-provided space key.
   - Search for an existing page with the sprint slug
   - If found, update it. If not, create a new page.

4. **Format content** as Confluence Storage Format (XHTML).

5. **Publish** using `createConfluencePage` or `updateConfluencePage`.

6. **Print result**:

   ```
   Published to Confluence: <page_url>

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
