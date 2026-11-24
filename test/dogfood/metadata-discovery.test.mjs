// Generated from typescript/test/dogfood/metadata-discovery.test.mts; edit that source and run npm run build:types.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHandler } from "../../lib/grainulator-mcp.js";
function matches(value, schema) {
	if (typeof schema === "boolean") return schema;
	if (schema.type) {
		const types = typeof schema.type === "string" ? [schema.type] : schema.type;
		if (
			!types.some((type) =>
				type === "null"
					? value === null
					: type === "array"
						? Array.isArray(value)
						: type === "object"
							? value !== null &&
								typeof value === "object" &&
								!Array.isArray(value)
							: type === "integer"
								? Number.isInteger(value)
								: typeof value === type,
			)
		)
			return false;
	}
	if (Object.hasOwn(schema, "const") && value !== schema.const) return false;
	if (schema.enum && !schema.enum.includes(value)) return false;
	if (
		schema.oneOf &&
		schema.oneOf.filter((branch) => matches(value, branch)).length !== 1
	)
		return false;
	if (schema.anyOf && !schema.anyOf.some((branch) => matches(value, branch)))
		return false;
	if (schema.not && matches(value, schema.not)) return false;
	if (
		typeof value === "number" &&
		((schema.minimum !== undefined && value < schema.minimum) ||
			(schema.maximum !== undefined && value > schema.maximum))
	)
		return false;
	if (
		typeof value === "string" &&
		((schema.minLength !== undefined && value.length < schema.minLength) ||
			(schema.maxLength !== undefined &&
				[...value].length > schema.maxLength) ||
			(schema.pattern && !new RegExp(schema.pattern).test(value)))
	)
		return false;
	if (Array.isArray(value) && schema.items) {
		const itemSchema = schema.items;
		if (!value.every((item) => matches(item, itemSchema))) return false;
	}
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		const record = value;
		if (schema.required?.some((key) => !Object.hasOwn(record, key)))
			return false;
		if (
			schema.additionalProperties === false &&
			Object.keys(record).some(
				(key) => !Object.hasOwn(schema.properties ?? {}, key),
			)
		)
			return false;
		for (const [key, child] of Object.entries(schema.properties ?? {}))
			if (Object.hasOwn(record, key) && !matches(record[key], child))
				return false;
	}
	return true;
}
function assertDocumented(schema, location) {
	if (typeof schema === "boolean") return;
	for (const [name, child] of Object.entries(schema.properties ?? {})) {
		if (typeof child === "boolean") continue;
		assert.ok(
			child.description?.trim(),
			`${location}.${name}: explain parameter semantics`,
		);
		assertDocumented(child, `${location}.${name}`);
	}
	if (schema.type === "array") {
		assert.ok(schema.items, `${location}: describe accepted array items`);
		assertDocumented(schema.items, `${location}[]`);
	}
}
for (const toolset of ["legacy", "compact"]) {
	test(`${toolset} wire discovery documents every parameter and supplies schema-valid examples`, async (t) => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grainulator-metadata-"));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		const handler = createHandler({
			dir,
			memoryDir: path.join(dir, "memory"),
			toolset,
		});
		await handler(
			"initialize",
			{
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "metadata-contract", version: "1" },
			},
			1,
		);
		const { result } = JSON.parse(await handler("tools/list", {}, 2));
		assert.equal(result.tools.length, toolset === "compact" ? 15 : 29);
		assert.equal(
			new Set(result.tools.map((tool) => tool.name)).size,
			result.tools.length,
		);
		for (const tool of result.tools) {
			if (toolset === "compact")
				assert.match(tool.name, /^[a-z]+_[a-z]+$/, tool.name);
			assert.ok(
				tool.title && tool.title !== tool.name,
				`${tool.name}: meaningful display title`,
			);
			assertDocumented(tool.inputSchema, tool.name);
			for (const hint of [
				"readOnlyHint",
				"destructiveHint",
				"idempotentHint",
				"openWorldHint",
			])
				assert.equal(
					typeof tool.annotations[hint],
					"boolean",
					`${tool.name}.${hint}`,
				);
			assert.equal(
				tool.outputSchema?.type,
				"object",
				`${tool.name}: documented results`,
			);
			const example = /Example:\s*(\{.*\})/.exec(tool.description)?.[1];
			assert.ok(example, `${tool.name}: a concrete JSON example`);
			assert.ok(
				matches(JSON.parse(example), tool.inputSchema),
				`${tool.name}: example agrees with required fields, enums and conditional schema branches`,
			);
		}
		const legacy = createHandler({ dir, toolset });
		const oldDiscovery = JSON.parse(await legacy("tools/list", {}, 3));
		assert.ok(
			oldDiscovery.result.tools.every(
				(tool) => tool.outputSchema === undefined,
			),
			"pre-initialize clients retain text-only protocol compatibility",
		);
	});
}
