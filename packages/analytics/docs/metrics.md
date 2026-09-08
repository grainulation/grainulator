# Harvest Metrics Reference

Harvest tracks quantitative metrics across your wheat sprints. Every metric is computed from `compilation.json` and stored as a JSON object with a consistent schema.

## Claim Counts by Type

Total claims broken down by type. Use this to spot sprints that are recommendation-heavy but evidence-light.

```json
{
  "metric": "claim_counts_by_type",
  "timestamp": "2026-03-16T12:00:00Z",
  "data": {
    "constraint": 12,
    "factual": 45,
    "estimate": 8,
    "risk": 19,
    "recommendation": 14,
    "feedback": 6
  }
}
```

## Evidence Tier Distribution

Counts claims at each evidence tier. A healthy sprint trends toward `documented` and `tested` over time.

```json
{
  "metric": "evidence_tier_distribution",
  "timestamp": "2026-03-16T12:00:00Z",
  "data": {
    "stated": 5,
    "web": 18,
    "documented": 32,
    "tested": 14,
    "production": 3
  }
}
```

## Topic Coverage

Measures how many distinct topics have claims and the depth per topic. Topics with only one claim type are flagged as monocultures.

```json
{
  "metric": "topic_coverage",
  "timestamp": "2026-03-16T12:00:00Z",
  "data": {
    "total_topics": 9,
    "topics": [
      {
        "name": "connection-pooling",
        "claim_count": 12,
        "types": ["factual", "risk", "recommendation"],
        "monoculture": false
      },
      {
        "name": "auth-sessions",
        "claim_count": 3,
        "types": ["factual"],
        "monoculture": true
      }
    ]
  }
}
```

## Prediction Accuracy (Brier Scores)

After `/calibrate`, harvest computes Brier scores for estimate claims. Lower is better. A score of 0 means perfect prediction; 1 means maximally wrong.

```json
{
  "metric": "prediction_accuracy",
  "timestamp": "2026-03-16T12:00:00Z",
  "data": {
    "mean_brier_score": 0.18,
    "scores": [
      {
        "claim_id": "e003",
        "predicted": "2-4 weeks",
        "actual": "6 weeks",
        "brier": 0.42
      },
      {
        "claim_id": "e007",
        "predicted": "sub-100ms p99",
        "actual": "87ms p99",
        "brier": 0.02
      }
    ]
  }
}
```

## Knowledge Decay Rate

Tracks how quickly claims become stale. Measures the time between a claim's creation and its first challenge or supersession.

```json
{
  "metric": "knowledge_decay_rate",
  "timestamp": "2026-03-16T12:00:00Z",
  "data": {
    "median_days_to_challenge": 14,
    "median_days_to_supersede": 31,
    "claims_never_challenged_pct": 0.62
  }
}
```

## Sprint Velocity

Claims added, resolved, and retracted per unit of time. Computed per day and per phase.

```json
{
  "metric": "sprint_velocity",
  "timestamp": "2026-03-16T12:00:00Z",
  "data": {
    "claims_per_day": 8.3,
    "by_phase": {
      "define": { "claims": 12, "days": 1 },
      "research": { "claims": 48, "days": 5 },
      "prototype": { "claims": 18, "days": 3 },
      "evaluate": { "claims": 10, "days": 2 }
    }
  }
}
```

## Conflict Resolution Rate

Tracks how quickly conflicts are detected and resolved. Unresolved conflicts block compilation.

```json
{
  "metric": "conflict_resolution_rate",
  "timestamp": "2026-03-16T12:00:00Z",
  "data": {
    "total_conflicts": 7,
    "resolved": 5,
    "unresolved": 2,
    "median_hours_to_resolve": 4.2
  }
}
```

## Common Fields

Every metric object includes:

| Field       | Type   | Description                       |
| ----------- | ------ | --------------------------------- |
| `metric`    | string | Machine-readable metric name      |
| `timestamp` | string | ISO 8601 timestamp of computation |
| `data`      | object | Metric-specific payload           |

Harvest writes metrics to `.harvest/metrics.jsonl` as newline-delimited JSON. Each line is one metric snapshot. Historical data is never overwritten — harvest appends only, giving you a full time series.
