// Generated from typescript/evals/verifier.mts; edit that source and run npm run build:types.
import fs from "node:fs";
import { score, tasks } from "./tasks.mjs";
const task = tasks.find((t) => t.id === process.argv[2]);
if (!task) throw Error("Unknown evaluation task");
const req = JSON.parse(fs.readFileSync(0, "utf8"));
const result = score(task, req.answer);
console.log(result.feedback);
process.exitCode = result.passed ? 0 : 1;
