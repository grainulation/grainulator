/**
 * mill format: jira-csv
 *
 * Converts compilation.json claims to CSV with Jira field names.
 * Columns: Summary, Description, Issue Type, Priority, Labels, Status
 * Zero dependencies — node built-in only.
 */

export const name = "jira-csv";
export const extension = ".csv";
export const mimeType = "text/csv; charset=utf-8";
export const description =
  "Claims as Jira-compatible CSV (Summary, Description, Issue Type, Priority, Labels, Status)";

const COLUMNS = [
  "Summary",
  "Description",
  "Issue Type",
  "Priority",
  "Labels",
  "Status",
];

/**
 * Convert a compilation object to Jira-compatible CSV.
 * @param {object} compilation - The compilation.json content
 * @returns {string} CSV output
 */
export function convert(compilation) {
  const claims = compilation.claims || [];

  if (claims.length === 0) {
    return COLUMNS.join(",") + "\n";
  }

  const header = COLUMNS.join(",");
  const rows = claims.map(claimToRow);

  return [header, ...rows].join("\n") + "\n";
}

function claimToRow(claim) {
  const type = claim.type || "";
  const content = claim.content || claim.text || "";
  const summary = `${claim.id || ""}: ${truncate(content, 120)}`;
  const description = content;
  const { issueType, priority } = mapTypeToJira(type);
  const tags = Array.isArray(claim.tags) ? claim.tags.join(" ") : "";
  const status = claim.status || "";

  return [
    escapeField(summary),
    escapeField(description),
    escapeField(issueType),
    escapeField(priority),
    escapeField(tags),
    escapeField(status),
  ].join(",");
}

function mapTypeToJira(type) {
  switch (type) {
    case "risk":
      return { issueType: "Bug", priority: "High" };
    case "recommendation":
      return { issueType: "Task", priority: "Medium" };
    case "constraint":
      return { issueType: "Task", priority: "High" };
    default:
      return { issueType: "Task", priority: "Low" };
  }
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function escapeField(value) {
  if (value == null) return "";
  let str = String(value);
  // CWE-1236: Prevent CSV injection by prefixing formula-triggering characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
