---
name: sync
description: Publish the current sprint to Confluence as a page with structured content.
tools:
  - mcp__wheat__wheat_compile
  - mcp__wheat__wheat_status
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

1. **Run `wheat_compile`** to ensure compilation is current.

2. **Read `compilation.json`** as the source of truth.

3. **Find the target space** using `getConfluenceSpaces` or the user-provided space key.
   - Search for an existing page with the sprint slug
   - If found, update it. If not, create a new page.

4. **Format content** as Confluence Storage Format (XHTML).

5. **Publish** using `createConfluencePage` or `updateConfluencePage`.

6. **Print result**:
   ```
   Published to Confluence: <page_url>

   Next steps:
     /status             -- review sprint dashboard
     /brief              -- also generate a local brief
   ```
