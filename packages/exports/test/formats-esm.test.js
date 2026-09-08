import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FORMATS_DIR = path.join(__dirname, "..", "lib", "formats");

// Every format module in lib/formats/ must export: name, extension, convert
const REQUIRED_EXPORTS = ["name", "extension", "convert"];

// Optional but expected exports
const OPTIONAL_EXPORTS = ["mimeType", "description"];

async function run() {
  console.log("formats ESM loading tests\n");

  // Underscore-prefixed modules are shared utilities, not format converters.
  const files = fs
    .readdirSync(FORMATS_DIR)
    .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"));
  assert.ok(
    files.length > 0,
    "Expected at least one format module in lib/formats/",
  );

  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const modulePath = path.join(FORMATS_DIR, file);
    const formatName = file.replace(".mjs", "");

    try {
      const mod = await import(`file://${modulePath}`);

      // Check required exports
      for (const key of REQUIRED_EXPORTS) {
        assert.ok(
          key in mod,
          `Format "${formatName}" missing required export: ${key}`,
        );
      }

      // Validate export types
      assert.strictEqual(
        typeof mod.name,
        "string",
        `${formatName}.name should be a string`,
      );
      assert.ok(mod.name.length > 0, `${formatName}.name should not be empty`);
      assert.strictEqual(
        typeof mod.extension,
        "string",
        `${formatName}.extension should be a string`,
      );
      assert.ok(
        mod.extension.startsWith("."),
        `${formatName}.extension should start with "."`,
      );
      assert.strictEqual(
        typeof mod.convert,
        "function",
        `${formatName}.convert should be a function`,
      );

      // Check optional exports if present
      if (mod.mimeType) {
        assert.strictEqual(
          typeof mod.mimeType,
          "string",
          `${formatName}.mimeType should be a string`,
        );
      }
      if (mod.description) {
        assert.strictEqual(
          typeof mod.description,
          "string",
          `${formatName}.description should be a string`,
        );
      }

      console.log(
        `  PASS  ${formatName}: name="${mod.name}", ext="${mod.extension}"`,
      );
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${formatName}: ${err.message}`);
      failed++;
      process.exitCode = 1;
    }
  }

  console.log(
    `\n${passed} passed, ${failed} failed, ${files.length} total format modules`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
