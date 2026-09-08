# Wheat — package source

No sprint is active in this repo. Run `wheat init` to start one — this directory is the wheat
package source, not a sprint directory.

## Claims System

All findings are tracked as typed claims in `claims.json`. Claim types: constraint, factual, estimate, risk, recommendation, feedback. Evidence tiers (low to high): stated, web, documented, tested, production.

## Key Commands

- `wheat init` — bootstrap a research sprint
- `wheat compile` — validate and compile claims
- `wheat status` — sprint health dashboard
- `wheat search <query>` — search claims
- `wheat add-claim` — add a new claim
- `wheat resolve <id>` — resolve a conflicting claim
