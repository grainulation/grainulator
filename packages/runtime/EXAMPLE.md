# A local convergence ledger

Install the verified native asset first. In a new, writable workspace, create the
ledger and add a factual claim through the native mutation interface:

```sh
grainulator runtime init --dir /absolute/project
grainulator runtime claim add --dir /absolute/project \
  --id c1 --type factual --topic example \
  --content 'The local fixture produced the expected output.' --evidence documented
grainulator runtime check --dir /absolute/project --json --no-state
```

This example records an assertion. It does not execute a test or establish tested
evidence. For a load-bearing claim, declare a real local oracle in the runtime's
`run.json`, give the claim a `verified_by.verifier` binding, and explicitly run:

```sh
grainulator runtime verify --dir /absolute/project --claim c1 --verifier unit
```

The oracle is an argv array, receives the claim on stdin, and can produce local
side effects. Review its command and inputs before execution. A canonical verdict
binds claim content, exact argv and declared input bytes; changing a binding makes
the old result stale. Claim mutations preserve the prior ledger in `history/`.

The native Stop hook is installed only by explicit
[enrollment](../../docs/RUNTIME.md). A CLI install, runtime init or workspace binding
does not silently add that gate. The credential-free release-candidate check uses
an isolated local oracle fixture; its success is protocol evidence, not model-quality
or full native-host discovery evidence.
