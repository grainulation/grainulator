# Native convergence runtime

The portable base includes evidence tooling and the root JS adapter runner. `grainulator runtime` is the separate native convergence engine, with state in `.grainulator/runtime`. It never substitutes another checker, searches PATH for historical executables, downloads code implicitly or requires Cargo in an installed archive. A platform is supported only after actual target acceptance.

Install a version-matched native archive using an independently obtained manifest pin:

```sh
grainulator runtime install --archive ./runtime.tar.gz --manifest ./release.json --manifest-sha256 <trusted-pin> --json
```

The manifest beside an untrusted archive is not its own trust anchor. Installation verifies target, ABI, hashes, extraction entries and modes, then installs an explicit user asset. Installing either the base or asset does not register host hooks. The Homebrew wrapper can select its formula-owned verified asset directory; workspace enrollment still requires an explicit retained user-cache installation.

Create a new workspace ledger with `grainulator runtime init --dir <workspace> --json`. `--not-managed` explicitly records a data-only policy; it is not inferred from a missing marker. `--run '<JSON-object>'` selects a reviewed run contract; otherwise the exact project's `runtime` config section is used. Evidence `init`, `add`, `import` and `compile` reject native ledgers.

Typed authoring uses `runtime claim add|update|supersede`. Add requires `--id`, `--type`, `--topic`, `--content` and `--evidence`. Update takes `--id` and `--patch '<JSON-object>'`; supersede takes `--id` and `--by <existing-successor-id>`. Use `--expected-sha256 <ledger-hash>` for compare-and-swap authoring. Mutations preserve history under locks and invalidate incompatible bindings.

`runtime check --dir <workspace> --json` adjudicates recorded evidence and updates temporal state; add `--no-state` for a non-mutating check. It never executes an oracle. `runtime verify --dir <workspace> --claim <id> --verifier <oracle>` explicitly runs the registered literal command and records its bound verdict. `runtime run` is the native driver; root `grainulator run` retains the distinct JS adapter protocol. `runtime lessons` reads recorded native traces and derives candidates, not automatically accepted new evidence.

Exit statuses remain command-specific:

| Operation | Statuses |
| --- | --- |
| Root adapter `run` | 0 verified; 2 unverified terminal result; 3 soundness break; 1 usage/configuration failure |
| Native `check` | 0 ready; 1 blocked; 2 budget exceeded; 3 runtime/load failure; 4 converged with residuals |
| Native `run` | 0 ready; 1 nonconverged; 2 budget exceeded; 3 runtime/trace failure; 4 residuals; 5 stuck |
| Native `verify` | 0 pass; 1 fail; 2 unknown; 3 usage/load/runtime failure |
| Native `lessons` | 0 report generated; 2 empty corpus; 3 invalid trace/runtime failure |
| Native `hook` | 0 with empty allow or JSON denial; 3 invalid registration invocation |

An exit-zero Stop response containing a denial is a block. Active required enrollment fails closed for unavailable checker, malformed state or unknown outcomes. A command whose effects may have occurred before its trace was committed is reported as unknown; migration/recovery never replays it automatically.

## Explicit host handoff

Use `runtime enroll --dir <workspace> --host claude|codex --config-dir <absolute-directory> --settings-sha256 <inspected-hash|absent> [--enrollment-sha256 <inspected-hash|absent>] --json` only for the authorized host scope. Review existing settings first. Enrollment retains the exact verified hook/checker in an independent user cache and preserves unrelated settings/wrappers. Package-manager cleanup, plugin refresh and CLI removal do not silently move this pin or disable its gate.

`runtime rollback` and `runtime detach` require the inspected `--enrollment-sha256` and `--settings-sha256`. Rollback refuses later data/settings changes. Detach removes only the owned hook and preserves data/assets. Required hooks must be deliberately detached or handed off before removing their launcher.

Converted runtime state needs `runtime review-migration --expected-sha256 <inspected-marker-hash>` after reviewing retained argv/inputs. Converted oracle contracts require explicit strict verification; old pass receipts are historical evidence, not newly executed canonical results. Unknown, missing or incomplete metadata cannot establish that a previously mandatory gate is optional.

Run `grainulator runtime --help` for current flags. Local installation/enrollment and direct MCP tests do not establish that a fresh host loaded the intended plugin, skills and hooks; use the separate full-host acceptance guide.

The current enrollment contract supports one workspace and one host settings scope per enrollment. It refuses an existing canonical Stop hook or receipt bound to another workspace, host or settings file before creating backups or modifying registrations. A same-workspace/same-host upgrade uses compare-and-swap replacement of its one owned hook and retains the old cache for rollback. Multi-workspace or multi-host cohorts require a separately reviewed handoff; missing metadata never declares those gates optional.
