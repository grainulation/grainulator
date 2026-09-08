# Grainulator — Research Sprint

## Sprint

**Question:** {{QUESTION}}

**Audience:** {{AUDIENCE}}

**Constraints:**
{{CONSTRAINTS}}

**Done looks like:** {{DONE_CRITERIA}}

Use the active sprint directory explicitly in every evidence operation. The unified MCP server is `grainulator`; its tools include `add_claim`, `compile`, `search`, `status`, and `resolve`. If MCP is unavailable, use the local `grainulator` CLI. `grainulator connect --dir <sprint>` prints connection configuration without changing host settings. Optional connectors are not required for local work.

Record supported findings in `claims.json` through tools or CLI mutations. Choose claim types and evidence tiers that match what you learned; never fabricate or inflate support. Compile after meaningful changes. Generate output from current `compilation.json`; resolve material contradictions and explain remaining limitations.

Preserve the user’s full request. Engineering tasks include implementation and verification. Finish against the done criteria and evidence gaps, not a fixed number of claims, sources, or research passes. Compiler warnings guide investigation; a ready compilation does not prove the task complete.

Do not automatically commit, publish, or change host permissions. Existing user authorization governs continued work. Native hosts own permissions and remote access.

## Next-step output

Use current compiler `next_actions` and present exactly two bullet lists labeled **Auto** and **Manual**. Continue authorized Auto work. Manual contains only decisions, access, or actions that require the user. Include 2–3 useful actions when available; never invent work to fill a quota, and show `None.` for an empty group. Refresh stale compilation and respect removed scope. If the user asked only for next steps, output only these lists without recap or extra commentary.
