import fs from "node:fs";
import path from "node:path";
import type {
	ConflictClaim,
	CrossConflict,
	DecomposeOptions,
	HackathonConfig,
	HackathonState,
	Portfolio,
	Severity,
	Sprint,
	SprintState,
} from "./orchestration-types.js";
import { updatePortfolio } from "./project-config.js";

/**
 * Assign a person to a sprint. Updates grainulator.config.json.
 */
export function assignSprint(
	config: Portfolio,
	root: string,
	sprintPath: string,
	person: string,
) {
	const sprint = (config.sprints || []).find((s) => s.path === sprintPath);

	if (!sprint) {
		console.error(`Sprint not found: ${sprintPath}`);
		console.error("Available sprints:");
		for (const s of config.sprints || []) {
			console.error(`  ${s.path}`);
		}
		process.exit(1);
	}

	const prev = sprint.assigned_to;
	sprint.assigned_to = person;

	updatePortfolio(root, (fresh) => ({
		...fresh,
		sprints: (fresh.sprints || []).map((item) =>
			item.path === sprintPath ? { ...item, assigned_to: person } : item,
		),
	}));

	if (prev) {
		console.log(
			`Reassigned ${path.basename(sprintPath)}: ${prev} -> ${person}`,
		);
	} else {
		console.log(`Assigned ${path.basename(sprintPath)} to ${person}`);
	}
}

/**
 * Get workload summary: how many sprints per person.
 */
export function getWorkload(config: Portfolio) {
	const workload = new Map<string, Sprint[]>();

	for (const sprint of config.sprints || []) {
		const person = sprint.assigned_to || "unassigned";
		if (!workload.has(person)) {
			workload.set(person, []);
		}
		workload.get(person)!.push(sprint);
	}

	return workload;
}

/**
 * Print workload distribution.
 */
export function printWorkload(config: Portfolio) {
	const workload = getWorkload(config);

	console.log("");
	console.log("  Workload Distribution");
	console.log("  " + "-".repeat(40));

	for (const [person, sprints] of workload) {
		const active = sprints.filter((s) => s.status !== "done").length;
		console.log(`  ${person}: ${sprints.length} sprints (${active} active)`);
		for (const s of sprints) {
			const status = s.status || "unknown";
			console.log(`    - ${path.basename(s.path)} [${status}]`);
		}
	}

	console.log("");
}

/**
 * Find overloaded team members (more than maxLoad active sprints).
 */
export function findOverloaded(config: Portfolio, maxLoad = 3) {
	const workload = getWorkload(config);
	const overloaded = [];

	for (const [person, sprints] of workload) {
		if (person === "unassigned") continue;
		const active = sprints.filter((s) => s.status !== "done").length;
		if (active > maxLoad) {
			overloaded.push({ person, active, sprints });
		}
	}

	return overloaded;
}
