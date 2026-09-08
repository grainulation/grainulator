#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeSprint } from "../lib/sprint-init.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
	const key = process.argv[i];
	assert.ok(["--plugin-dir", "--output-dir"].includes(key), `Unknown option: ${key}`);
	assert.ok(process.argv[i + 1], `Missing value for ${key}`);
	options[key] = process.argv[i + 1];
}
const pluginDir = path.resolve(options["--plugin-dir"] || process.env.GRAINULATOR_TEST_PLUGIN_DIR || root);
const outputDir = path.resolve(options["--output-dir"] || path.join(root, ".dogfood", `claude-agent-${Date.now()}`));
fs.mkdirSync(outputDir, { recursive: true });
const fixture = fs.mkdtempSync(path.join(outputDir, "fixture-"));
const initialized = initializeSprint(fixture, {
	question: "Read-only native Claude plugin agent acceptance",
	constraints: "Never modify this single-claim fixture during acceptance",
});
assert.notEqual(initialized.status, "error", JSON.stringify(initialized));
assert.equal(JSON.parse(fs.readFileSync(path.join(fixture, "claims.json"))).claims.length, 1);
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const dataFiles = ["claims.json", "compilation.json"];
const hashes = () => Object.fromEntries(dataFiles.map((file) => [file, hash(path.join(fixture, file))]));
const before = hashes();
const mcpPath = path.join(pluginDir, ".mcp.json");
const mcpBefore = hash(mcpPath);
const prompt = `This is a read-only acceptance test of the packaged Grainulator subagent. Invoke Agent with subagent_type grainulator:grainulator. Ask that subagent to call its available Grainulator MCP status tool with dir ${fixture} and report the exact tool name and returned claim count. Tell it not to use Bash, shell, CLI, external research, or change files; if no Grainulator MCP tools are available, report that fact and stop. Do not substitute another agent type. Finish with the observed outcome briefly.`;
fs.writeFileSync(path.join(outputDir, "prompt.txt"), prompt);
const args = ["-p", "--plugin-dir", pluginDir, "--setting-sources", "", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--tools", "Agent", "--allowedTools", "Agent,mcp__plugin_grainulator_grainulator__status", "--max-turns", "4"];
fs.writeFileSync(path.join(outputDir, "invocation.json"), JSON.stringify({ pluginDir, version: JSON.parse(fs.readFileSync(path.join(pluginDir, ".claude-plugin/plugin.json"))).version, command: "claude", args, fixture, before, mcpBefore }, null, 2));
const stdout = fs.openSync(path.join(outputDir, "events.jsonl"), "w");
const stderr = fs.openSync(path.join(outputDir, "stderr.log"), "w");
const child = spawn("claude", args, {
	cwd: fixture,
	env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ""}` },
	stdio: ["pipe", stdout, stderr],
});
child.stdin.end(prompt);
const timer = setTimeout(() => child.kill("SIGTERM"), 180_000);
const code = await new Promise((resolve, reject) => {
	child.once("error", reject);
	child.once("exit", resolve);
}).finally(() => { clearTimeout(timer); fs.closeSync(stdout); fs.closeSync(stderr); });
const events = fs.readFileSync(path.join(outputDir, "events.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const calls = events.flatMap((event) => (event.message?.content || []).filter((block) => block.type === "tool_use").map((block) => ({ ...block, parent: event.parent_tool_use_id })));
const agent = calls.find((call) => ["Agent", "Task"].includes(call.name) && call.input.subagent_type === "grainulator:grainulator");
const status = calls.find((call) => call.name === "mcp__plugin_grainulator_grainulator__status" && call.parent === agent?.id && call.input.dir === fixture);
const result = events.flatMap((event) => event.message?.content || []).find((block) => block.type === "tool_result" && block.tool_use_id === status?.id);
const after = hashes();
const report = { outputDir, pluginDir, exitCode: code, agentCall: agent || null, statusCall: status || null, statusResult: result || null, fixtureUnchanged: JSON.stringify(before) === JSON.stringify(after), mcpConfigurationChangedByHost: mcpBefore !== hash(mcpPath) };
fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert.equal(code, 0, "Claude must exit successfully");
assert.ok(agent, "Actual Grainulator Agent invocation required");
assert.ok(status, "Actual nested plugin-prefixed MCP status invocation required");
assert.deepEqual(calls.filter((call) => call.parent === agent.id).map((call) => call.name), ["mcp__plugin_grainulator_grainulator__status"], "Subagent must use only the requested read-only status call");
assert.ok(result && !result.is_error, "Successful matching MCP tool result required");
const resultText = typeof result.content === "string" ? result.content : result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
assert.equal(JSON.parse(resultText).total_claims, 1, "MCP status must report the fixture's one claim");
assert.deepEqual(after, before, "Read-only acceptance must preserve sprint data");
