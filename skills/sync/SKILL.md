---
name: sync
description: Publish the current sprint to Confluence as a page with structured content.
allowed-tools:
  - Bash
  - mcp__grainulator__compile
  - mcp__plugin_grainulator_grainulator__compile
  - mcp__grainulator__status
  - mcp__plugin_grainulator_grainulator__status
  - Read
---

# /sync -- Publish sprint to Confluence

The user wants to publish the current sprint's compiled output to Confluence.

## Arguments

$ARGUMENTS

Optional: Confluence space key, parent page ID.

## Instructions

Publish only when the user has authorized publishing to this destination. A request for a local brief does not authorize a wiki write. When the connector is unavailable, prepare a local export and identify the required access; do not claim publication.

1. **Run `grainulator.compile`** to ensure compilation is current. Check `compilation_status`, not only transport `status: ok`. If blocked, resolve within scope or clearly label the published material blocked with its unresolved conflicts; never present it as a ready decision.

2. **Read `compilation.json`** as the source of truth.

3. **Resolve the authorized destination** through the available host connector. Discover its read/search/write schemas, site ID and space/page requirements; tool names vary by host. Read an existing page and its current version before update. Multiple matching pages or an unspecified destination require clarification before a write; a slug alone is not sufficient authority to overwrite a page.

4. **Prepare content** in the representation accepted by that connector (ADF, Markdown or Storage XHTML). Use `exports_convert` with `confluence-adf` only for an ADF consumer. Escape source text and preserve blocked status/conflict warnings in the rendered result. Prepare the complete artifact before requesting any missing destination authorization.

5. **Publish** through the discovered connector. Check the returned success/error and page identity. On a version conflict, reread the page and reconcile changes before retrying; never force an overwrite. On timeout or partial failure, inspect whether the page was created/updated before retrying to avoid duplicates. Report confirmed successes and failures separately. Do not print "Published" or invent a URL from a local export or failed response. For programmatic host adapters, `lib/confluence-sync.js` exports `publishSnapshot({authorized, destination, compilation, connector})`: the connector supplies discovered `formats`, `read` and `write` methods. Its single-attempt contract rejects ambiguous/unauthorized destinations, preserves blockers and requires a confirmed page ID/URL. It does not discover credentials or grant authority. Legacy descriptor builders alone do not prove remote success.

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

For standalone fetch, setup, or read-only orchestration without an evidence sprint, derive next steps from that task. Do not initialize or compile an unrelated ledger just to produce this footer.

When working in an evidence sprint, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
