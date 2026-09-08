/**
 * Integration test: wheat CLI entrypoint
 *
 * Verifies that `bin/wheat.js` responds correctly to:
 *   - --help (shows usage text)
 *   - --version (shows version string)
 *   - unknown command (exits non-zero)
 *
 * Uses node:test + node:assert — zero dependencies.
 */

import { describe, it } from "node:test";
import "./cli-help.test.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WHEAT_BIN = path.resolve(__dirname, "..", "bin", "wheat.js");
const PKG = JSON.parse(
	readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"),
);

describe("wheat CLI", () => {
	it("--help outputs usage text with expected commands", () => {
		const output = execFileSync(process.execPath, [WHEAT_BIN, "--help"], {
			encoding: "utf8",
			timeout: 5_000,
		});

		assert.ok(output.includes("Grainulator"), "help should name Grainulator");
		assert.ok(!output.includes("@grainulation/wheat"), "help should not advertise the legacy package");
		assert.ok(output.includes("Usage:"), "help should include Usage section");
		assert.ok(output.includes("init"), "help should list init command");
		assert.ok(output.includes("compile"), "help should list compile command");
		assert.ok(output.includes("guard"), "help should list guard command");
		assert.ok(output.includes("status"), "help should list status command");
		assert.ok(output.includes("--dir"), "help should mention --dir flag");
	});

	it("-h is an alias for --help", () => {
		const output = execFileSync(process.execPath, [WHEAT_BIN, "-h"], {
			encoding: "utf8",
			timeout: 5_000,
		});
		assert.ok(output.includes("Usage:"), "-h should show help");
	});

	it("no arguments shows help", () => {
		const output = execFileSync(process.execPath, [WHEAT_BIN], {
			encoding: "utf8",
			timeout: 5_000,
		});
		assert.ok(output.includes("Usage:"), "no args should show help");
	});

	it("--version outputs correct version from package.json", () => {
		const output = execFileSync(process.execPath, [WHEAT_BIN, "--version"], {
			encoding: "utf8",
			timeout: 5_000,
		});
		assert.ok(
			output.trim().includes(PKG.version),
			`version output "${output.trim()}" should include "${PKG.version}"`,
		);
	});

	it("-v is an alias for --version", () => {
		const output = execFileSync(process.execPath, [WHEAT_BIN, "-v"], {
			encoding: "utf8",
			timeout: 5_000,
		});
		assert.ok(output.trim().includes(PKG.version), "-v should show version");
	});

	it("unknown flag exits non-zero", () => {
		assert.throws(() => {
			execFileSync(process.execPath, [WHEAT_BIN, "--nonexistent"], {
				encoding: "utf8",
				timeout: 5_000,
				stdio: "pipe",
			});
		}, "unknown flag should exit non-zero");
	});

	it("legacy verb-less mode initializes only its isolated fixture", (t) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "grainulator-legacy-cli-"));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    execFileSync(process.execPath, [WHEAT_BIN, "nonexistent", "--dir", dir], {cwd:dir, encoding:"utf8", timeout:5000, stdio:"pipe"});
    assert.equal(JSON.parse(readFileSync(path.join(dir,"claims.json"),"utf8")).meta.question,"nonexistent");
  });
});
