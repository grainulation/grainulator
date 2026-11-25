import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function workspaceConfigPath(env = process.env) {
	return (
		env.GRAINULATOR_CONFIG ||
		path.join(os.homedir(), ".config", "grainulator", "workspace.json")
	);
}

export function validateWorkspace(selected: string) {
	if (!selected || !path.isAbsolute(selected))
		throw new Error("Workspace must be an absolute project directory.");
	if (!fs.statSync(selected).isDirectory())
		throw new Error("Workspace must be an existing project directory.");
	return fs.realpathSync(selected);
}

export function validateToolset(value: unknown): "legacy" | "compact" {
	if (value === undefined || value === "legacy") return "legacy";
	if (value === "compact") return "compact";
	throw new Error("MCP toolset must be legacy or compact.");
}

function readSavedBinding(env: NodeJS.ProcessEnv) {
	const file = workspaceConfigPath(env);
	if (!path.isAbsolute(file))
		throw new Error("GRAINULATOR_CONFIG must be an absolute file path.");
	let text: string;
	try {
		text = fs.readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			return { file, config: undefined };
		throw error;
	}
	const value: unknown = JSON.parse(text);
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		!("schema" in value) ||
		value.schema !== 1
	)
		throw new Error("Unsupported native-host workspace configuration.");
	return { file, config: value as Record<string, unknown> };
}

function profileFrom(value: unknown, source: string) {
	try {
		return validateToolset(value);
	} catch {
		throw new Error(
			`${source}: MCP toolset must be legacy or compact. ${
				source === "GRAINULATOR_TOOLSET"
					? "Correct or unset GRAINULATOR_TOOLSET, then restart the host."
					: "Run grainulator setup --dir /absolute/project --toolset legacy|compact, then restart the host."
			}`,
		);
	}
}

export interface NativeSettings {
	toolset: "legacy" | "compact";
	workspace?: string;
	workspaceError?: string;
}

// Workspace and profile come from one atomic saved-file snapshot. A known
// environment profile lets MCP roots recover even when the fallback is damaged.
export function loadNativeSettings(env = process.env): NativeSettings {
	const explicitProfile =
		env.GRAINULATOR_TOOLSET === undefined
			? undefined
			: profileFrom(env.GRAINULATOR_TOOLSET, "GRAINULATOR_TOOLSET");
	if (env.GRAINULATOR_WORKSPACE) {
		const toolset = explicitProfile ?? "legacy";
		try {
			return {
				toolset,
				workspace: validateWorkspace(env.GRAINULATOR_WORKSPACE),
			};
		} catch (error) {
			return {
				toolset,
				workspaceError: `GRAINULATOR_WORKSPACE: ${(error as Error).message} Correct or unset GRAINULATOR_WORKSPACE and restart the host.`,
			};
		}
	}
	let binding: ReturnType<typeof readSavedBinding>;
	try {
		binding = readSavedBinding(env);
	} catch {
		const message =
			"Cannot read the saved native binding. Repair it with grainulator setup --dir /absolute/project --toolset legacy|compact. A roots-capable host may instead set GRAINULATOR_TOOLSET=legacy|compact and restart.";
		if (explicitProfile === undefined) throw new Error(message);
		return { toolset: explicitProfile, workspaceError: message };
	}
	const toolset =
		explicitProfile ?? profileFrom(binding.config?.toolset, binding.file);
	try {
		if (!binding.config)
			throw new Error(
				"Run grainulator setup --dir /absolute/project once, then restart the host.",
			);
		if (typeof binding.config.workspace !== "string")
			throw new Error("Saved workspace must be an absolute project directory.");
		return { toolset, workspace: validateWorkspace(binding.config.workspace) };
	} catch (error) {
		return { toolset, workspaceError: (error as Error).message };
	}
}

export function loadToolset(env = process.env) {
	return loadNativeSettings(env).toolset;
}

export function saveWorkspace(
	selected: string,
	env = process.env,
	toolset?: string,
) {
	const workspace = validateWorkspace(selected);
	const profile =
		toolset === undefined ? {} : { toolset: validateToolset(toolset) };
	const file = workspaceConfigPath(env);
	if (!path.isAbsolute(file))
		throw new Error("GRAINULATOR_CONFIG must be an absolute file path.");
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const temporary = `${file}.${randomUUID()}.tmp`;
	// A failed exclusive open never grants ownership of an existing path.
	let descriptor: number | undefined = fs.openSync(temporary, "wx", 0o600);
	try {
		fs.writeFileSync(
			descriptor,
			`${JSON.stringify({ schema: 1, workspace, ...profile }, null, 2)}\n`,
		);
		fs.closeSync(descriptor);
		descriptor = undefined;
		fs.renameSync(temporary, file);
	} finally {
		if (descriptor !== undefined) fs.closeSync(descriptor);
		if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
	}
	return { workspace, config: file, ...profile };
}

export function loadWorkspace(env = process.env) {
	if (env.GRAINULATOR_WORKSPACE)
		return {
			workspace: validateWorkspace(env.GRAINULATOR_WORKSPACE),
			source: "environment",
		};
	const file = workspaceConfigPath(env);
	if (!path.isAbsolute(file))
		throw new Error("GRAINULATOR_CONFIG must be an absolute file path.");
	if (!fs.existsSync(file))
		throw new Error(
			"Run grainulator setup --dir /absolute/project once, then restart Codex. Alternatively set GRAINULATOR_WORKSPACE before launch. No workspace files were accessed.",
		);
	const config = JSON.parse(fs.readFileSync(file, "utf8"));
	if (config.schema !== 1)
		throw new Error(
			`Unsupported workspace configuration: ${file}. Run grainulator setup --dir /absolute/project again.`,
		);
	return { workspace: validateWorkspace(config.workspace), source: file };
}
