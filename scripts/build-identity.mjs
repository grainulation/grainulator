// Generated from typescript/scripts/build-identity.mts; edit that source and run npm run build:types.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectBuild, portableMcpBytes } from "../lib/build-info.js";
import { command } from "./lib/local-checks.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const [inventory] = JSON.parse(
	String(
		command(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"], {
			cwd: root,
		}),
	),
);
const names = inventory.files
	.map((file) => file.path)
	.filter((name) => name !== "build-info.json")
	.sort();
const digest = crypto.createHash("sha256");
const files = {};
for (const name of names) {
	const source = fs.readFileSync(path.join(root, name));
	const bytes = [".mcp.json", "mcp.json"].includes(name)
		? portableMcpBytes(source, path.join(root, name))
		: source;
	files[name] = crypto.createHash("sha256").update(bytes).digest("hex");
	digest.update(name).update("\0").update(bytes).update("\0");
}
const source_sha256 = digest.digest("hex");
const { version } = JSON.parse(
	String(fs.readFileSync(path.join(root, "package.json"))),
);
const id = `release-${version}-${source_sha256.slice(0, 16)}`;
fs.writeFileSync(
	path.join(root, "build-info.json"),
	JSON.stringify({ schema: 1, id, version, source_sha256, files }, null, 2) +
		"\n",
);
if (!inspectBuild(root).verified)
	throw new Error("Generated identity does not match source");
console.log(
	JSON.stringify({ id, version, files: names.length, source_sha256 }),
);
