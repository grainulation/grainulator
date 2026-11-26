# Release Grainulator 3

A v3 release consists of one portable CLI/plugin archive, four separately
verified native runtime archives, a separately selected offline converter,
a release manifest and checksums. The base archive is a public GitHub release asset. The root npm package and
component workspaces remain private and are not published to the npm registry.

The candidate workflow builds from one immutable Git commit. It exercises the
same base archive and exact recorded build ID on Node 24 and 26, runs an
isolated inspect/apply/verify/rollback smoke test from the packaged converter,
and runs each native archive on its own
OS/CPU runner. It does not tag or publish. Passing a cross-build alone is not
platform acceptance. Homebrew formula changes and channel acceptance belong
to the separate [shared tap](https://github.com/grainulation/homebrew).

## Prepare candidates

Build the checkout with `npm ci --ignore-scripts` and `npm run build`, then commit the intended TypeScript/configuration source first; compiled output stays ignored. The base and converter packagers extract committed Git source, install that snapshot's exact lockfile with scripts disabled, and compile it before selecting artifact bytes. The npm download cache must contain the locked build dependencies (`npm ci --ignore-scripts` in the source checkout primes it). Neither packager borrows caller node_modules or generated output. The base packager reads the resulting frozen bytes,
so uncommitted changes cannot silently enter an identified candidate:

    mkdir -p dist
    node scripts/package-release.mjs --revision HEAD --out dist/base
    node scripts/package-migration.mjs --revision HEAD --out dist/migration

Native candidate jobs compile with the locked Rust toolchain and package each
target through scripts/package-native.mjs. The targets are:

| Platform | Rust target |
| --- | --- |
| macOS ARM64 | aarch64-apple-darwin |
| macOS x86_64 | x86_64-apple-darwin |
| Linux ARM64 | aarch64-unknown-linux-musl |
| Linux x86_64 | x86_64-unknown-linux-musl |

Native support, Homebrew support and full agent-host support are separate
matrices. Only advertise tuples whose actual installed behavior passed. A
musl-native executable does not remove the JS CLI's Node/Homebrew host
requirements. Intel macOS native archives do not establish a supported Brew
installation.

Download all four passing native candidate outputs from the same workflow
source identity, then assemble their exact bytes:

    node scripts/assemble-release.mjs \
      --base-record dist/base/base-record.json \
      --migration-record dist/migration/migration-record.json \
      --asset-record candidates/aarch64-apple-darwin/asset-record.json \
      --asset-record candidates/x86_64-apple-darwin/asset-record.json \
      --asset-record candidates/aarch64-unknown-linux-musl/asset-record.json \
      --asset-record candidates/x86_64-unknown-linux-musl/asset-record.json \
      --out dist/release

Assembly refuses duplicate/missing targets, dirty source, changed bytes and
mismatched source/version identity. It binds each native metadata digest in the
release manifest. Keep that manifest's SHA-256 from an independently reviewed
source; an archive and an adjacent self-consistent checksum cannot authenticate
each other.

## Verify the release inventory

Recheck all attachments against the independently reviewed manifest digest:

    node scripts/verify-release.mjs \
      --directory dist/release \
      --manifest-sha256 REVIEWED_MANIFEST_SHA256 \
      --version REVIEWED_RELEASE_VERSION \
      --source-commit REVIEWED_SOURCE_COMMIT

This verifies the base, four native archives, separate converter and exact
checksum inventory. Adding an unexpected attachment, changing archive bytes or
rewriting adjacent checksums cannot replace the independently carried pin.

## Homebrew distribution boundary

[grainulation/homebrew](https://github.com/grainulation/homebrew) owns the checked-in
formulae, reviewed recipe installation, upgrades and package-manager cleanup checks.
Formula updates are a separate reviewed change; there is no automatic formula
generator or private-prefix candidate workflow in the supported release process.

Grainulator owns the portable application, matching native archives and release manifest consumed by that channel. Keep the stable
installation instructions pointed at the tap; removing product-repository
Homebrew tooling does not remove installation through Homebrew.

The tap already checks reviewed recipes, fresh public-main installs and an
upgrade with user-data preservation and a stable MCP launcher on macOS ARM64.
Those are the tap's current acceptance jobs. The Grainulator candidate workflow
does not depend on unpublished local transfer scripts or claim private-prefix
recipe acceptance. Record the reviewed tap revision, release source commit and
manifest pin with distribution acceptance; application CI does not establish
Homebrew channel acceptance.

Required native hooks use a separate explicit user-cache installation and
per-enrollment release receipt. They must survive package upgrades, cleanup and
removal without relying on the package manager's Node or a disappearing keg.
Package installation never enrolls, updates or detaches host hooks.

## Publish after approval

Only after source, conversion, native and installed-package checks pass, obtain
release authorization and push the reviewed v3 tag. The
release workflow reruns required checks, binds the exact candidate source to
the tag, verifies checksums and attaches the passing bytes. It refuses to
overwrite an existing release and compares the live, peeled remote tag commit
with the frozen source immediately before creating the release. Keep release
tags immutable: that live check does not make a concurrently mutable tag atomic. Never rebuild or move a published tag merely to
include a generated formula or its own archive hashes.

Update the formula separately in
[grainulation/homebrew](https://github.com/grainulation/homebrew) after immutable
release assets exist:

1. Download the release attachments and obtain the approved manifest SHA-256
   independently. Run `scripts/verify-release.mjs` from this source checkout with
   that pin, the release version and source commit, as shown above.
2. In the tap's `Formula/grainulator.rb`, update the version and frozen source
   comment, base archive URL and SHA-256, manifest resource URL and SHA-256,
   all four native resource URLs and SHA-256 values, and the manifest pin in the
   install receipt. Copy these values from the verified manifest and attachment
   hashes. Preserve the explicit Node launcher, immutable application bytes and
   retained-runtime behavior; do not substitute moving source branches.
3. Update the expected Grainulator version in the tap's reviewed/public install
   matrix. Advance the upgrade fixture deliberately: its previous formula commit,
   digest and expected old version must refer to an existing immutable published
   release, while the new expected version must match the reviewed formula.
4. Run Ruby syntax checks and the tap's reviewed recipe/upgrade CI. After that
   separate change reaches tap `main`, verify its fresh public-main installation.
   Keep the tap commit and logs with the distribution acceptance record.

No product-repository Ruby generator or unmerged local tooling is required.
This repository has no homebrew- prefix, so installation requires the explicit tap URL:

    brew tap grainulation/homebrew https://github.com/grainulation/homebrew

Do not advertise a stable Grainulator Brew installation until the formula's
public immutable asset URLs exist and a fresh fully qualified install/test
passes. The first public upgrade check needs two published versions; simulate
A-to-B upgrade, cleanup, hook retention and rollback with frozen fixtures
before the initial release. A tap delay must not force rebuilding a reviewed
base release.

Updating CLI source, updating a plugin catalog, reinstalling an actual plugin
cache, and restarting a running host are different actions. Record build IDs
for the loaded artifacts and test native discovery separately from direct
MCP. Candidate logs and mock-provider checks do not establish model quality
or real external provider behavior.

Before activating a public marketplace update, resolve its advertised release tag from the public remote and verify its peeled commit equals the approved release source. Confirm the matching CLI assets and manifest are publicly available. Recheck a fresh tagged-source plugin with that CLI. Keep source-install and verification examples tied to the selected published release; do not reuse a green PR manifest after a different merge SHA.
