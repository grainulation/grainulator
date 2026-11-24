/** Grainulator project configuration. Host binding GRAINULATOR_CONFIG is separate. */
import fs = require("node:fs");
import path = require("node:path");
import os = require("node:os");
import asyncHooks = require("node:async_hooks");
import crypto = require("node:crypto");
import errors = require("./errors.cjs");
const { randomUUID } = crypto;
interface ConfigOptions {
	workspace?: string | undefined;
	configFile?: string | undefined;
	ascend?: boolean | undefined;
	create?: boolean | undefined;
}
type Section = "evidence" | "orchestration" | "runtime";
interface EvidenceSection extends Record<string, unknown> {
	dirs?: Partial<
		Record<
			"output" | "research" | "prototypes" | "evidence" | "templates",
			string
		>
	>;
	compiler?: Partial<Record<"claims" | "compilation", string>>;
}
interface ProjectConfig extends Record<string, unknown> {
	schema_version: 1;
	evidence?: EvidenceSection;
	orchestration?: Record<string, unknown>;
	runtime?: Record<string, unknown>;
}
interface ConfigReading {
	file: string;
	exists: boolean;
	data: ProjectConfig;
}
interface SectionReading<T> extends ConfigReading {
	value: T | undefined;
	origin: string;
}
const projectScope = new asyncHooks.AsyncLocalStorage<{ workspace: string }>();
const withProjectScope = <T,>(workspace: string, operation: () => T): T =>
	projectScope.run({ workspace: path.resolve(workspace) }, operation);
