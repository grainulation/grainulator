# Portable research from the CLI

Create a session without making provider calls:

```sh
grainulator research --question "What evidence answers this question?" \
  --context "Background and constraints" --dir ./research-session --prepare-only
```

This writes `session.json` and `SESSION.md` in a new output directory. The Markdown handoff can be opened in your agent. No browser, local web server or provider credential is needed for preparation.

## Run or resume

Select a provider/model when creating a session with `--provider`, `--model` and, for a compatible endpoint, `--base-url`. Use `--no-web-search` or `--no-challenge` to disable those passes. Run without `--prepare-only` only when you intend to call the configured provider.

Resume an existing session in a new output directory:

```sh
grainulator research --session ./research-session/session.json \
  --dir ./continued-session --prepare-only
```

Omit `--prepare-only` to execute its unfinished passes. Provider calls require the configured credentials and may incur cost. `--api-key-env MODEL_API_KEY` selects a local environment variable; pass the variable name, never the key value. The built-in providers also support their documented environment keys. Custom endpoints do not inherit another provider's key.

`--session` and `--question` are mutually exclusive. Creation settings cannot silently override imported checkpoint settings. `--restart` explicitly reruns a session; ordinary continuation preserves completed passes. Old browser-exported session JSON remains readable, including completed work and evidence-gate state.

## Checkpoints and evidence

Session serialization, credential exclusion, streaming, cancellation and partial continuation use the same portable session engine as CLI execution. Cancellation preserves completed passes; interrupted output is not promoted to a completed result. Research limits are per pass, not a whole-session spending cap. Retrying passes can issue more requests.

When enabled in the session configuration, challenge, blind-spot and claims-ledger passes feed synthesis. The optional evidence gate checks extracted claim structure, source links and declared conflicts. It does not establish source truth, complete coverage or independent corroboration. Model-generated claims start at the stated tier. The CLI writes claims and runs the evidence compiler when a ledger checkpoint exists.

Session files exclude configured credential fields. Model content and handoffs may still contain sensitive task material; review them before sharing. Session import has an 8 MiB bound; provider request limits are separate.

## Verification

`npm run test:core` exercises mock provider transport, redirect/key isolation, UTF-8 streaming, cancellation, serialization, evidence policy and actual CLI preparation/continuation. `npm run test:install` exercises the same workflows from an installed archive. Routine checks make no paid-provider calls. Full native-host discovery and live-provider acceptance are separate operations.
