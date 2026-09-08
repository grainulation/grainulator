# Grainulator

Evidence and verification for the model you already use.

Grainulator gives model-assisted work a local evidence ledger, checks for contradictions and weak support, and turns the remaining gaps into concrete next actions. Use it for research, engineering, or a managed command loop with a verifier that measures your task.

**2.0.0 release candidate — not tagged or published.** Review and test the `release/2.0.0` branch using the [dogfood guide](docs/DOGFOOD.md). Existing repository history and stars are preserved. Release tagging waits for required CI checks to pass.

## Start locally

Requires Node.js 24 or later; Node 25 is the local default:

```sh
git clone --branch release/2.0.0 https://github.com/grainulation/grainulator.git
cd grainulator
npm ci --ignore-scripts
node bin/grainulator.js doctor
node bin/grainulator.js init --dir ./sprints/example \
  --question 'Can this change meet our requirements?' \
  --audience engineers --constraints 'Preserve existing user data' \
  --done 'Implemented and verified, with remaining limits documented'
node bin/grainulator.js connect --dir ./sprints/example
```

`connect` prints configuration for one **grainulator** MCP server. It changes no host settings. Load that configuration in your host, or keep using the CLI. The portable [Grainulator workflow](skills/grainulator/SKILL.md) can be read by any agent; Claude Code also supports the bundled skills and hooks.

## Call tools

The public server is `grainulator`. Tool names describe the operation:

```js
// MCP server: grainulator, tool: add_claim
{
  "dir": ".",
  "id": "r001",
  "type": "constraint",
  "topic": "delivery",
  "content": "Do not tag the release before required CI checks pass.",
  "evidence": "stated"
}
```

In host interfaces that combine server and tool names, this appears as `grainulator.add_claim` or `mcp__grainulator__add_claim`.

| Capability | Tools |
| --- | --- |
| Evidence | `init`, `add_claim`, `compile`, `search`, `status`, `resolve` |
| Memory | `memory_search`, `memory_store`, `memory_list`, `memory_pull` |
| Exports | `exports_convert`, `exports_formats`, `exports_preview` |

The CLI equivalent is `grainulator add --dir <sprint> ...`. See [host setup](docs/HOSTS.md) and the [adapter contract](docs/ADAPTERS.md). External connectors are optional; local evidence operations do not require them.

## How work progresses

1. Investigate the question that matters to the requested outcome. Record supported findings with their sources and evidence tiers.
2. Compile the ledger to surface material conflicts, weak evidence and missing perspectives. Resolve what can be resolved, and preserve honest limitations.
3. Implement and verify the requested artifact. Run another investigation only when it can change a decision or close a relevant gap.

There are no fixed research-pass or claim-count quotas. A compiler result is evidence about the ledger, not proof that every claim is true or that the whole task is complete. Independent tests establish only what they actually check.

Next actions appear as two concise lists:

**Auto**

- Work the agent can continue under existing authorization.

**Manual**

- Decisions, access or actions that require you; `None.` when there are none.

The agent continues authorized Auto work. Compiler suggestions never grant permission or override the task’s scope. When you ask for next steps only, those two lists are the entire response.

## Playground and managed sessions

Run `npm run dev` and open the printed local URL. The research playground supports model and provider configuration, evidence controls, and portable session export/resume. See [research sessions](docs/RESEARCH.md) for configuration and continuation.

`node bin/grainulator.js demo` exercises a deterministic adapter and verifier offline. It demonstrates the execution protocol; it is not evidence that a model produces better answers. See [evaluation results](docs/EVALUATION.md) for measured model behavior and limits.

## Repository

```text
bin/                  Public CLI
lib/                  Research, providers and execution loop
packages/
  evidence/           Claims and compilation
  memory/             Source context and retrieval
  exports/            Documents and presentations
  analytics/          Sprint metrics and reports
  orchestration/      Sprint dependencies
  runtime/            Managed execution and verification
  shared/             Common utilities
  legacy-cli/         Compatibility commands
skills/               Portable workflows
agents/               Agent instructions
hooks/                Host evidence reminders and write guard
site/                 Product site and playground
scripts/              Previews and acceptance checks
test/                 Plugin and integration regressions
evals/                Model evaluations
```

The permission dashboard has been removed. Native hosts own permissions and remote access. Grainulation’s organization site lives in its separate checkout. Retained internal package identifiers and accepted legacy tool aliases support existing integrations; they are not separate products. [Source provenance](docs/source-imports.json) records the imports.

## Verify from a source checkout

```sh
npm test
npm run test:install
npm run lint
```

See the [dogfood guide](docs/DOGFOOD.md) for browser and runtime checks, and [readiness](docs/READINESS.md) for release acceptance. The 2.0.0 candidate is not tagged or published.

## License

MIT. See [LICENSE](LICENSE).

Local dogfood uses Node 25 (`.nvmrc` / `.node-version`); Node 24 is the minimum supported runtime.
