# Grounded Report Sprint Example

This directory contains a complete, self-contained reference example demonstrating Grainulator's grounded report toolchain with cryptographic byte integrity, semantic support evaluation, Grounding Guard `--strict` validation, and DSSE in-toto Statement v1 attestation.

## Fixture Overview

- **Topic**: Surrogate country dataset selection for foreign input valuation in trade investigations.
- **`claims.json`**: Four typed claims (`c001`–`c004`) covering factual findings, precedents, methodological risk, and policy recommendations. Each claim anchors to source metadata (origin, artifact, revision, and quote) and cryptographic passage hashes (`passage_sha256`).
- **`evidence/passages/`**: Stored passage byte files indexed strictly by SHA-256 (`<sha256>.txt`).
- **`draft.md`**: Grounded report narrative referencing claims via `[[claim:c001]]` syntax, preserving active risk citations and avoiding uncited factual assertions.
- **`keys/`**: Ed25519 public/private keypair for cryptographic attestation.
- **`output/`**:
  - `packet.json`: Canonical, deterministic report packet with normalized source aliases.
  - `semantic-eval.json`: Detached sidecar evaluation (`grainulator.semantic-eval/v1`) verifying claim support against passage quotes without mutating `packet.json`.
  - `packet.dsse.json`: In-toto Statement v1 envelope cryptographically signed with Ed25519 over DSSE PAE.

> [!NOTE]
> Case `A-570-967` and passage quotes are illustrative fixtures designed to exercise multi-source alias resolution, specific grade disaggregation, and limitation survival checks.

## Step-by-Step CLI Walkthrough

Run each command from this directory (or point `--dir` to it):

### 1. Build Canonical Report Packet
```bash
grainulator report packet --dir . --packet output/packet.json
```
Compiles `claims.json` and `evidence/passages/` into `output/packet.json`, verifying byte hashes, normalizing DOI/arXiv source identifiers, and merging aliased sources via Union-Find.

### 2. Run Semantic Support Evaluation
```bash
grainulator report verify-semantics --dir . --packet output/packet.json --out output/semantic-eval.json
```
Performs deterministic offline semantic support evaluation against passage quotes. Emits `grainulator.semantic-eval/v1` locked to the exact `packet_sha256` and `ledger_sha256`.

### 3. Validate Grounding & Integrity in Strict Mode
```bash
grainulator report check --dir . --packet output/packet.json --draft draft.md --semantic output/semantic-eval.json --strict
```
Validates:
- Byte and ledger integrity.
- All `[[claim:ID]]` references exist and have intact passage hashes.
- **Grounding Guard**:
  - Active risks and conflicts survive into the draft (`omitted_active_risk_or_conflict`).
  - Prose contains zero uncited quantitative/factual assertions (`uncited_checkworthy_sentence`).
  - Secondary citations meet provenance requirements.
- Sidecar semantic support confirms no cited claims are contradicted or unresolvable.

### 4. Attest Report Packet (DSSE / in-toto)
```bash
grainulator report attest --dir . --packet output/packet.json --draft draft.md --private-key keys/ed25519_private.pem --out output/packet.dsse.json
```
Creates an in-toto Statement v1 envelope over the packet and draft, signed with the Ed25519 private key.

### 5. Verify Attestation
```bash
grainulator report verify-attestation --dir . --attestation output/packet.dsse.json --public-key keys/ed25519_public.pem
```
Independently verifies the DSSE envelope signature against the public key and checks subject digests.

---

## One-Step Build & Verification

Run the bundled runner script to execute the entire pipeline end-to-end:

```bash
node build.mjs
```