const FILENAME = "grainulator.config.json";
function problem(message: string) {
	return Object.assign(new Error(message), { code: "E_CONFIG" });
}
function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function realPath(file: string, depth = 0): string {
	if (depth > 40) throw problem("Too many configuration symlinks.");
	try {
		return fs.realpathSync(file);
	} catch (error) {
		if (!["ENOENT", "ENOTDIR"].includes(errors.errorCode(error) ?? ""))
			throw error;
		try {
			if (fs.lstatSync(file).isSymbolicLink())
				return realPath(
					path.resolve(path.dirname(file), fs.readlinkSync(file)),
					depth + 1,
				);
		} catch (linkError) {
			if (!["ENOENT", "ENOTDIR"].includes(errors.errorCode(linkError) ?? ""))
				throw linkError;
		}
		const parent = path.dirname(file);
		if (parent === file) throw error;
		return path.join(realPath(parent, depth), path.basename(file));
	}
}
function inside(file: string, root: string) {
	const rel = path.relative(
		realPath(path.resolve(root)),
		realPath(path.resolve(file)),
	);
	if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
		throw problem("Configuration path is outside the authorized workspace.");
}
function validate(data: unknown, file: string): ProjectConfig {
	if (!object(data) || data.schema_version !== 1)
		throw problem(`${file}: expected an object with schema_version: 1.`);
	for (const name of ["evidence", "orchestration", "runtime"])
		if (data[name] !== undefined && !object(data[name]))
			throw problem(`${file}: ${name} must be an object.`);
	const evidence = object(data.evidence) ? data.evidence : {};
	for (const name of ["dirs", "compiler"]) {
		if (evidence[name] !== undefined && !object(evidence[name]))
			throw problem(`${file}: evidence.${name} must be an object.`);
		for (const [key, value] of Object.entries(
			object(evidence[name]) ? evidence[name] : {},
		).filter(([key]) =>
			(name === "dirs"
				? ["output", "research", "prototypes", "evidence", "templates"]
				: ["claims", "compilation"]
			).includes(key),
		)) {
			if (typeof value !== "string" || !value.trim() || value.includes("\0"))
				throw problem(
					`${file}: evidence.${name}.${key} must be a nonempty path string.`,
				);
		}
	}
	const portfolio = object(data.orchestration) ? data.orchestration : {};
	if (portfolio.sprints !== undefined && !Array.isArray(portfolio.sprints))
		throw problem(`${file}: orchestration.sprints must be an array.`);
	for (const sprint of Array.isArray(portfolio.sprints)
		? portfolio.sprints
		: [])
		if (
			!object(sprint) ||
			typeof sprint.path !== "string" ||
			!sprint.path.trim()
		)
			throw problem(`${file}: each orchestration sprint needs a path.`);
	if (portfolio.settings !== undefined && !object(portfolio.settings))
		throw problem(`${file}: orchestration.settings must be an object.`);
	return data as ProjectConfig;
}
/** Explicit MCP/workspace boundaries win. Direct CLI calls discover only enclosing canonical project metadata or Git roots. */
function resolveScopeRoot(dir: string, options: ConfigOptions = {}) {
	const selected = path.resolve(dir),
		explicit = options.workspace || projectScope.getStore()?.workspace;
	if (explicit) {
		inside(selected, explicit);
		return realPath(path.resolve(explicit));
	}
	let current = selected;
	let candidate: string | undefined;
	const home = realPath(os.homedir());
	for (;;) {
		if (fs.existsSync(path.join(current, ".git"))) return realPath(current);
		if (
			fs.existsSync(path.join(current, FILENAME)) ||
			fs.existsSync(path.join(current, ".grainulator", "migration.json")) ||
			fs.existsSync(
				path.join(current, ".grainulator", "evidence", "remote-migration.json"),
			)
		)
			candidate = current;
		const parent = path.dirname(current);
		if (parent === current || realPath(current) === home) break;
		current = parent;
	}
	return realPath(candidate || selected);
}
function assertMigrationReady(dir: string, options: ConfigOptions = {}) {
	const workspace = resolveScopeRoot(dir, options);
	let current = path.resolve(dir);
	const boundary = path.resolve(workspace);
	inside(current, boundary);
	for (;;) {
		const marker = path.join(current, ".grainulator", "migration.json");
		if (fs.existsSync(marker)) {
			inside(marker, boundary);
			let data: unknown;
			try {
				data = JSON.parse(fs.readFileSync(marker, "utf8"));
			} catch {
				throw problem(
					"Migration metadata is unreadable or malformed; reconcile it before writing.",
				);
			}
			if (
				!object(data) ||
				data.schema !== "grainulator.migration.v1" ||
				!["in-progress", "complete", "rolled-back"].includes(
					typeof data.state === "string" ? data.state : "",
				)
			)
				throw problem(
					"Unsupported migration metadata; reconcile it before writing.",
				);
			if (data.state === "in-progress")
				throw problem(
					"Migration is in progress; finish verification or rollback before writing.",
				);
		}
		if (realPath(current) === realPath(boundary)) break;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
}
function readProjectConfig(
	dir: string,
	options: ConfigOptions = {},
): ConfigReading {
	const origin = path.resolve(dir);
	const workspace = path.resolve(
		options.workspace || projectScope.getStore()?.workspace || origin,
	);
	const file = options.configFile
		? path.resolve(origin, options.configFile)
		: path.join(origin, FILENAME);
	inside(origin, workspace);
	inside(file, workspace);
	let raw: string;
	try {
		raw = fs.readFileSync(file, "utf8");
	} catch (error) {
		if (errors.errorCode(error) === "ENOENT")
			return { file, exists: false, data: { schema_version: 1 } };
		throw problem(
			`Cannot read project configuration (${errors.errorCode(error) || "read error"}).`,
		);
	}
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		throw problem(`${file}: invalid JSON; defaults were not applied.`);
	}
	return { file, exists: true, data: validate(data, file) };
}
function sectionPaths(
	value: unknown,
	section: Section,
	origin: string,
	workspace: string,
): void {
	if (section === "evidence" && object(value)) {
		for (const group of ["dirs", "compiler"]) {
			const members = value[group];
			if (!object(members)) continue;
			for (const [key, item] of Object.entries(members)) {
				if (
					(group === "dirs"
						? ["output", "research", "prototypes", "evidence", "templates"]
						: ["claims", "compilation"]
					).includes(key) &&
					typeof item === "string"
				)
					inside(path.resolve(origin, item), workspace);
			}
		}
	}
	if (
		section === "orchestration" &&
		object(value) &&
		Array.isArray(value.sprints)
	) {
		for (const sprint of value.sprints)
			if (object(sprint) && typeof sprint.path === "string")
				inside(path.resolve(origin, sprint.path), workspace);
	}
}
function readSection<T = unknown>(
	dir: string,
	section: Section,
	options: ConfigOptions = {},
): SectionReading<T> {
	if (!["evidence", "orchestration", "runtime"].includes(section))
		throw problem("Unknown project configuration section.");
	let current = path.resolve(dir);
	const workspace = path.resolve(
		options.workspace || projectScope.getStore()?.workspace || current,
	);
	inside(current, workspace);
	for (;;) {
		const selected = readProjectConfig(current, { ...options, workspace });
		if (
			selected.data[section] !== undefined ||
			options.configFile ||
			!options.ascend ||
			realPath(current) === realPath(workspace)
		) {
			const value = selected.data[section],
				origin = path.dirname(selected.file);
			sectionPaths(value, section, origin, workspace);
			return { ...selected, value: value as T | undefined, origin };
		}
		const parent = path.dirname(current);
		if (parent === current)
			return { ...selected, value: undefined, origin: current };
		current = parent;
	}
}
function updateSection<T = unknown>(
	dir: string,
	section: Section,
	update: (current: T | undefined) => T,
	options: ConfigOptions = {},
) {
	if (
		!["evidence", "orchestration", "runtime"].includes(section) ||
		typeof update !== "function"
	)
		throw problem("A section and update function are required.");
	const selected = readSection(dir, section, options);
	const file = selected.file;
	assertMigrationReady(dir, options);
	const lock = `${file}.lock`;
	try {
		fs.mkdirSync(lock, { mode: 0o700 });
	} catch (error) {
		if (errors.errorCode(error) === "EEXIST")
			throw problem(
				"Project configuration is locked. Inspect its owner before explicit recovery.",
			);
		throw error;
	}
	let temporary: string | undefined;
	let ownsTemporary = false;
	try {
		fs.writeFileSync(
			path.join(lock, "owner.json"),
			JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
			{ flag: "wx", mode: 0o600 },
		);
		const fresh = readProjectConfig(path.dirname(file), {
			...options,
			configFile: file,
			workspace: options.workspace || projectScope.getStore()?.workspace || dir,
		});
		if (!fresh.exists && !options.create)
			throw problem("Project configuration does not exist.");
		const value = update(structuredClone(fresh.data[section]) as T | undefined);
		const data = validate({ ...fresh.data, [section]: value }, file);
		sectionPaths(
			value,
			section,
			path.dirname(file),
			options.workspace || projectScope.getStore()?.workspace || dir,
		);
		temporary = `${file}.${randomUUID()}.tmp`;
		const descriptor = fs.openSync(temporary, "wx", 0o600);
		ownsTemporary = true;
		try {
			fs.writeFileSync(descriptor, `${JSON.stringify(data, null, 2)}\n`);
			fs.fsyncSync(descriptor);
		} finally {
			fs.closeSync(descriptor);
		}
		fs.renameSync(temporary, file);
		temporary = undefined;
		return { file, value, data };
	} finally {
		if (ownsTemporary && temporary && fs.existsSync(temporary))
			fs.unlinkSync(temporary);
		fs.rmSync(lock, { recursive: true, force: true });
	}
}
function evidenceConfig(dir: string, options: ConfigOptions = {}) {
	const selected = readSection<EvidenceSection>(dir, "evidence", options);
	const defaults = {
		dirs: {
			output: "output",
			research: "research",
			prototypes: "prototypes",
			evidence: "evidence",
			templates: "templates",
		},
		compiler: { claims: "claims.json", compilation: "compilation.json" },
	};
	const value = selected.value || {};
	return {
		...value,
		dirs: { ...defaults.dirs, ...value.dirs },
		compiler: { ...defaults.compiler, ...value.compiler },
		origin: selected.origin,
		file: selected.file,
	};
}
export = {
	FILENAME,
	readProjectConfig,
	readSection,
	updateSection,
	evidenceConfig,
	assertMigrationReady,
	resolveScopeRoot,
	withProjectScope,
	validate,
};
