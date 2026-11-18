# Grainulator ledger and execution contracts

The portable base supports evidence ledgers and the root JS command-adapter runner. Native convergence is explicitly installed with `grainulator runtime install` using a version-bound asset and a separately trusted manifest. No Cargo build, PATH fallback or automatic installation occurs in ordinary commands.

Use `grainulator runtime --help` for check, verify, run, hook, lessons, claims and enrollment operations. Native state lives in `.grainulator/runtime`; JS adapter results live separately in `.grainulator/runs`. Do not author native claims through evidence `init`, `add`, `import` or `compile`.

Host registration is an explicit preview/apply handoff. Keep a required gate active until the canonical enrollment is verified. Missing, ambiguous or in-progress enrollment must not silently disable an existing required gate. New native verification runs execute only explicit registered oracle commands under inherited permissions; migration and recovery do not execute or replay them.

See the installed `docs/RUNTIME.md` and command help for distribution and enrollment details. An unavailable native asset is a reported prerequisite. It is never substituted with a different backend or a hand-maintained status table.
