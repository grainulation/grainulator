# Grainulator orchestration Orchestration Reference

Grainulator orchestration manages multiple evidence sprints as a coordinated project. When a decision requires parallel research tracks with dependencies between them, orchestration keeps them in sync.

## grainulator.config.json

The project manifest lives at the root of your multi-sprint workspace. It declares sprints, their dependencies, and team assignments.

```json
{
  "schema_version": "1.0.0",
  "project": "platform-migration",
  "sprints": [
    {
      "id": "database",
      "path": "./sprints/database/",
      "status": "active",
      "assignee": "alice"
    },
    {
      "id": "auth",
      "path": "./sprints/auth/",
      "status": "active",
      "assignee": "bob"
    },
    {
      "id": "frontend",
      "path": "./sprints/frontend/",
      "status": "blocked",
      "assignee": "carol"
    }
  ],
  "dependencies": [
    { "from": "frontend", "to": "auth", "type": "blocks" },
    { "from": "database", "to": "auth", "type": "informs" },
    { "from": "database", "to": "frontend", "type": "informs" }
  ]
}
```

### Sprint Fields

| Field      | Type   | Required | Description                                      |
| ---------- | ------ | -------- | ------------------------------------------------ |
| `id`       | string | Yes      | Unique sprint identifier within the project      |
| `path`     | string | Yes      | Relative path to the sprint directory            |
| `status`   | string | Yes      | One of `active`, `blocked`, `complete`, `paused` |
| `assignee` | string | No       | Team member responsible for the sprint           |

## Dependency Types

Dependencies declare relationships between sprints. Grainulator orchestration uses these to determine execution order, detect conflicts, and propagate changes.

### `blocks`

Sprint A blocks sprint B. Sprint B cannot produce output artifacts until sprint A is complete. Grainulator orchestration sets the blocked sprint's status to `blocked` automatically.

```json
{ "from": "frontend", "to": "auth", "type": "blocks" }
```

Frontend cannot produce its brief until auth is complete.

### `informs`

Sprint A informs sprint B. Claims from A are available to B as reference material, but B is not blocked. When A produces new findings, orchestration notifies B's assignee.

```json
{ "from": "database", "to": "auth", "type": "informs" }
```

Database findings are visible to auth, but auth can proceed independently.

### `conflicts`

Sprint A and sprint B have overlapping scope. Grainulator orchestration monitors both for contradictory claims and flags them for resolution.

```json
{ "from": "database", "to": "frontend", "type": "conflicts" }
```

If database says "use PostgreSQL" and frontend says "use MongoDB," orchestration raises a cross-sprint conflict.

## Parallel Execution

Grainulator orchestration runs independent sprints in parallel. Two sprints are independent when neither blocks the other (directly or transitively). Use `orchestration status` to see which sprints can run concurrently:

```bash
grainulator orchestrate status
```

Output shows a dependency graph with status indicators and the critical path.

## Cross-Sprint Conflict Detection

Grainulator orchestration periodically scans all active sprints for claim conflicts. A cross-sprint conflict occurs when two `constraint` or `recommendation` claims from different sprints contradict each other, and neither has been retracted or superseded.

```bash
orchestration conflicts
```

## Merge Strategies

When sprints complete, their findings need to be consolidated. Grainulator orchestration supports three strategies:

- **`append`** -- All claims copied with sprint-prefixed IDs. No deduplication. This is the default.
- **`deduplicate`** -- Claims with similar text and matching types are merged. Higher evidence tier wins. Conflicts flagged for manual review.
- **`selective`** -- Interactive merge. Grainulator orchestration presents claim groups and you pick which to keep.

```bash
orchestration merge --strategy append --into combined/
orchestration merge --strategy deduplicate --into combined/
orchestration merge --strategy selective --into combined/
```

## Team Assignment

Assignees are tracked in `grainulator.config.json` but enforcement is optional. Assignee changes are recorded in the orchestration event log.

```bash
orchestration assign database alice
```

## CLI Commands

| Command                             | Description                                            |
| ----------------------------------- | ------------------------------------------------------ |
| `orchestration init`                      | Create `grainulator.config.json` from existing sprint directories |
| `orchestration status`                    | Show dependency graph and sprint statuses              |
| `orchestration conflicts`                 | List cross-sprint claim conflicts                      |
| `orchestration merge`                     | Consolidate completed sprints                          |
| `orchestration assign <sprint> <person>`  | Set sprint assignee                                    |
