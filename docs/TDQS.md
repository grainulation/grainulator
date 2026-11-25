# Tool-definition quality and discovery profiles

Grainulator exposes two real MCP profiles. The Docker image selects the 15-tool compact profile for evidence, local memory and exports. CLI and bundled plugin registrations retain the 29-tool legacy default. Explicit `--toolset compact` and `--toolset legacy` select the advertised surface; unadvertised tool names are rejected.

The compact profile intentionally omits network retrieval, Confluence publication and memory-graph operations. Those remain available through the CLI and legacy profile. Its combined operations preserve format/catalog discovery, sprint acceptance updates and finding audit history. Evidence uses an append, correct, supersede and reopen lifecycle so prior reasoning remains inspectable; deleting claims would erase that audit trail. Memory collections can be replaced by name without rewriting sprint history. See [the tool reference](TOOLS.md#compact-profile-and-container-discovery) and [container commands](DEPLOYMENT.md#mcp-container).

## Published rubric

The primary specification is Glama's [Tool Definition Quality Score framework](https://github.com/glama-ai/tool-definition-quality-score). It evaluates discovered tool names, descriptions, input/output schemas, annotations and sibling names:

| Dimension | Weight |
| --- | --- |
| Purpose Clarity | 25% |
| Usage Guidelines | 20% |
| Behavioral Transparency | 20% |
| Parameter Semantics | 15% |
| Conciseness & Structure | 10% |
| Contextual Completeness | 10% |

The server's definition-quality component combines 60% of the mean tool score with 40% of the weakest tool score. A separate coherence component equally weighs tool differentiation, naming consistency, count appropriateness and lifecycle coverage. Overall scoring combines definition quality at 70% and coherence at 30%, with the specification's rounding rules.

The typical 3–15 count anchor is guidance, not a guarantee. Rubric judgments involve an LLM; structural checks and local reviews cannot certify a perfect score.

## Maintaining this surface

- Describe each operation's concrete result, when to use a sibling instead, relevant writes/network effects and actionable failure conditions. Keep examples short and valid for the advertised profile.
- Describe nested provenance, calibration and imported-record fields as well as top-level arguments. Explain omitted defaults, revision requirements, line-number units and conditional inputs at their actual parameter sites.
- Match annotations to the operation's most effectful supported mode. Catalog and preview modes do not justify labeling a tool read-only when another mode can replace files.
- Retain the distinction between recorded evidence labels, intact source bytes and independently verified semantic support. Capture and compile operations do not run external verifiers.
- Inspect both negotiated protocol versions: modern clients receive structured output schemas; older clients retain text results. Tool names and profile capabilities remain explicit.
- Exercise representative calls, error cases, catalog modes and configured paths after metadata changes. Regenerate JavaScript and build identity before installed-package acceptance.

## Verification and vendor status

Run the repository's typecheck, generated-output, metadata, compact MCP and installed-package checks. The Docker command regression executes its configured arguments through real stdio discovery and separately checks the unchanged legacy default. This verifies the selected protocol surface, not an actual container build.

Glama's [indexing methodology](https://glama.ai/mcp/methodology) describes default-branch source ingestion, Docker execution and protocol introspection. A PR, local audit, Docker command change or green repository CI does not establish that Glama has rebuilt the server. Record the vendor's scanned source revision, profile, timestamp and per-tool/coherence findings before reporting a new vendor score. No locally estimated number should be presented as a Glama re-score.
