# Release Grainulator 3

A v3 release consists of one portable CLI/plugin archive, four separately
verified native runtime archives, a separately selected offline converter,
a release manifest and checksums. The base archive is a public GitHub release asset. The root npm package and
component workspaces remain private and are not published to the npm registry.

The candidate workflow builds from one immutable Git commit. It exercises the
same base archive on Node24 and26, runs each native archive on its own OS/CPU
runner, and tests the generated Homebrew recipe in a private prefix. It does
not tag or publish. Passing a cross-build alone is not platform acceptance.

## Prepare candidates

Commit the intended source first. The base packager reads committed Git bytes,
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

    node scripts/homebrew-release.mjs \
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

## Verify the Homebrew recipe

Use the independently reviewed manifest digest, never a placeholder:

    node scripts/homebrew-formula.mjs \
      --manifest dist/release/release-manifest.json \
      --manifest-sha256 REVIEWED_MANIFEST_SHA256 \
      --artifacts dist/release \
      --out /absolute/new-grainulator.rb

On an actual supported native Brew host with Node24 already available:

    node scripts/homebrew-check.mjs \
      --formula /absolute/new-grainulator.rb \
      --release-dir /absolute/dist/release \
      --manifest-sha256 REVIEWED_MANIFEST_SHA256 \
      --brew /absolute/path/to/brew

This creates a temporary owned tap and private prefix, loads the registered
formula through Homebrew's real Ruby DSL, and runs credential-free installed
tests. It supplies the caller's existing Node24 as the declared dependency; it
does not install dependencies or a global keg and is not proof of a fresh
public-network install. Homebrew may initialize its own pinned formula-test
gems, just as brew test does.

The formula keeps the base tree byte-identical. Its wrapper selects Homebrew's
Node24 explicitly and the matching native asset from that exact keg; it does
not use another Node or native executable found on PATH. Brew-owned MCP config
uses the stable opt product launcher and needs deliberate removal/rebinding if
the formula is uninstalled.

Required native hooks use a separate explicit user-cache installation and
per-enrollment release receipt. They must survive Brew upgrades, cleanup and
removal without relying on Brew Node or a disappearing keg. Package install
never enrolls, updates or detaches host hooks.

## Publish after approval

Only after source, conversion, native, package, browser and candidate recipe
checks pass, obtain release authorization and push the reviewed v3 tag. The
release workflow reruns required checks, binds the exact candidate source to
the tag, verifies checksums and attaches the passing bytes. It refuses to
overwrite an existing release. Never rebuild or move a published tag merely to
include a generated formula or its own archive hashes.

Advance the generated formula separately in
[grainulation/homebrew](https://github.com/grainulation/homebrew). This repository
has no homebrew- prefix, so installation requires the explicit tap URL:

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
