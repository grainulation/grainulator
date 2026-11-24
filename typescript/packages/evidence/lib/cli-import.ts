import fs from "node:fs";
import { importClaims } from "./import-claims.js";
export async function run(dir: string, args: string[]) {
	const value = (flag: string) => {
		const i = args.indexOf(flag);
		return i < 0 ? undefined : args[i + 1];
	};
	if (args.includes("--help")) {
		console.log(
			"grainulator import --dir <sprint> --file <JSON-array-or-claims-document> --source <stable-document-id>",
		);
		return;
	}
	try {
		const filename = value("--file");
		// Let Node report its existing invalid-path error for a missing flag.
		const data: unknown = JSON.parse(
			fs.readFileSync(filename as string, "utf8"),
		);
		const result = importClaims(dir, {
			source: value("--source"),
			claims: Array.isArray(data)
				? data
				: (data as { claims?: unknown }).claims,
		});
		console.log(JSON.stringify(result, null, 2));
		if (result.status !== "ok") process.exitCode = 1;
	} catch (error) {
		console.error((error as Error).message);
		process.exitCode = 1;
	}
}
