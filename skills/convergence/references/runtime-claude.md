# Native host integration

Use the one Grainulator root plugin. Install the intended base package and matching verified native runtime separately, then follow explicit workspace enrollment preview/apply operations. The host owns permissions and registration; product installation does not authorize changing host settings.

A direct MCP initialize/list/call check verifies the local server, not host skill/hook discovery. Test the actual host separately with a fresh session and the precise loaded build. Preserve unrelated wrappers and settings. Required native hooks use enrolled copies that survive package-manager cleanup; removing or rebinding them requires an explicit handoff.

See [runtime contracts](runtime.md) and root `docs/PLUGIN-TESTING.md`. On Codex this workflow is explicit-only as `/convergence`.
