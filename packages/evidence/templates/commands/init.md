# /init — Start a sprint

Extract the question, audience, constraints and done criteria from the current request. Infer routine defaults from repository context. Ask only when the core question or a material boundary is missing.

Choose a dedicated sprint directory. Use `grainulator.init` with that directory and the extracted fields, or the local CLI:

```sh
grainulator init --dir <sprint> \
  --question '<question>' \
  --audience '<audience>' \
  --constraints '<constraint1>; <constraint2>' \
  --done '<done criteria>'
```

Use the initializer rather than manually writing managed ledger files. Preserve existing sprint data and never force initialization over an unrelated ledger. Verify with `grainulator.status`, always passing the sprint directory.

When initialization is part of a larger task, continue the requested investigation or implementation immediately. Use the next-step contract below; do not ask for permission to begin work already requested.
## Host access

Use available `grainulator` MCP tools, passing the active sprint `dir` explicitly for evidence operations. If a tool is unavailable, use the local `grainulator` CLI (or `node <checkout>/bin/grainulator.js`). Read sibling skill files directly when slash commands are unavailable. Resolve template paths relative to this skill’s checkout when `CLAUDE_PLUGIN_ROOT` is unset. Optional external connectors are not required for local work; use local code, supplied documents, or available web tools. Do not write managed ledger files directly to bypass a missing MCP connection.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
