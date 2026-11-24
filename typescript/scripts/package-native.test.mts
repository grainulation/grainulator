import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readRegular } from "../lib/runtime-assets.js";
import { readBuildBinary } from "./package-native.mjs";

test("Cargo hardlinks are copied as build inputs while installed assets reject them", () => {
	const root = fs.mkdtempSync(
		path.join(fs.realpathSync(os.tmpdir()), "grainulator-cargo-input-"),
	);
	try {
		const original = path.join(root, "deps-binary"),
			built = path.join(root, "release-binary");
		fs.writeFileSync(original, "compiled binary fixture");
		fs.linkSync(original, built);
		assert.equal(fs.statSync(built).nlink, 2);
		assert.equal(readBuildBinary(built).toString(), "compiled binary fixture");
		assert.throws(() => readRegular(built), /unlinked regular/);
		fs.symlinkSync(original, path.join(root, "symlink"));
		assert.throws(() => readBuildBinary(path.join(root, "symlink")), /Symlink/);
		assert.throws(() => readBuildBinary(root), /regular build binary/);
		assert.throws(() => readBuildBinary(built, 1), /bounded/);
		fs.writeFileSync(path.join(root, "empty"), "");
		assert.throws(() => readBuildBinary(path.join(root, "empty")), /bounded/);
		fs.unlinkSync(built);
		assert.equal(readRegular(original).toString(), "compiled binary fixture");
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("build and installed readers reject files modified during their descriptor snapshot", (t) => {
	const root = fs.mkdtempSync(
		path.join(fs.realpathSync(os.tmpdir()), "grainulator-changing-input-"),
	);
	const originalRead = fs.readSync;
	try {
		for (const reader of [readBuildBinary, readRegular]) {
			const file = path.join(root, reader.name);
			fs.writeFileSync(file, "before");
			let changed = false;
			t.mock.method(
				fs,
				"readSync",
				(
					fd: number,
					...args: [
						buffer: NodeJS.ArrayBufferView,
						offset: number,
						length: number,
						position: number | null,
					]
				) => {
					const count = originalRead(fd, ...args);
					if (!changed) {
						changed = true;
						fs.appendFileSync(file, " changed");
					}
					return count;
				},
			);
			assert.throws(() => reader(file), /changed while reading/);
			t.mock.restoreAll();
		}
	} finally {
		t.mock.restoreAll();
		fs.rmSync(root, { recursive: true, force: true });
	}
});
