---
name: fetch
description: Size-efficient URL fetch with semantic extraction. Use for ad-hoc web research when you want content without the raw HTML overhead.
tools:
  - Bash
  - mcp__grainulator__memory_smart_fetch
  - WebFetch
  - Read
---

# /fetch -- Ad-hoc URL fetch with smart extraction

Pulls a URL's main content (title, description, body paragraphs) without the HTML boilerplate. Delegates to Grainulator’s `memory_smart_fetch` MCP tool, which strips scripts/styles/nav/footer and targets `<main>` or `<article>` regions. Typical reduction: 80-99% vs raw HTML.

## Arguments

$ARGUMENTS

Expected: `/fetch <url> [--mode auto|concise|full|meta-only] [--no-cache] [--privacy]`

- **`--mode auto`** (default): tries concise extraction, falls back to full if quality degrades
- **`--mode concise`**: caps body at ~2KB
- **`--mode full`**: returns all extracted paragraphs
- **`--mode meta-only`**: only title + description (smallest)
- **`--no-cache`**: skip local cache read, force network fetch
- **`--privacy`**: don't write to cache (use for sensitive URLs)

## When to use

- **Quick reference**: "what does this page say" — `/fetch <url>` beats opening a browser
- **Before witnessing**: peek at content before committing to `/witness` (which creates a claim)
- **Third-party pages**: docs sites, blog posts, research articles
- **Re-reading**: cache hits are ~1ms; great for iterating on content you've already fetched

## When NOT to use

- **Confluence**: use `/pull` — structured API is better than HTML scraping
- **DeepWiki**: use `/pull deepwiki` — it already has a cleaner path
- **Authenticated pages**: smart-fetch doesn't do auth. Use the host's authenticated browser or connector.
- **PDFs, images, JSON**: smart-fetch rejects non-HTML content types with `unsupported-content-type`

## Instructions

1. **Call `mcp__grainulator__memory_smart_fetch`** with the URL and parsed flags.

2. **If the response `quality` is "failed"** (empty body, SPA, link list, HTTP error), tell the user:
   - What the reported quality was
   - Any warnings returned
   - Suggest retrying with `--mode full` or raw `WebFetch` as a fallback

3. **Display** the extracted content in a readable format:
   - Title, description
   - Full content (or first N lines if very long)
   - Size reduction metric and cache hit/miss status

4. **Suggest next actions** based on what the user seems to be doing:
   - If they're corroborating a claim: `/witness <claim_id> <url> --smart`
   - If they want to save findings: `/research "<topic extracted from content>"`
   - If the content was weak/failed: `/fetch <url> --mode full` or open in a browser

## Example output

```
URL:        https://example.com/article
Quality:    high  |  Cached: no (first fetch)
Title:      "Understanding Smart Fetch"
Size:       142.1 KB -> 2.3 KB (98% reduction)
Mode used:  concise
Elapsed:    340ms

--- Content ---
[first 2KB of extracted main content]

Auto

- <authorized next action>

Manual

- <action requiring the user, or None.>
```

## Anti-rationalization

| Rationalization | Reality |
|:---|:---|
| "Smart-fetch lost content" | Check the `quality` field. If "failed", retry with `--mode full`. If "degraded", the site may be a SPA — content depends on JS execution. |
| "I should always use full mode" | Full is fine for small pages but wasteful on long docs. `auto` handles the fallback for you. |
| "Cached content might be stale" | Default TTL is 7 days. Use `--no-cache` for latest, or `grainulator memory cache purge <domain>` to drop specific entries. |

## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
