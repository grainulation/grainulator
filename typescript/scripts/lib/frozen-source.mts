/** Build only an immutable, link-checked Git snapshot with its own locked dependencies. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export function withFrozenSource<T>(
	root: string,
	revision: string,
	use: (source: string, commit: string) => T,
): T {
	const run = (program: string, args: string[], cwd = root) => {
		const result = spawnSync(program, args, {
			cwd,
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		});
		if (result.error || result.status !== 0)
			throw Error(
				`${program} failed: ${result.stderr || result.error?.message || result.status}`,
			);
		return result.stdout;
	};
	const commit = run("git", [
		"rev-parse",
		"--verify",
		revision + "^{commit}",
	]).trim();
	if (!/^[a-f0-9]{40}$/.test(commit))
		throw Error("Invalid frozen source identity");
	for (const entry of run("git", ["ls-tree", "-rz", "--full-tree", commit])
		.split("\0")
		.filter(Boolean))
		if (!/^(100644|100755) blob /.test(entry))
			throw Error("Candidate source contains a nonregular entry");
	const stage = fs.mkdtempSync(
		path.join(os.tmpdir(), "grainulator-frozen-source-"),
	);
	try {
		const archive = spawnSync("git", ["archive", "--format=tar", commit], {
			cwd: root,
			maxBuffer: 64 * 1024 * 1024,
		});
		if (archive.error || archive.status !== 0)
			throw Error("Cannot archive frozen source");
		const tar = path.join(stage, "source.tar");
		fs.writeFileSync(tar, archive.stdout, { flag: "wx" });
		const source = path.join(stage, "source");
		fs.mkdirSync(source);
		run("tar", ["-xf", tar, "-C", source]);
		// The cache is an integrity-checked download cache, never a borrowed node_modules.
		run(
			"npm",
			[
				"ci",
				"--offline",
				"--include=dev",
				"--ignore-scripts",
				"--no-audit",
				"--no-fund",
			],
			source,
		);
		run("npm", ["run", "build"], source);
		return use(source, commit);
	} finally {
		fs.rmSync(stage, { recursive: true, force: true });
	}
}
