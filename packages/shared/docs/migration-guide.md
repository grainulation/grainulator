# Migration Guide — Grainulation v1 Ecosystem

> Addresses blind spots r042/r059: no migration path defined for schema_version bumps.

## Scope

This guide defines how schema versioning works across grainulation tools, when to bump versions, how to write migrations, and what backward compatibility window is supported.

## 1. How schema_version Works

Each grainulation data format includes a `schema_version` field at the top level:

### claims.json

```json
{
  "schema_version": "1.0",
  "meta": { ... },
  "claims": [ ... ]
}
```

### compilation.json

```json
{
  "schema_version": "1.0",
  "compiled_at": "...",
  "certificate": { ... },
  "claims": [ ... ],
  "conflicts": [ ... ]
}
```

### Tool manifests (package.json extensions)

```json
{
  "grainulation": {
    "schema_version": "1.0",
    "tool": "wheat",
    "port": 9092,
    "ui": "public/index.html"
  }
}
```

### Silo knowledge packs

```json
{
  "schema_version": "1.0",
  "name": "architecture",
  "claims": [ ... ]
}
```

### Version format

`schema_version` uses semver-like `MAJOR.MINOR`:

- **MAJOR**: breaking changes (fields removed, renamed, or retyped)
- **MINOR**: additive changes (new optional fields, new enum values)

Minor bumps do not require migration. Major bumps do.

## 2. When to Bump

### Bump MINOR (no migration needed)

- Adding a new optional field to claims (e.g., adding `priority` alongside existing fields)
- Adding a new claim type to the enum (e.g., adding `"decision"` to the type list)
- Adding a new evidence tier
- Adding new optional sections to compilation.json

### Bump MAJOR (migration required)

- Removing or renaming a field (e.g., `content` becomes `body`)
- Changing a field's type (e.g., `tags` from comma-separated string to array)
- Changing the structure of nested objects (e.g., `source` object shape changes)
- Changing the meaning of existing enum values
- Changing the compilation.json certificate format

### Examples

| Change                                  | Version bump | Migration? |
| --------------------------------------- | ------------ | ---------- |
| Add optional `priority` field to claims | 1.0 -> 1.1   | No         |
| Add `"decision"` claim type             | 1.0 -> 1.1   | No         |
| Rename `content` to `body`              | 1.0 -> 2.0   | Yes        |
| Change `tags` from string to array      | 1.0 -> 2.0   | Yes        |
| Add `resolved_at` timestamp field       | 1.0 -> 1.1   | No         |
| Change certificate hash algorithm       | 1.0 -> 2.0   | Yes        |

## 3. Migration Pattern

### Each tool ships a migrate.js

Every tool that reads grainulation data formats must include a `migrate.js` (or equivalent) in its package. This file handles all format transformations.

### Structure

```javascript
#!/usr/bin/env node
/**
 * Migration script for @grainulation/<tool>
 * Reads old format, writes new format.
 *
 * Usage:
 *   node migrate.js claims.json          # migrate in place
 *   node migrate.js claims.json --dry-run  # show what would change
 *   node migrate.js claims.json --backup   # create claims.json.bak first
 */

import { readFileSync, writeFileSync } from "fs";

const CURRENT_VERSION = "1.0";

const migrations = {
  // Each key is "fromVersion -> toVersion"
  // Each value is a function that transforms the data
  "1.0 -> 2.0": (data) => {
    // Example: rename content to body
    return {
      ...data,
      schema_version: "2.0",
      claims: data.claims.map((claim) => ({
        ...claim,
        body: claim.content,
        content: undefined,
      })),
    };
  },
};

function detectVersion(data) {
  return data.schema_version || "1.0";
}

function migrate(data, targetVersion) {
  let current = detectVersion(data);
  let result = { ...data };

  while (current !== targetVersion) {
    const key = Object.keys(migrations).find((k) =>
      k.startsWith(current + " ->"),
    );
    if (!key) {
      throw new Error(
        `No migration path from ${current} to ${targetVersion}. ` +
          `Available migrations: ${Object.keys(migrations).join(", ")}`,
      );
    }
    result = migrations[key](result);
    current = detectVersion(result);
  }

  return result;
}

export { migrate, detectVersion, CURRENT_VERSION };

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node migrate.js <file> [--dry-run] [--backup]");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const backup = process.argv.includes("--backup");

  const raw = readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  const fromVersion = detectVersion(data);

  if (fromVersion === CURRENT_VERSION) {
    console.log(`Already at version ${CURRENT_VERSION}, nothing to migrate.`);
    process.exit(0);
  }

  console.log(`Migrating from ${fromVersion} to ${CURRENT_VERSION}...`);
  const migrated = migrate(data, CURRENT_VERSION);

  if (dryRun) {
    console.log("Dry run — no files modified.");
    console.log(JSON.stringify(migrated, null, 2));
  } else {
    if (backup) {
      writeFileSync(file + ".bak", raw);
      console.log(`Backup written to ${file}.bak`);
    }
    writeFileSync(file, JSON.stringify(migrated, null, 2) + "\n");
    console.log(`Migration complete: ${file}`);
  }
}
```

