import fs from "node:fs";
import path from "node:path";
import { detectCycles } from "./planner.js";

/**
 * Run all doctor checks against the orchard root directory.
 * Returns { checks: [...], ok: boolean }
 */
export function runChecks(root) {
  const checks = [];

  // 1. orchard.json present and parseable
  const configPath = path.join(root, "orchard.json");
  const configExists = fs.existsSync(configPath);
  checks.push({
    name: "orchard.json exists",
    ok: configExists,
    detail: configExists
      ? configPath
      : 'Not found. Run "orchard init" to create one.',
  });

  if (!configExists) {
    return { checks, ok: false };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    checks.push({ name: "orchard.json is valid JSON", ok: true, detail: "" });
  } catch (err) {
    checks.push({
      name: "orchard.json is valid JSON",
      ok: false,
      detail: err.message,
    });
    return { checks, ok: false };
  }

  const sprints = config.sprints || [];
  checks.push({
    name: "sprints defined",
    ok: sprints.length > 0,
    detail:
      sprints.length > 0
        ? `${sprints.length} sprint(s) configured`
        : "No sprints in orchard.json",
  });

  // 2. Sprint directories reachable
  for (const sprint of sprints) {
    const sprintDir =
      sprint.path === "."
        ? root
        : path.isAbsolute(sprint.path)
          ? sprint.path
          : path.join(root, sprint.path);
    const exists = fs.existsSync(sprintDir);
    checks.push({
      name: `sprint dir: ${sprint.name || sprint.path}`,
      ok: exists,
      detail: exists ? sprintDir : `Missing: ${sprintDir}`,
    });
  }

  // 3. Dependencies resolve (all depends_on targets exist in sprint list)
  const sprintPaths = new Set(sprints.map((s) => s.path));
  const sprintNames = new Set(sprints.map((s) => s.name).filter(Boolean));
  let allDepsResolved = true;

  for (const sprint of sprints) {
    for (const dep of sprint.depends_on || []) {
      // Match by path or by name
      const resolved = sprintPaths.has(dep) || sprintNames.has(dep);
      if (!resolved) {
        allDepsResolved = false;
        checks.push({
          name: `dependency: ${sprint.name || sprint.path} -> ${dep}`,
          ok: false,
          detail: `"${dep}" not found in sprint list`,
        });
      }
    }
  }
  if (allDepsResolved && sprints.length > 0) {
    const totalDeps = sprints.reduce(
      (n, s) => n + (s.depends_on || []).length,
      0,
    );
    checks.push({
      name: "all dependencies resolve",
      ok: true,
      detail: `${totalDeps} dependency link(s) verified`,
    });
  }

  // 4. Cycle detection
  let hasCycles = false;
  try {
    const cycles = detectCycles(config);
    hasCycles = cycles.length > 0;
    checks.push({
      name: "no dependency cycles",
      ok: !hasCycles,
      detail: hasCycles
        ? `Cycle involving: ${cycles.join(", ")}`
        : "Dependency graph is acyclic",
    });
  } catch (err) {
    checks.push({
      name: "no dependency cycles",
      ok: false,
      detail: `Cycle check failed: ${err.message}`,
    });
  }

  const ok = checks.every((c) => c.ok);
  return { checks, ok };
}

/**
 * Print doctor results to stdout.
 */
export function printReport(result) {
  console.log("");
  console.log("  orchard doctor");
  console.log("  " + "=".repeat(40));
  console.log("");

  for (const check of result.checks) {
    const icon = check.ok ? "ok" : "FAIL";
    const line = `  [${icon.padEnd(4)}] ${check.name}`;
    console.log(line);
    if (check.detail && !check.ok) {
      console.log(`         ${check.detail}`);
    }
  }

  console.log("");
  const passed = result.checks.filter((c) => c.ok).length;
  const total = result.checks.length;
  console.log(
    `  ${passed}/${total} checks passed` +
      (result.ok ? " -- all healthy" : " -- issues found"),
  );
  console.log("");
}
