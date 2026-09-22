import fs from "node:fs";
import { importClaims } from "./import-claims.js";
export async function run(dir, args) {
	const value = (flag) => {
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
		const data = JSON.parse(fs.readFileSync(value("--file"), "utf8"));
		const result = importClaims(dir, {
			source: value("--source"),
			claims: Array.isArray(data) ? data : data.claims,
		});
		console.log(JSON.stringify(result, null, 2));
		if (result.status !== "ok") process.exitCode = 1;
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