### Rules for migration scripts

1. Migrations must be deterministic — same input always produces same output.
2. Migrations must be chainable — if a user is on v1 and current is v3, run v1->v2 then v2->v3.
3. Migrations must preserve all data — no silent data loss.
4. Always offer `--dry-run` to preview changes.
5. Always offer `--backup` to create a backup before modifying.
6. Log what changed to stdout.

## 4. Backward Compatibility Window

### Support N and N-1

Each tool must support the current schema version and the immediately previous version:

- If the current version is 2.0, the tool must read both 2.0 and 1.0 formats.
- Reading an older format should work transparently (tool auto-upgrades in memory, does not modify the file).
- Writing always uses the current version.

### Auto-upgrade in memory

When a tool reads an older format, it applies migrations in memory:

```javascript
function loadClaims(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const version = detectVersion(raw);

  if (version === CURRENT_VERSION) {
    return raw;
  }

  // Auto-upgrade in memory (does not modify file)
  console.warn(
    `Warning: ${filePath} uses schema version ${version}, ` +
      `current is ${CURRENT_VERSION}. Run 'node migrate.js ${filePath}' to upgrade.`,
  );
  return migrate(raw, CURRENT_VERSION);
}
```

### Version too new

If a tool encounters a schema version newer than it supports, it must warn and exit gracefully:

```javascript
if (majorVersion(version) > majorVersion(CURRENT_VERSION)) {
  console.error(
    `Error: ${filePath} uses schema version ${version}, ` +
      `but this tool only supports up to ${CURRENT_VERSION}. ` +
      `Please update @grainulation/${toolName} to the latest version.`,
  );
  process.exit(1);
}
```

## 5. Detection and Warnings

### On tool startup

Every tool's `serve` command should:

1. Read the claims/data file.
2. Check `schema_version`.
3. If version is older than current: log a warning, auto-upgrade in memory, continue.
4. If version is newer than supported: log an error, suggest updating the tool, exit.
5. If version matches: proceed normally (no log noise).

### On compilation

The wheat compiler should:

1. Validate `schema_version` in claims.json before compiling.
2. Include `schema_version` in the compilation certificate.
3. Refuse to compile if the schema version is unsupported (too old or too new).

### On cross-tool communication

When tools exchange data (e.g., silo importing from mill, harvest reading from wheat):

1. Include `schema_version` in all API responses.
2. Receiving tool checks version compatibility before processing.
3. If incompatible, return a clear error message with upgrade instructions.

## 6. Version History

| Version | Date       | Changes                    |
| ------- | ---------- | -------------------------- |
| 1.0     | 2026-03-15 | Initial schema (v1 launch) |

## Changelog

| Date       | Change                              |
| ---------- | ----------------------------------- |
| 2026-03-15 | Initial guide (addresses r042/r059) |
