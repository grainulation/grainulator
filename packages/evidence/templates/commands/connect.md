# /connect — Link an external data source

You are connecting an external tool or data source to this Grainulator sprint. Connected sources provide higher-quality evidence than web research alone.

## Connector Types

### GitHub Repository

```
/connect github <org/repo>
```

- Read the repo's README, key source files, architecture
- Extract claims about existing infrastructure, patterns, dependencies
- Evidence tier: `documented`
- Track as connector in claims.json source field

### Atlas File

```
/connect atlas <path-to-atlas.yaml>
```

- Read a RepoAtlas-style YAML file for multi-repo routing intelligence
- Extract claims about repo ownership, dependencies, infrastructure
- Evidence tier: `documented`

### Jira / Linear (via MCP)

```
/connect jira <project-key>
```

- Read relevant tickets, priorities, blockers
- Extract constraint and risk claims
- Evidence tier: `stated` (tickets are stakeholder input)

### Monitoring (Datadog, Grafana, etc.)

```
/connect monitoring <dashboard-name>
```

- Pull current metrics if accessible
- Evidence tier: `production` (highest tier)

### Confluence / Notion (via MCP)

```
/connect docs <space/page>
```

- Read existing documentation, ADRs, decision records
- Evidence tier: `documented`

## Process

1. **Parse the argument** to determine connector type and target.

2. **Attempt to access the source**: Use available MCP tools, file system access, or web fetch as appropriate. If the source isn't accessible, tell the user what's needed (MCP server config, file path, etc.)

3. **Extract initial claims**: Pull relevant information and create claims:

```json
{
  "id": "r0XX",
  "type": "factual|constraint",
  "topic": "<relevant topic>",
  "content": "<extracted finding>",
  "source": {
    "origin": "connector",
    "artifact": null,
    "connector": {
      "type": "<github|atlas|jira|monitoring|docs>",
      "target": "<org/repo or project-key or path>",
      "ref": "<specific file/ticket/page if applicable>",
      "fetched": "<ISO timestamp>"
    }
  },
  "evidence": "documented",
  "status": "active",
  "phase_added": "research",
  "timestamp": "<ISO timestamp>",
  "conflicts_with": [],
  "resolved_by": null,
  "tags": ["connector", "<type>"]
}
```

4. **Record connector provenance** in each imported claim’s `source` field:

```json
{ "origin": "connector", "artifact": "org/repo", "connector": "github" }
```

5. **Update CLAUDE.md** Connectors section with the new connection.

6. **Run the compiler**:
   ```bash
   grainulator compile --summary
   ```

## Version control

Preserve the user’s edits. Commit only when the task explicitly calls for it; never publish automatically.

## Tell the user

- Confirm what was connected and what was found
- List the claims extracted
- Suggest `/research` to dig deeper into findings, or `/status` to see the updated dashboard

$ARGUMENTS

## Managed evidence and completion

Use Grainulator tools or CLI for claim mutations; do not directly rewrite managed ledger files. Evidence tiers describe actual support, not the connector used. Investigate only material gaps and finish the requested artifact without fixed claim or pass quotas.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
