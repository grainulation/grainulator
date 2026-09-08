import fs from "node:fs";
import path from "node:path";

/**
 * Assign a person to a sprint. Updates orchard.json.
 */
export function assignSprint(config, root, sprintPath, person) {
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

  const configPath = path.join(root, "orchard.json");
  const tmp = configPath + ".tmp." + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n");
  fs.renameSync(tmp, configPath);

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
export function getWorkload(config) {
  const workload = new Map();

  for (const sprint of config.sprints || []) {
    const person = sprint.assigned_to || "unassigned";
    if (!workload.has(person)) {
      workload.set(person, []);
    }
    workload.get(person).push(sprint);
  }

  return workload;
}

/**
 * Print workload distribution.
 */
export function printWorkload(config) {
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
export function findOverloaded(config, maxLoad = 3) {
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
