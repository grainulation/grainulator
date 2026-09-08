/**
 * wheat update — Copy/update slash commands to .claude/commands/wheat/
 *
 * Copies command templates from the installed package into the user's
 * .claude/commands/wheat/ directory. Existing files can be overwritten with --force.
 *
 * Zero npm dependencies.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function packageRoot() {
	return path.resolve(__dirname, "..");
}

export async function run(dir, args) {
	const force = args.includes("--force");
	const srcDir = path.join(packageRoot(), "templates", "commands");
	const destDir = path.join(dir, ".claude", "commands", "wheat");

	fs.mkdirSync(destDir, { recursive: true });

	let files;
	try {
		files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md"));
	} catch (err) {
		console.error(`Cannot read command templates: ${err.message}`);
		process.exit(1);
	}

	console.log();
	console.log(`  Updating .claude/commands/wheat/ (${files.length} commands)`);
	console.log();

	let updated = 0;
	let skipped = 0;

	for (const file of files) {
		const src = path.join(srcDir, file);
		const dest = path.join(destDir, file);

		if (fs.existsSync(dest) && !force) {
			// Check if content differs
			const srcContent = fs.readFileSync(src, "utf8");
			const destContent = fs.readFileSync(dest, "utf8");
			if (srcContent !== destContent) {
				console.log(
					`  \x1b[33m~\x1b[0m ${file} (differs, use --force to overwrite)`,
				);
				skipped++;
			} else {
				console.log(`  \x1b[2m= ${file} (up to date)\x1b[0m`);
			}
			continue;
		}

		fs.copyFileSync(src, dest);
		console.log(`  \x1b[32m+\x1b[0m ${file}`);
		updated++;
	}

	console.log();
	console.log(`  ${updated} updated, ${skipped} skipped`);
	if (skipped > 0 && !force) {
		console.log('  Run "wheat update --force" to overwrite all');
	}
	console.log();
}
