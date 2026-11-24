import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { completion, manpage } from "../lib/command-surface.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = {
	"share/man/man1/grainulator.1": manpage(),
	...Object.fromEntries(
		["bash", "zsh", "fish"].map((shell) => [
			`share/completions/grainulator.${shell}`,
			completion(shell),
		]),
	),
};
for (const [relative, bytes] of Object.entries(files)) {
	const file = path.join(root, relative);
	if (process.argv.includes("--check")) {
		if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== bytes)
			throw new Error(`Generated reference is stale: ${relative}`);
	} else {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, bytes);
	}
}
