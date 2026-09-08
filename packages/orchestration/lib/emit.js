import fs from "node:fs";
import path from "node:path";
import { findReady } from "./sync.js";

/**
 * Emit grainulator-compatible instructions for all ready sprints.
 *
 * Reads findReady() output + each sprint's claims.json meta to build
 * a structured instruction per sprint: { dir, question, tools, model }.
 *
 * @param {object} config - Parsed orchard.json
 * @param {string} root   - Orchard root directory
 * @returns {object[]} Array of grainulator instructions
 */
export function emitInstructions(config, root) {
  const ready = findReady(config, root);
  const instructions = [];

  for (const sprint of ready) {
    const sprintDir = path.resolve(root, sprint.path);
    const claimsPath = path.join(sprintDir, "claims.json");

    let question = sprint.question || null;

    // Try to extract question from claims.json meta if not in orchard config
    if (!question) {
      try {
        const raw = fs.readFileSync(claimsPath, "utf8");
        const data = JSON.parse(raw);
        question = data.meta?.question || null;
      } catch {
        // No claims.json or unreadable -- skip this sprint
      }
    }

    if (!question) continue;

    instructions.push({
      dir: sprintDir,
      question,
      tools: [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "WebSearch",
        "WebFetch",
      ],
      model: sprint.model || "sonnet",
    });
  }

  return instructions;
}

/**
 * Print ready sprint instructions to stdout (CLI-friendly).
 */
export function printNext(config, root) {
  const instructions = emitInstructions(config, root);

  if (instructions.length === 0) {
    console.log(
      "\n  No sprints are ready. Check dependencies with `orchard plan`.\n",
    );
    return instructions;
  }

  console.log(`\n  ${instructions.length} sprint(s) ready:\n`);
  for (const inst of instructions) {
    console.log(`  - ${path.basename(inst.dir)}`);
    console.log(`    Question: ${inst.question}`);
    console.log(`    Run: /grainulator:research "${inst.question}"\n`);
  }

  return instructions;
}
