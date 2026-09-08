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

export function validateWorkspace(selected) {
	if (!selected || !path.isAbsolute(selected))
		throw new Error("Workspace must be an absolute project directory.");
	if (!fs.statSync(selected).isDirectory())
		throw new Error("Workspace must be an existing project directory.");
	return fs.realpathSync(selected);
}

export function saveWorkspace(selected, env = process.env) {
	const workspace = validateWorkspace(selected);
	const file = workspaceConfigPath(env);
	if (!path.isAbsolute(file))
		throw new Error("GRAINULATOR_CONFIG must be an absolute file path.");
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const temporary = `${file}.${randomUUID()}.tmp`;
	// A failed exclusive open never grants ownership of an existing path.
	let descriptor = fs.openSync(temporary, "wx", 0o600);
	try {
		fs.writeFileSync(
			descriptor,
			`${JSON.stringify({ schema: 1, workspace }, null, 2)}\n`,
		);
		fs.closeSync(descriptor);
		descriptor = undefined;
		fs.renameSync(temporary, file);
	} finally {
		if (descriptor !== undefined) fs.closeSync(descriptor);
		if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
	}
	return { workspace, config: file };
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
