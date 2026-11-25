/** Compile canonical TypeScript in isolation and govern every generated runtime artifact. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ModuleKind = "esm" | "cjs";
interface ModuleMapping {
	source: string;
	output: string;
	module: ModuleKind;
}
interface OutputManifest {
	schema: "grainulator.typescript.outputs/v1";
	modules: ModuleMapping[];
}

const root = path.resolve(
	fileURLToPath(
		new URL(
			import.meta.url.endsWith(".mts") ? "../../" : "../",
			import.meta.url,
		),
	),
);
const canonical = path.join(root, "typescript");
const manifestPath = path.join(canonical, "outputs.json");
const mode = process.argv[2];
if (
	!["--write", "--check", "--update-inventory", "--check-inventory"].includes(
		mode ?? "",
	) ||
	process.argv.length !== 3
) {
	throw new Error(
		"Usage: node typescript/scripts/typescript-build.mts --write|--check|--update-inventory|--check-inventory",
	);
}
const ignored = new Set([
	"node_modules",
	".git",
	".dogfood",
	"target",
	"coverage",
	".cache",
	".irrigator",
]);
const runtimeExtension = /\.(?:js|mjs|cjs)$/;
const sourceExtension = /\.(?:ts|mts|cts)$/;
const declarationExtension = /\.d\.(?:ts|mts|cts)$/;
const slash = (value: string): string => value.split(path.sep).join("/");
const relative = (value: string): string => slash(path.relative(root, value));
const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

function walk(
	directory: string,
	visit: (file: string, entry: fs.Dirent) => void,
): void {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (ignored.has(entry.name)) continue;
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) walk(file, visit);
		else visit(file, entry);
	}
}
function json(file: string): unknown {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}
function moduleKind(file: string, boundary: string): ModuleKind {
	if (file.endsWith(".mjs") || file.endsWith(".mts")) return "esm";
	if (file.endsWith(".cjs") || file.endsWith(".cts")) return "cjs";
	let directory = path.dirname(file);
	while (directory === boundary || directory.startsWith(boundary + path.sep)) {
		const metadata = path.join(directory, "package.json");
		if (fs.existsSync(metadata)) {
			const data = json(metadata);
			if (!record(data))
				throw new Error(`Invalid package metadata: ${relative(metadata)}`);
			return data.type === "module" ? "esm" : "cjs";
		}
		if (directory === boundary) break;
		directory = path.dirname(directory);
	}
	const metadata = json(path.join(root, "package.json"));
	return record(metadata) && metadata.type === "module" ? "esm" : "cjs";
}
function mappings(): ModuleMapping[] {
	const modules: ModuleMapping[] = [];
	walk(canonical, (file, entry) => {
		if (!sourceExtension.test(file) || declarationExtension.test(file)) return;
		assert.ok(
			entry.isFile(),
			`Canonical source must be a regular file: ${relative(file)}`,
		);
		const source = relative(file);
		const output = slash(path.relative(canonical, file))
			.replace(/\.mts$/, ".mjs")
			.replace(/\.cts$/, ".cjs")
			.replace(/\.ts$/, ".js");
		const kind = moduleKind(file, canonical);
		assert.equal(
			kind,
			moduleKind(path.join(root, output), root),
			`Canonical package boundary changes installed module kind for ${output}`,
		);
		modules.push({ source, output, module: kind });
	});
	modules.sort((left, right) => left.output.localeCompare(right.output, "en"));
	assert.ok(modules.length > 0, "No canonical TypeScript source modules found");
	assert.equal(
		new Set(modules.map((item) => item.output)).size,
		modules.length,
		"Duplicate generated output mapping",
	);
	return modules;
}
function previousManifest(): OutputManifest {
	const data = json(manifestPath);
	if (
		!record(data) ||
		data.schema !== "grainulator.typescript.outputs/v1" ||
		!Array.isArray(data.modules)
	) {
		throw new Error("Invalid canonical TypeScript output inventory");
	}
	const modules = data.modules.map((item: unknown): ModuleMapping => {
		if (
			!record(item) ||
			typeof item.source !== "string" ||
			typeof item.output !== "string" ||
			(item.module !== "esm" && item.module !== "cjs") ||
			!runtimeExtension.test(item.output) ||
			path.isAbsolute(item.output) ||
			item.output.split("/").includes("..") ||
			!item.source.startsWith("typescript/")
		)
			throw new Error("Unsafe canonical TypeScript output mapping");
		return { source: item.source, output: item.output, module: item.module };
	});
	return { schema: "grainulator.typescript.outputs/v1", modules };
}
const modules = mappings();
const manifest: OutputManifest = {
	schema: "grainulator.typescript.outputs/v1",
	modules,
};
const previous = previousManifest();
const byOutput = new Map(modules.map((item) => [item.output, item]));
for (const old of previous.modules) {
	if (!byOutput.has(old.output) && fs.existsSync(path.join(root, old.output))) {
		throw new Error(
			`Orphaned generated runtime module ${old.output}; restore its canonical source or remove the retired runtime file`,
		);
	}
}
// Include scripts, tests, hooks, fixtures and future source trees. Local build/dependency
// directories are excluded explicitly; a handwritten firstparty JS file is never an exception.
walk(root, (file, entry) => {
	if (!runtimeExtension.test(file)) return;
	const output = relative(file);
	assert.ok(entry.isFile(), `Runtime module must be a regular file: ${output}`);
	assert.ok(
		byOutput.has(output),
		`Handwritten or orphaned JavaScript module ${output} has no canonical TypeScript source`,
	);
});
if (mode !== "--update-inventory")
	assert.deepEqual(
		previous,
		manifest,
		"TypeScript output inventory is stale; review sources and run npm run update:types",
	);

if (mode === "--update-inventory") {
	fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
	console.log(`Updated ${modules.length} TypeScript source/output mappings.`);
	process.exit(0);
}
if (mode === "--check-inventory") {
	const git = fs.existsSync(path.join(root, ".git"))
		? execFileSync(
				"git",
				["ls-files", "-z", "--", "*.js", "*.mjs", "*.cjs", "build-info.json"],
				{ cwd: root, encoding: "utf8" },
			)
		: "";
	assert.equal(
		git,
		"",
		"Compiled JavaScript and build-info.json must be artifacts, not tracked source",
	);
	console.log(
		`Verified ${modules.length} source mappings and no tracked compiled artifacts.`,
	);
	process.exit(0);
}

const temporary = fs.mkdtempSync(
	path.join(os.tmpdir(), "grainulator-typescript-"),
);
try {
	execFileSync(
		process.execPath,
		[
			path.join(root, "node_modules/typescript/bin/tsc"),
			"--project",
			path.join(root, "tsconfig.json"),
			"--outDir",
			temporary,
		],
		{ cwd: root, stdio: "inherit" },
	);
	const emitted = new Set<string>();
	walk(temporary, (file, entry) => {
		if (!runtimeExtension.test(file)) return;
		assert.ok(entry.isFile(), "Compiler output must be regular");
		emitted.add(slash(path.relative(temporary, file)));
	});
	assert.deepEqual(
		[...emitted].sort(),
		[...byOutput.keys()].sort(),
		"Compiler emission differs from canonical output inventory",
	);
	const formattingDirectory = path.join(temporary, "formatted");
	fs.mkdirSync(formattingDirectory);
	const configuration = json(path.join(root, "biome.json"));
	assert.ok(record(configuration), "Invalid formatter configuration");
	const files = record(configuration.files) ? configuration.files : {};
	const formattingConfiguration = path.join(formattingDirectory, "biome.json");
	fs.writeFileSync(
		formattingConfiguration,
		JSON.stringify({ ...configuration, files: { ...files, includes: ["**"] } }),
	);
	for (const item of modules) {
		const compiled = fs.readFileSync(path.join(temporary, item.output), "utf8");
		const banner = `// Generated from ${item.source}; edit that source and run npm run build:types.\n`;
		// Keep executable shebangs on line one after generation.
		const content = compiled.startsWith("#!")
			? compiled.replace(/^(#![^\n]*\n)/, `$1${banner}`)
			: banner + compiled;
		// Canonical extensions preserve the same parser selection as stdin formatting.
		const destination = path.join(formattingDirectory, item.source);
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.writeFileSync(destination, content);
	}
	execFileSync(
		process.execPath,
		[
			path.join(root, "node_modules/@biomejs/biome/bin/biome"),
			"format",
			"--write",
			"--config-path",
			formattingConfiguration,
			formattingDirectory,
		],
		{ cwd: root, stdio: "pipe" },
	);
	const expected = new Map(
		modules.map((item) => [
			item.output,
			fs.readFileSync(path.join(formattingDirectory, item.source), "utf8"),
		]),
	);
	// Validation/formatting completes before mutating any installed-path artifact.
	for (const [output, content] of expected) {
		const target = path.join(root, output);
		if (mode === "--write") {
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content, {
				mode: content.startsWith("#!") ? 0o755 : 0o644,
			});
			if (content.startsWith("#!")) fs.chmodSync(target, 0o755);
		} else {
			assert.equal(
				fs.readFileSync(target, "utf8"),
				content,
				`${output} is missing or stale; edit canonical TypeScript and run npm run build:types`,
			);
		}
	}

	console.log(
		`${mode === "--write" ? "Generated" : "Verified"} ${modules.length} TypeScript runtime, tool and test modules.`,
	);
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}
