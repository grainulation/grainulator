// Generated from typescript/scripts/pack-local.mts; edit that source and run npm run build:types.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectBuild, portableMcpBytes } from "../lib/build-info.js";
import { command } from "./lib/local-checks.mjs";
// Every manifest read and rewrite stays on one opened staging inode.
function updateManifestVersion(file, version) {
	let fd;
	try {
		fd = fs.openSync(
			file,
			fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
		);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	try {
		const stat = fs.fstatSync(fd);
		if (!stat.isFile() || stat.nlink !== 1)
			throw new Error("Expected a regular staging manifest");
		const manifest = JSON.parse(String(fs.readFileSync(fd, "utf8")));
		manifest.version = version;
		const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
		let offset = 0;
		while (offset < bytes.length) {
			const count = fs.writeSync(
				fd,
				bytes,
				offset,
				bytes.length - offset,
				offset,
			);
			if (count <= 0) throw new Error("Incomplete staging manifest write");
			offset += count;
		}
		fs.ftruncateSync(fd, bytes.length);
	} finally {
		fs.closeSync(fd);
	}
}
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(
	process.argv[2] || path.join(root, ".dogfood/builds"),
);
fs.mkdirSync(output, { recursive: true });
const stage = fs.mkdtempSync(
	path.join(os.tmpdir(), "grainulator-local-build-"),
);
const [inventory] = JSON.parse(
	String(
		command(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"], {
			cwd: root,
		}),
	),
);
const sourceHash = crypto.createHash("sha256");
const names = inventory.files
	.map((f) => f.path)
	.filter((name) => name !== "build-info.json")
	.sort();
for (const name of names) {
	const source = fs.readFileSync(path.join(root, name));
	const bytes = [".mcp.json", "mcp.json"].includes(name)
		? portableMcpBytes(source, path.join(root, name))
		: source;
	sourceHash.update(name).update("\0").update(bytes).update("\0");
	const dest = path.join(stage, name);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(path.join(root, name), dest);
	if ([".mcp.json", "mcp.json"].includes(name)) fs.writeFileSync(dest, bytes);
}
const source_sha256 = sourceHash.digest("hex");
const id = `local-${source_sha256.slice(0, 16)}`;
const packageFile = path.join(stage, "package.json");
const pkg = JSON.parse(String(fs.readFileSync(packageFile, "utf8")));
const version = `${pkg.version.split("-")[0]}-local.${source_sha256.slice(0, 16)}`;
updateManifestVersion(packageFile, version);
for (const name of [
	".claude-plugin/plugin.json",
	".codex-plugin/plugin.json",
	"plugin.json",
	...fs
		.readdirSync(path.join(stage, "packages"))
		.map((name) => `packages/${name}/package.json`),
]) {
	const target = path.join(stage, name);
	updateManifestVersion(target, version);
}
const files = Object.fromEntries(
	names.map((name) => [
		name,
		crypto
			.createHash("sha256")
			.update(fs.readFileSync(path.join(stage, name)))
			.digest("hex"),
	]),
);
fs.writeFileSync(
	path.join(stage, "build-info.json"),
	JSON.stringify({ schema: 1, id, version, source_sha256, files }, null, 2) +
		"\n",
);
const verified = inspectBuild(stage);
if (!verified.verified) throw Error(JSON.stringify(verified));
const [pack] = JSON.parse(
	String(
		command(
			[
				"npm",
				"pack",
				"--ignore-scripts",
				"--json",
				"--pack-destination",
				output,
			],
			{ cwd: stage },
		),
	),
);
const archive = path.join(output, pack.filename);
const report = {
	id,
	version,
	source_sha256,
	archive,
	archive_sha256: crypto
		.createHash("sha256")
		.update(fs.readFileSync(archive))
		.digest("hex"),
	file_count: names.length,
	stage,
};
fs.writeFileSync(
	path.join(output, `${id}.json`),
	JSON.stringify(report, null, 2) + "\n",
);
fs.writeFileSync(
	path.join(output, "latest.json"),
	JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
