# Silo Knowledge Packs

A knowledge pack is a JSON file containing curated claims on a specific domain. Packs ship with silo and can be pulled into any wheat sprint.

## Pack Schema

Each pack is a JSON file with this structure:

```json
{
  "name": "API Design",
  "description": "REST conventions, versioning strategies, ...",
  "version": "1.0.0",
  "claims": [
    {
      "id": "api-001",
      "type": "constraint",
      "topic": "HTTP method semantics",
      "content": "GET must be safe and idempotent ...",
      "source": {
        "origin": "best-practice",
        "artifact": null,
        "connector": null
      },
      "evidence": "documented",
      "status": "active",
      "phase_added": "define",
      "timestamp": "2025-01-01T00:00:00.000Z",
      "conflicts_with": [],
      "resolved_by": null,
      "tags": ["api", "rest"]
    }
  ]
}
```

### Top-level fields

| Field         | Type   | Description              |
| ------------- | ------ | ------------------------ |
| `name`        | string | Human-readable pack name |
| `description` | string | What the pack covers     |
| `version`     | string | Semver version           |
| `claims`      | array  | Array of claim objects   |

### Claim fields

| Field            | Type   | Description                                                                  |
| ---------------- | ------ | ---------------------------------------------------------------------------- |
| `id`             | string | Unique claim ID within the pack                                              |
| `type`           | string | `constraint`, `factual`, `estimate`, `risk`, `recommendation`, or `feedback` |
| `topic`          | string | Short topic label                                                            |
| `content`        | string | The claim text                                                               |
| `source`         | object | `{ origin, artifact, connector }`                                            |
| `evidence`       | string | `stated`, `web`, `documented`, `tested`, or `production`                     |
| `status`         | string | `active` or `retracted`                                                      |
| `phase_added`    | string | Phase when added (e.g. `define`, `research`)                                 |
| `timestamp`      | string | ISO 8601 timestamp                                                           |
| `conflicts_with` | array  | IDs of conflicting claims                                                    |
| `resolved_by`    | string | ID of resolving claim, or null                                               |
| `tags`           | array  | Searchable tags                                                              |

## Built-in Packs

Silo ships with 11 packs in the `packs/` directory:

| Pack               | Claims | Description                                                                |
| ------------------ | ------ | -------------------------------------------------------------------------- |
| `api-design`       | 13     | REST conventions, versioning, pagination, error formats, GraphQL tradeoffs |
| `architecture`     | 12     | Monolith vs micro, build vs buy, SQL vs NoSQL decision claims              |
| `ci-cd`            | 12     | CI/CD pipeline patterns, caching, rollback strategies                      |
| `compliance`       | 14     | HIPAA, SOC 2, GDPR constraint sets with regulatory citations               |
| `data-engineering` | 12     | ETL patterns, data quality, warehouse design                               |
| `frontend`         | 12     | Frontend architecture, performance, accessibility patterns                 |
| `migration`        | 10     | Database/cloud/framework migration risks and patterns                      |
| `observability`    | 12     | Logging, metrics, tracing, alerting patterns                               |
| `security`         | 12     | Security constraints, threat models, authentication patterns               |
| `team-process`     | 12     | Team workflow, code review, incident response patterns                     |
| `testing`          | 10     | Testing strategies, coverage, test architecture                            |

## Commands

### Pull a pack into your sprint

```bash
silo pull <pack> --into <file>
```

Resolves the pack, re-prefixes claim IDs to avoid collisions, deduplicates against existing claims, and merges into your claims file.

### Publish a pack from stored collections

```bash
silo publish <name> --collections <id1> <id2> ...
```

Bundles one or more stored collections into a reusable pack.

### Install a pack from a file

```bash
silo install <file>
```

Installs a pack JSON file into silo's local storage for future use.
