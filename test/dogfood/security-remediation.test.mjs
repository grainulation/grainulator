import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { convert as bibtex } from "../../packages/exports/lib/formats/bibtex.mjs";
import { convert as obsidian } from "../../packages/exports/lib/formats/obsidian.mjs";
import { convert as site } from "../../packages/exports/lib/formats/static-site.mjs";
import { FetchCache } from "../../packages/memory/lib/fetch-cache.js";
import { Store } from "../../packages/memory/lib/store.js";
import { Templates } from "../../packages/memory/lib/templates.js";
import { atomicWrite } from "../../packages/shared/lib/atomic.js";
import {
	appendRegularFile,
	readRegularFile,
	tryReadStaticFile,
	writeNewFile,
} from "../../packages/shared/lib/fs-safe.cjs";
import {
	decodeEntities,
	htmlText,
	withoutElements,
} from "../../packages/shared/lib/html.cjs";
import { withFileTransaction } from "../../packages/shared/lib/transaction.js";

const require = createRequire(import.meta.url);
const {
	htmlToMarkdown,
} = require("../../packages/exports/lib/exporters/markdown.js");
function fixture(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-security-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}

test("all writers preserve files targeted by the old predictable temp symlinks", (t) => {
	const dir = fixture(t),
		now = Date.now;
	Date.now = () => 123456789;
	try {
		for (const [name, write, suffix] of [
			[
				"esm",
				(f) => atomicWrite(f, "new"),
				`.tmp.${process.pid}.${Date.now()}`,
			],
			[
				"cjs",
				(f) =>
					require("../../packages/shared/lib/atomic.cjs").atomicWrite(f, "new"),
				`.tmp.${process.pid}.${Date.now()}`,
			],
			[
				"store",
				(f) => new Store(dir)._writeJSON(f, { new: true }),
				`.tmp.${process.pid}`,
			],
			[
				"cache",
				(f) => new FetchCache({ dir })._writeFile(f, "new"),
				`.tmp.${process.pid}.${Date.now()}`,
			],
		]) {
			const file = path.join(dir, name),
				victim = `${file}.victim`;
			fs.writeFileSync(victim, "original");
			fs.symlinkSync(victim, file + suffix);
			write(file);
			assert.equal(fs.readFileSync(victim, "utf8"), "original");
			assert.equal(fs.lstatSync(file).isSymbolicLink(), false);
			assert.equal(fs.lstatSync(file + suffix).isSymbolicLink(), true);
		}
		const templates = new Templates({});
		templates.get = () => ({
			id: "fixture",
			question: "Question?",
			seedClaims: [{ content: "evidence" }],
		});
		for (const name of ["claims.json", "sprint.json"]) {
			fs.writeFileSync(path.join(dir, `${name}.victim`), "original");
			fs.symlinkSync(
				path.join(dir, `${name}.victim`),
				path.join(dir, `${name}.tmp.${process.pid}`),
			);
		}
		templates.instantiate("fixture", dir);
		for (const name of ["claims.json", "sprint.json"]) {
			assert.equal(
				fs.readFileSync(path.join(dir, `${name}.victim`), "utf8"),
				"original",
			);
			assert.equal(fs.lstatSync(path.join(dir, name)).isSymbolicLink(), false);
		}
	} finally {
		Date.now = now;
	}
});

test("atomic replacement preserves the old target on rename failure and cleans owned temp files", (t) => {
	const dir = fixture(t),
		target = path.join(dir, "existing-directory");
	fs.mkdirSync(target);
	fs.writeFileSync(path.join(target, "keep"), "original");
	assert.throws(() => atomicWrite(target, "new"));
	assert.equal(fs.readFileSync(path.join(target, "keep"), "utf8"), "original");
	assert.deepEqual(fs.readdirSync(dir), ["existing-directory"]);
});

test("new and append operations do not overwrite or follow existing links", (t) => {
	const dir = fixture(t),
		file = path.join(dir, "file"),
		link = path.join(dir, "link");
	writeNewFile(file, "original");
	fs.symlinkSync(file, link);
	assert.throws(() => writeNewFile(file, "overwrite"), { code: "EEXIST" });
	assert.throws(() => writeNewFile(link, "overwrite"), { code: "EEXIST" });
	assert.throws(() => appendRegularFile(link, "overwrite"));
	appendRegularFile(file, " appended");
	assert.equal(readRegularFile(file, "utf8"), "original appended");
});

