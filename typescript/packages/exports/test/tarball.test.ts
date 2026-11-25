import moduleUrl = require("node:url");
// Package inventory covers retained CLI/MCP/report resources and excludes retired apps.
import assert = require("node:assert/strict");
import importedModule1 = require("node:child_process");
const { execFileSync } = importedModule1;
import importedModule2 = require("node:fs");
const { existsSync, mkdirSync, mkdtempSync } = importedModule2;
import importedModule3 = require("node:os");
const { tmpdir } = importedModule3;
import path = require("node:path");
import importedModule4 = require("node:test");
const { test } = importedModule4;

const REQUIRED_PATHS = [
	"package/lib/formats/markdown.mjs",
	"package/lib/serve-mcp.js",
	"package/bin/exports.js",
	"package/package.json",
	"package/LICENSE",
];
const RETIRED_PATHS = [
	"lib/exporters/pdf-worker.js",
	"lib/exporters/pdf.js",
	"lib/publishers/static.js",
	"lib/formats/html-report.mjs",
	"lib/formats/executive-summary.mjs",
	"lib/formats/slide-deck.mjs",
	"lib/formats/static-site.mjs",
	"public/index.html",
	"lib/server.js",
	"lib/server.mjs",
];
const PKG_ROOT = new URL("..", moduleUrl.pathToFileURL(__filename).href);

test("npm pack includes retained runtime resources and excludes retired browser apps", () => {
	const [packed]: { files: { path: string }[] }[] = JSON.parse(
		execFileSync("npm", ["pack", "--dry-run", "--json"], {
			cwd: PKG_ROOT,
			encoding: "utf8",
		}),
	);
	const files = new Set(
		packed!.files.map((file) => file.path.replace(/^package\//, "")),
	);
	for (const required of REQUIRED_PATHS)
		assert.ok(
			files.has(required.replace(/^package\//, "")),
			`missing from tarball: ${required}`,
		);
	for (const retired of RETIRED_PATHS)
		assert.equal(
			files.has(retired),
			false,
			`retired browser app shipped: ${retired}`,
		);
	assert.equal(
		[...files].some((file) => file.startsWith("site/")),
		false,
		"marketing sources belong to infra",
	);
});

test("actual tarball preserves every retained entry without browser dashboard files", () => {
	const packedDir = mkdtempSync(
		path.join(tmpdir(), "grainulator-component-pack-"),
	);
	const filename = execFileSync(
		"npm",
		["pack", "--pack-destination", packedDir, "--silent"],
		{
			cwd: PKG_ROOT,
			encoding: "utf8",
		},
	).trim();
	const extracted = path.join(packedDir, "extracted");
	mkdirSync(extracted);
	execFileSync("tar", ["xzf", path.join(packedDir, filename), "-C", extracted]);
	for (const required of REQUIRED_PATHS)
		assert.ok(
			existsSync(path.join(extracted, required)),
			`missing extracted runtime resource: ${required}`,
		);
	for (const retired of RETIRED_PATHS)
		assert.equal(
			existsSync(path.join(extracted, "package", retired)),
			false,
			`retired app present: ${retired}`,
		);
});
