# Wheat Commands

Every command runs inside Claude Code. Type it in your conversation and wheat handles the rest.

## Sprint Setup

### `/init`

Bootstrap a new research sprint. Asks you what you're investigating, who needs the answer, and what constraints exist. Creates `claims.json`, `CLAUDE.md`, and the command set.

```
/init
```

Claims produced: `d###` (constraint, factual)

### `/connect <type> <target>`

Link an external data source — Jira, Confluence, a GitHub repo, internal docs.

```
/connect jira https://yourorg.atlassian.net/browse/PROJ
/connect github https://github.com/org/repo
```

Claims produced: none (configures connectors for other commands to use)

## Investigation

### `/research <topic>`

Deep dive on a topic. Explores the problem space, reads code and docs, searches the web, and records what it finds as claims.

```
/research "Postgres connection pooling options"
/research "how does the existing auth service handle sessions"
```

Claims produced: `r###` (factual, risk, estimate, recommendation)

### `/witness <claim-id> <url>`

Corroborate or contradict a specific claim using an external source. Checks whether the URL supports or undermines the claim.

```
/witness r003 https://www.postgresql.org/docs/current/runtime-config-connection.html
/witness p012 https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing
```

Claims produced: `w###` (factual)

### `/prototype`

Build something testable to validate findings. Creates working code in `prototypes/`, runs it, and records what you learned.

```
/prototype
```

Claims produced: `p###` (factual, risk, estimate)

## Stress-Testing

### `/challenge <claim-id>`

Adversarial testing of a specific claim. Tries to prove it wrong, finds edge cases, and records the result — whether the claim held up or needs revision.

```
/challenge r003
/challenge p012
```

Claims produced: `x###` (factual, risk)

### `/blind-spot`

Structural gap analysis. Looks at your claims as a whole and identifies what's missing — topics with no coverage, types that are underrepresented, evidence that's too weak.

```
/blind-spot
```

Claims produced: `r###` (risk, recommendation)

## Stakeholder Input

### `/feedback`

Incorporate stakeholder input. Records what they said, how it changes the sprint direction, and flags any new conflicts.

```
/feedback
```

Claims produced: `f###` (feedback, constraint)

### `/calibrate --outcome "X"`

After shipping, score your predictions against what actually happened. How accurate were your estimates? Which risks materialized?

```
/calibrate --outcome "Migration took 6 weeks, not the estimated 2-4"
```

Claims produced: `cal###` (factual)

## Output

All output commands run the compiler first. If compilation is blocked, they tell you what to fix.

### `/status`

Sprint dashboard. Shows claim counts by type, evidence distribution, active conflicts, and overall sprint health.

```
/status
```

Claims produced: none (read-only)

### `/brief`

Compile the decision document. A structured recommendation backed by your evidence, with confidence levels and caveats.

```
/brief
```

Claims produced: none (consumes compilation.json)

### `/present`

Generate a stakeholder presentation. Scroll-snap slides with key findings, risks, and the recommendation.

```
/present
```

Claims produced: none (consumes compilation.json)

### `/handoff`

Package the sprint for knowledge transfer. Everything a successor needs to understand the investigation and continue it.

```
/handoff
```

Claims produced: none (consumes compilation.json)

## Sprint Management

### `/resolve`

Adjudicate conflicts between claims. When two claims contradict each other, this command walks you through picking a winner or synthesizing a resolution.

```
/resolve
```

Claims produced: updates existing claims (sets `resolved_by`)

### `/replay`

Time-travel through sprint history. Shows how claims evolved over time using `git log`.

```
/replay
```

Claims produced: none (read-only)

### `/merge <path>`

Combine findings from another sprint. Merges claims with prefixed IDs to avoid collisions.

```
/merge ../other-sprint/
```

Claims produced: `<sprint-slug>-<prefix>###` (merged claims keep original type)

### `/evaluate`

Test claims against reality and resolve conflicts. Combines evidence checking with conflict resolution.

```
/evaluate
```

Claims produced: `e###` (factual, risk)

### `/next`

Report progress and 2-4 evidence-backed next actions in the current host conversation. Continue authorized work; request input only when needed.

```
/next
```

Claims produced: none (notification only)

## Command Patterns

Every command that modifies claims follows this sequence:

1. Do the work (research, build, challenge)
2. Append claims to `claims.json`
3. Auto-commit: `wheat: /<command> <summary> -- added/updated <claim IDs>`
4. Suggest 2-4 next steps based on sprint state

Every command that produces output follows this sequence:

1. Run `wheat compile`
2. If blocked, report what to fix (usually `/resolve`)
3. If clear, generate the artifact from `compilation.json`
