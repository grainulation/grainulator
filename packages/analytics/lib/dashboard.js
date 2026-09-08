import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSprintFiles } from "../../shared/lib/sprints.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export so existing callers of harvest's dashboard.findSprintFiles stay working.
export { findSprintFiles };

/**
 * Slim a claims array for dashboard embedding (compact keys).
 */
export function slim(claims) {
  return claims.map((c) => ({
    i: c.id,
    t: c.type,
    tp: c.topic,
    c: c.content || c.text || c.claim || c.description || "",
    e: c.evidence,
    s: c.status,
    p: c.phase_added,
    ts: c.timestamp || c.created || c.date,
    cf: (c.conflicts_with || []).length > 0 ? c.conflicts_with : undefined,
    r: c.resolved_by || undefined,
    tg: (c.tags || []).length > 0 ? c.tags : undefined,
  }));
}

/**
 * Load a claims.json file and return parsed data, or null on failure.
 */
function loadClaims(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Load all sprint data from a target directory.
 * Returns array of { n, p, q, cat, c } sprint objects ready for template embedding.
 */
export function loadSprints(targetDir) {
  const sources = findSprintFiles(targetDir);
  const sprints = [];
  for (const src of sources) {
    const data = loadClaims(src.file);
    if (!data) continue;
    const claims = Array.isArray(data) ? data : data.claims || [];
    if (claims.length === 0) continue;
    sprints.push({
      n: src.name,
      p: data.meta?.phase || "unknown",
      q: data.meta?.question || "",
      cat: src.cat || "active",
      c: slim(claims),
    });
  }
  return sprints;
}

/**
 * Build the dashboard HTML string from a sprints array.
 * @param {Array} sprints - Array of { n, p, q, cat, c } sprint objects
 * @returns {string} Complete HTML string
 */
export function buildHtml(sprints) {
  const templatePath = path.join(
    __dirname,
    "..",
    "templates",
    "dashboard.html",
  );
  const template = fs.readFileSync(templatePath, "utf8");
  const jsonData = JSON.stringify(sprints).replace(/<\/script/gi, "<\\/script");
  return template.replace("__SPRINT_DATA__", jsonData);
}

/**
 * Return paths to all claims.json files for watching.
 */
export function claimsPaths(targetDir) {
  return findSprintFiles(targetDir).map((s) => s.file);
}
