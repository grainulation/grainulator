import fs from "node:fs";
import path from "node:path";
import { readSprintState } from "./tracker.js";

/**
 * Sync all sprint states from their directories into orchard.json.
 * Updates status based on what's actually on disk.
 */
export function syncAll(config, root) {
  const sprints = config.sprints || [];
  let updated = 0;

  console.log("");
  console.log("  Syncing sprint states...");
  console.log("");

  for (const sprint of sprints) {
    const state = readSprintState(sprint.path, root);

    if (!state.exists) {
      console.log(`  [!] ${path.basename(sprint.path)}: directory not found`);
      continue;
    }

    const oldStatus = sprint.status;
    const inferred = inferStatus(sprint, state);

    if (oldStatus !== inferred) {
      sprint.status = inferred;
      updated++;
      console.log(
        `  [~] ${path.basename(sprint.path)}: ${oldStatus || "unknown"} -> ${inferred}`,
      );
    } else {
      console.log(
        `  [=] ${path.basename(sprint.path)}: ${inferred} (${state.claimsCount} claims)`,
      );
    }
  }

  if (updated > 0) {
    const configPath = path.join(root, "orchard.json");
    const tmp = configPath + ".tmp." + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n");
    fs.renameSync(tmp, configPath);
    console.log("");
    console.log(`  Updated ${updated} sprint(s) in orchard.json.`);
  } else {
    console.log("");
    console.log("  All sprints up to date.");
  }

  console.log("");
}

/**
 * Infer sprint status from disk state + config.
 */
export function inferStatus(sprint, state) {
  // If manually set to done, keep it
  if (sprint.status === "done") return "done";

  // If manually blocked, keep it
  if (sprint.status === "blocked") return "blocked";

  if (!state.exists) return "not-found";
  if (state.claimsCount === 0) return "not-started";
  if (state.hasCompilation) return "compiled";
  return "active";
}

/**
 * Check which sprints are ready to start (all dependencies met).
 */
export function findReady(config, root) {
  const sprints = config.sprints || [];
  const statuses = new Map();

  for (const s of sprints) {
    statuses.set(s.path, s.status || "unknown");
  }

  const ready = [];
  for (const s of sprints) {
    if (s.status === "done" || s.status === "active") continue;

    const deps = s.depends_on || [];
    const allDone = deps.every(
      (d) => statuses.get(d) === "done" || statuses.get(d) === "compiled",
    );

    if (allDone) {
      ready.push(s);
    }
  }

  return ready;
}
