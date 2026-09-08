# Security Policy

## Supported versions

The latest released minor version receives security updates.

## Reporting a vulnerability

bean is a small skill plus a self-contained runtime (Rust binaries, no runtime dependencies,
no telemetry). `bean-check` is a pure adjudicator — it only reads/writes local `.bean/*`
files and makes no network calls.

The execution surfaces to know about (all `shell:false` — argv only, no shell interpolation):

- **`bean-verify`** runs the **oracle commands you declare** in `.bean/run.json` `oracles` —
  arbitrary local code, by design, which can reach the network if a declared command does.
- **`bean-run`** runs the **`--agent` command you pass it** each round, and triggers oracles
  via `bean-verify`. It is an explicit driver you invoke, not something the hook starts.
- **`bean-check`** and **`bean-hook`** execute no oracles. `bean-check` is a pure adjudicator
  (reads ledger/verdicts only); `bean-hook` only runs `bean-check`, and is inert without a
  `.bean/` ledger.

Treat a `run.json` like a makefile: only run a ledger whose oracle commands (and any agent
command) you trust. The other likely concern is prompt-injection or misleading guidance in
the skill text.

Please report any concern via GitHub Security Advisories on this repository (preferred),
or by email to security@grainulator.app.

We aim to acknowledge reports within a few business days and to resolve confirmed issues
within a 90-day disclosure window.

## Installing safely

bean installs into your agent's context, so treat it like any third-party plugin: prefer a
tagged release over a moving branch (pin a `--ref`) and re-review on update. The default
ledger is local-only; the only optional outbound path is the grainulator/wheat remote
dashboard, which stays off unless you wire it in.

## Scope

In scope:

- Skill or reference text that could induce unsafe, destructive, or deceptive behavior.
- Manifest content that misrepresents what the plugin does.
- The runtime binaries (`rs/`): local file handling, input parsing, and the oracle-execution
  path (`bean-verify`/`bean-run` running declared commands; `bean-hook` running `bean-check`).

Out of scope:

- The behavior of the underlying model. bean shapes procedure; it cannot constrain a
  model's raw capability.
