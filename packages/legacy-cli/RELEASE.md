# Release playbook

This file lives in the `grainulation` umbrella repo but covers the whole
7-package ecosystem (`wheat`, `barn`, `mill`, `silo`, `harvest`,
`orchard`, `grainulation`) plus the `grainulator` plugin.

## Regular release

Every package publishes via `.github/workflows/publish.yml` on tag push.
The workflow runs tests, verifies the tag matches `package.json.version`,
and publishes with npm provenance via OIDC trusted publishing (no
`NPM_TOKEN` secret needed after the per-package setup on npmjs.com).

### Single-package patch

1. `cd <repo>`
2. `npm version patch` — bumps package.json, commits, tags `v<x.y.z>`.
3. `git push origin main --follow-tags` — pushes commit + tag.
4. Watch the Actions tab. On success, the package lands on npm with a
   "Built + Signed" badge linking back to the workflow run.

### Coordinated release (consumer depends on new internal-dep features)

When bumping `barn` and the consumers that now need the new barn APIs:

1. **Publish `barn` first.** Tag + push barn's new version.
2. **Wait for barn to appear on npm** (~60s). Verify at
   `https://www.npmjs.com/package/@grainulation/barn`.
3. In each consumer repo that needs the new barn:
   `npm install` — regenerates `package-lock.json` with the new barn
   version resolved from the registry. Commit the lockfile update.
4. Bump each consumer (`npm version patch`) and push their tags.
5. Consumers that DON'T need barn's new APIs can tag any time after
   step 2 (their lockfile still pins the older barn; `npm ci` is
   self-consistent).

Reason: CI runs `npm ci`, which fails if `package.json` and
`package-lock.json` disagree on the dep range. Publishing consumer tags
before the lockfile refresh guarantees a failed publish.

## When something goes wrong

### A bad version published (runtime crash, wrong content)

1. **`npm deprecate @grainulation/<pkg>@<version> "message pointing at fix"`**
   — this is non-destructive. Existing installs keep working; new installs
   get a warning. Use this when there's a specific user-visible bug.
2. **Ship a patch.** Bump version, fix the bug, tag, push. Most installs
   will upgrade via their caret range.
3. **`npm unpublish @grainulation/<pkg>@<version>`** — last resort. Only
   works within 72 hours of publish and only if nothing depends on that
   exact version. After unpublish you CANNOT republish that version
   number (npm blocks). Prefer deprecate-then-patch unless the published
   content is actively harmful (leaked secret, malware).

### A tag landed but CI failed

The workflow's `Install` or `Test` step failed — no tarball was
published. You can safely:

1. Fix the commit.
2. Delete the bad tag locally AND on the remote:
   `git tag -d vX.Y.Z && git push --delete origin vX.Y.Z`.
3. Re-tag the fixed commit and push again.

### Trusted-publisher auth fails with "untrusted identity"

- Double-check the npmjs.com Trusted Publisher config for the package:
  - Organization: `grainulation`
  - Repository: `<package-name>` (without the scope)
  - Workflow filename: `publish.yml`
  - Environment: leave empty (matches the workflow which doesn't
    reference a GitHub Environment)
- If `environment` is set on either side and not the other, OIDC
  auth rejects with "subject claim mismatch".

### npm registry is down

GitHub Actions retries the publish step up to its default. If the
registry is genuinely down, the workflow fails cleanly — no partial
publish. Retry after status recovery by pushing the same tag (delete
+ recreate locally, then push).

## Post-publish verification

After a successful publish, from a fresh temp directory:

```bash
mkdir /tmp/grn-verify && cd /tmp/grn-verify
npm init -y --silent
npm install @grainulation/<pkg>@<version>
npm audit signatures   # should report 1 verified signature
npx <tool> --version    # should print <version>
```

If `npm audit signatures` errors or reports "missing signatures", the
provenance flow was skipped. Investigate before announcing the release.

## Supported versions

Only the latest minor of each package receives security fixes. Older
minors may be patched at maintainer discretion. Users should stay on
the current minor of every package to get security updates.

## Release-order contract

barn does not guarantee removal of existing exports within the 1.x
major. That lets consumers use `^1.x.y` caret ranges safely. If a
major bump is needed (barn 2.0), consumer repos are updated in a
coordinated release that bumps their barn caret to `^2.0.0` in the
same patch window.

When in doubt: publish barn first, verify, then the rest.
