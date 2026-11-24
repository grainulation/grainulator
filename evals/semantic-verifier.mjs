// Generated from typescript/evals/semantic-verifier.mts; edit that source and run npm run build:types.
import fs from "node:fs";
import { score, tasks } from "./semantic-tasks.mjs";
const task = tasks.find((t) => t.id === process.argv[2]);
if (!task) throw Error("Unknown semantic case");
const request = JSON.parse(fs.readFileSync(0, "utf8"));
const result = score(task, request.answer);
console.log(result.feedback);
process.exitCode = result.semantic && result.format ? 0 : 1;
