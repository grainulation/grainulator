# Grainulator workspace

This checkout prepares the 2.0.0 release candidate. Follow the user’s active scope for local edits, branch pushes, deployment, publication, and repository archival. Do not create a release tag or publish a release before the required CI checks pass; those actions must also be covered by the user’s release authorization. Component workspace packages remain private.

Use the active sprint directory identified by the current task or project instructions. If none exists, create a dedicated sprint for the requested work; never repurpose an unrelated ledger. Pass `--dir` or the MCP `dir` argument explicitly. Use `skills/grainulator/SKILL.md` for the portable workflow.

Source imports and local-edit provenance live in `docs/source-imports.json`. Do not overwrite original checkouts. Retained package names are compatibility aliases; package directories describe responsibilities.

Run `npm test` for component suites and dogfood regressions. Run `node test/conformance.mjs` from `packages/runtime` for Rust runtime conformance. Use `npm run dev` for site previews; validate responsive and keyboard behavior before handing off visual changes.

The permission dashboard and its connectors have been removed at the maintainer’s request. Do not restore that application, its hooks, or its runtime dependencies. Native hosts own permissions and remote access. Generated evidence and analytics reports remain supported.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
