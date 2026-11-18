# Evidence sprints and native execution

Grainulator includes two distinct ledger contracts. Evidence sprints use generic `claims.json` and `compilation.json` with typed premises, observations, conflicts and acceptance criteria. Native convergence uses `.grainulator/runtime` with its own run contract, temporal state, oracle verdicts and traces. One contract never acts as an implicit fallback for the other.

For evidence research use `grainulator init`, `add`, `import`, `maintain`, `compile`, `resolve` and `status` with an explicit sprint directory. The unified MCP exposes canonical `add_claim`, `compile`, `evidence_health` and related tools. Native claims use `grainulator runtime claim`; do not send them through evidence APIs.

Memory, exports, analytics and orchestration are responsibilities in the same root product. Use `grainulator memory`, `export`, `analytics` and `orchestrate`, or the canonical MCP capabilities. There are no separate component installs, products or server registrations to discover.

A compiler-ready result is structural evidence. It does not prove semantic truth, provider quality or full host discovery. Preserve provenance and user quotes; imported findings do not inherit historical test execution. Next actions remain **Auto** (authorized work to continue) and **Manual** (a real user decision/access/action). Do not invent work to meet a quota.
