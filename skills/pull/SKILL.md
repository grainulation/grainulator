---
name: pull
description: Pull a sprint from Confluence and import it as local claims.
tools:
  - mcp__wheat__wheat_add-claim
  - mcp__wheat__wheat_compile
  - mcp__claude_ai_Atlassian__getConfluencePage
  - mcp__claude_ai_Atlassian__searchConfluenceUsingCql
  - mcp__claude_ai_Atlassian__getConfluenceSpaces
  - Read
  - Write
---

# /pull -- Import sprint from Confluence

The user wants to import a sprint from a Confluence page into the local wheat system.

## Arguments

$ARGUMENTS

Expected: Confluence page URL or page ID, or a search query.

## Instructions

1. **Find the source page** using `getConfluencePage` or `searchConfluenceUsingCql`.

2. **Parse the page content** to extract claims.

3. **Create the local sprint** directory at `.wheat/sprints/<slug>/`.

4. **Import claims** using `wheat_add-claim`.

5. **Run `wheat_compile`** to validate.

6. **Print result**:
   ```
   Imported from Confluence: <page_title>
   Claims imported: <count>

   Next steps:
     /status             -- review imported sprint
     /research <topic>   -- continue researching locally
   ```
