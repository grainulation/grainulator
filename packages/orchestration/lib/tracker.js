import fs from "node:fs";
import path from "node:path";

/**
 * Read sprint status from its directory.
 * Looks for claims.json and compilation.json to determine state.
 */
export function readSprintState(sprintPath, root) {
  const absPath = path.isAbsolute(sprintPath)
    ? sprintPath
    : path.join(root, sprintPath);
  const state = {
    exists: false,
    claimsCount: 0,
    hasCompilation: false,
    lastModified: null,
    status: "unknown",
  };

  if (!fs.existsSync(absPath)) return state;
  state.exists = true;

  const claimsPath = path.join(absPath, "claims.json");
  if (fs.existsSync(claimsPath)) {
    try {
      const claims = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
      state.claimsCount = Array.isArray(claims)
        ? claims.length
        : claims.claims
          ? claims.claims.length
          : 0;
      const stat = fs.statSync(claimsPath);
      state.lastModified = stat.mtime;
    } catch {
      // Ignore parse errors
    }
  }

  const compilationPath = path.join(absPath, "compilation.json");
  state.hasCompilation = fs.existsSync(compilationPath);

  // Infer status
  if (state.claimsCount === 0) {
    state.status = "not-started";
  } else if (state.hasCompilation) {
    state.status = "compiled";
  } else {
    state.status = "in-progress";
  }

  return state;
}

/**
 * Print status table for all sprints.
 */
export function printStatus(config, root) {
  const sprints = config.sprints || [];

  if (sprints.length === 0) {
    console.log("No sprints configured. Add sprints to orchard.json.");
    return;
  }

  const active = sprints.filter(
    (s) => s.status === "active" || !s.status,
  ).length;
  const done = sprints.filter((s) => s.status === "done").length;

  console.log("");
  console.log(
    `  ${sprints.length} sprints tracked. ${active} active, ${done} done.`,
  );
  console.log("  " + "-".repeat(70));
  console.log(
    "  " +
      "Sprint".padEnd(20) +
      "Status".padEnd(14) +
      "Claims".padEnd(10) +
      "Assigned".padEnd(16) +
      "Deadline",
  );
  console.log("  " + "-".repeat(70));

  for (const sprint of sprints) {
    const state = readSprintState(sprint.path, root);
    const name = path.basename(sprint.path).substring(0, 18);
    const status = sprint.status || state.status;
    const claims = state.claimsCount.toString();
    const assignee = (sprint.assigned_to || "-").substring(0, 14);
    const deadline = sprint.deadline || "-";

    const statusDisplay =
      status === "active"
        ? "* active"
        : status === "done"
          ? "x done"
          : status === "blocked"
            ? "! blocked"
            : `  ${status}`;

    console.log(
      "  " +
        name.padEnd(20) +
        statusDisplay.padEnd(14) +
        claims.padEnd(10) +
        assignee.padEnd(16) +
        deadline,
    );
  }

  console.log("  " + "-".repeat(70));
  console.log("");
}

/**
 * Get status summary as data (for dashboard generation).
 */
export function getStatusData(config, root) {
  return (config.sprints || []).map((sprint) => {
    const state = readSprintState(sprint.path, root);
    return {
      ...sprint,
      state,
      effectiveStatus: sprint.status || state.status,
    };
  });
}