test("static reads enforce real containment, type, and size while supporting internal links", (t) => {
	const dir = fixture(t),
		root = path.join(dir, "public");
	fs.mkdirSync(root);
	const file = path.join(root, "ok.txt"),
		secret = path.join(dir, "private.txt");
	fs.writeFileSync(file, "hello");
	fs.writeFileSync(secret, "secret");
	fs.symlinkSync(secret, path.join(root, "escape"));
	fs.symlinkSync(file, path.join(root, "internal"));
	assert.equal(tryReadStaticFile(root, path.join(root, "escape")), null);
	assert.equal(
		tryReadStaticFile(root, path.join(root, "internal")).toString(),
		"hello",
	);
	assert.equal(tryReadStaticFile(root, root), null);
	assert.throws(() => readRegularFile(file, "utf8", 4), /size/);
	assert.throws(() => readRegularFile(path.join(root, "internal")));
});

test("transactions do not take an old lock from another writer or run unlocked", (t) => {
	const dir = fixture(t),
		file = path.join(dir, "index.json");
	fs.mkdirSync(`${file}.lock`);
	fs.writeFileSync(path.join(`${file}.lock`, "owner.json"), "other");
	fs.utimesSync(`${file}.lock`, new Date(0), new Date(0));
	let ran = false;
	assert.throws(
		() =>
			withFileTransaction(
				file,
				() => {
					ran = true;
				},
				{ timeoutMs: 0 },
			),
		{ code: "E_LEDGER_BUSY" },
	);
	assert.equal(ran, false);
	assert.equal(
		fs.readFileSync(path.join(`${file}.lock`, "owner.json"), "utf8"),
		"other",
	);
});

test("exported YAML scalars preserve hostile metadata as one quoted value", () => {
	const value = 'safe\\"\ninjected: true\n#\r\t';
	const markdown = obsidian({
		meta: { sprint: value, question: value, audience: value },
		claims: [],
	});
	const front = markdown.split("---\n")[1].trim().split("\n");
	for (const key of ["sprint", "question", "audience"])
		assert.equal(
			JSON.parse(
				front.find((line) => line.startsWith(`${key}: `)).slice(key.length + 2),
			),
			value,
		);
	assert.equal(front.length, 5);
	const config = JSON.parse(
		site({ meta: { sprint: value, question: value }, claims: [] }),
	).files["config.yaml"];
	assert.equal(
		JSON.parse(
			config
				.split("\n")
				.find((line) => line.startsWith("title: "))
				.slice(7),
		),
		value,
	);
	assert.ok(!config.split("\n").some((line) => line.startsWith("injected:")));
});

test("HTML conversion retains supported formatting without activating encoded HTML or unsafe URLs", () => {
	const result = htmlToMarkdown(
		'<h2>Heading</h2><p>&lt;img src=x onerror=alert(1)&gt;</p><a href="jav&#x61;script:alert(1)">bad</a><a href="https://example.com/a(b)">good</a><img src="pic.png" alt="photo"><pre><code>```\n&lt;tag&gt;</code></pre>',
	);
	assert.ok(result.includes("## Heading"));
	assert.ok(result.includes("\\<img"));
	assert.ok(!result.includes("](javascript:"));
	assert.ok(result.includes("[good](https://example.com/a%28b%29)"));
	assert.ok(result.includes("![photo](pic.png)"));
	assert.ok(result.includes("````\n```\n<tag>\n````"));
	assert.ok(
		!htmlToMarkdown("<script >bad</script ><p>Good</p>").includes("bad"),
	);
	assert.equal(htmlText('<b title="x > y">hello</b>'), "hello");
	assert.equal(
		withoutElements('<script src="app.js">bad</script>', ["script"], {
			keepTags: true,
		}),
		'<script src="app.js"></script>',
	);
});

test("entity and BibTeX escaping each transform input only once", () => {
	assert.equal(decodeEntities("&amp;lt;tag&amp;gt;"), "&lt;tag&gt;");
	assert.equal(decodeEntities("&#x1f600;"), "😀");
	const result = bibtex({
		claims: [{ id: "test", content: "C:\\test $x & y" }],
	});
	assert.ok(result.includes("C:\\textbackslash{}test \\$x \\& y"));
	assert.ok(!result.includes("\\textbackslash\\{\\}"));
});
