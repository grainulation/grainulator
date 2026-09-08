# Orchard Orchestration Reference

Orchard manages multiple wheat sprints as a coordinated project. When a decision requires parallel research tracks with dependencies between them, orchard keeps them in sync.

## orchard.json

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

Dependencies declare relationships between sprints. Orchard uses these to determine execution order, detect conflicts, and propagate changes.

### `blocks`

Sprint A blocks sprint B. Sprint B cannot produce output artifacts until sprint A is complete. Orchard sets the blocked sprint's status to `blocked` automatically.

```json
{ "from": "frontend", "to": "auth", "type": "blocks" }
```

Frontend cannot produce its brief until auth is complete.

### `informs`

Sprint A informs sprint B. Claims from A are available to B as reference material, but B is not blocked. When A produces new findings, orchard notifies B's assignee.

```json
{ "from": "database", "to": "auth", "type": "informs" }
```

Database findings are visible to auth, but auth can proceed independently.

### `conflicts`

Sprint A and sprint B have overlapping scope. Orchard monitors both for contradictory claims and flags them for resolution.

```json
{ "from": "database", "to": "frontend", "type": "conflicts" }
```

If database says "use PostgreSQL" and frontend says "use MongoDB," orchard raises a cross-sprint conflict.

## Parallel Execution

Orchard runs independent sprints in parallel. Two sprints are independent when neither blocks the other (directly or transitively). Use `orchard status` to see which sprints can run concurrently:

```bash
npx @grainulation/orchard status
```

Output shows a dependency graph with status indicators and the critical path.

## Cross-Sprint Conflict Detection

Orchard periodically scans all active sprints for claim conflicts. A cross-sprint conflict occurs when two `constraint` or `recommendation` claims from different sprints contradict each other, and neither has been retracted or superseded.

```bash
orchard conflicts
```

## Merge Strategies

When sprints complete, their findings need to be consolidated. Orchard supports three strategies:

- **`append`** -- All claims copied with sprint-prefixed IDs. No deduplication. This is the default.
- **`deduplicate`** -- Claims with similar text and matching types are merged. Higher evidence tier wins. Conflicts flagged for manual review.
- **`selective`** -- Interactive merge. Orchard presents claim groups and you pick which to keep.

```bash
orchard merge --strategy append --into combined/
orchard merge --strategy deduplicate --into combined/
orchard merge --strategy selective --into combined/
```

## Team Assignment

Assignees are tracked in `orchard.json` but enforcement is optional. Assignee changes are recorded in the orchard event log.

```bash
orchard assign database alice
```

## CLI Commands

| Command                             | Description                                            |
| ----------------------------------- | ------------------------------------------------------ |
| `orchard init`                      | Create `orchard.json` from existing sprint directories |
| `orchard status`                    | Show dependency graph and sprint statuses              |
| `orchard conflicts`                 | List cross-sprint claim conflicts                      |
| `orchard merge`                     | Consolidate completed sprints                          |
| `orchard assign <sprint> <person>`  | Set sprint assignee                                    |
