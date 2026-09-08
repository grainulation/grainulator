/**
 * mill format: confluence-adf
 *
 * Converts compilation.json to Atlassian Document Format (ADF) JSON.
 * ADF is the native document format for Confluence Cloud REST API.
 * Output can be POST'd directly to /wiki/api/v2/pages.
 * Zero dependencies — node built-in only.
 */

export const name = "confluence-adf";
export const extension = ".adf.json";
export const mimeType = "application/json; charset=utf-8";
export const description =
  "Confluence ADF (Atlassian Document Format) for direct API upload";

/**
 * Convert a compilation object to Confluence ADF JSON.
 * @param {object} compilation - The compilation.json content
 * @returns {string} ADF JSON output
 */
export function convert(compilation) {
  const meta = compilation.meta || {};
  const claims = compilation.claims || [];
  const conflicts = compilation.conflicts || [];
  const certificate = compilation.certificate || {};

  const title = meta.sprint || meta.question || "Sprint Report";
  const compiled = certificate.compiled_at || new Date().toISOString();
  const active = claims.filter((c) => c.status === "active").length;

  const content = [];

  // Title heading
  content.push(heading(1, title));

  // Question as blockquote
  if (meta.question) {
    content.push(blockquote(meta.question));
  }

  // Meta paragraph
  const metaParts = [`Compiled: ${compiled}`];
  if (meta.audience) metaParts.push(`Audience: ${meta.audience}`);
  content.push(paragraph([text(metaParts.join(" | "), [mark("em")])]));

  // Summary panel
  content.push(heading(2, "Summary"));
  content.push(
    table(
      [tableRow([tableHeader("Metric"), tableHeader("Count")])],
      [
        tableRow([tableCell("Total claims"), tableCell(String(claims.length))]),
        tableRow([tableCell("Active"), tableCell(String(active))]),
        ...(conflicts.length > 0
          ? [
              tableRow([
                tableCell("Conflicts"),
                tableCell(String(conflicts.length)),
              ]),
            ]
          : []),
      ],
    ),
  );

  // Group claims by type (skip reverted)
  const byType = {};
  for (const c of claims) {
    if (c.status === "reverted") continue;
    const t = c.type || "unknown";
    if (!byType[t]) byType[t] = [];
    byType[t].push(c);
  }

  const typeOrder = [
    "constraint",
    "factual",
    "recommendation",
    "risk",
    "estimate",
    "feedback",
  ];
  const sortedTypes = typeOrder.filter((t) => byType[t]);
  for (const t of Object.keys(byType)) {
    if (!sortedTypes.includes(t)) sortedTypes.push(t);
  }

  // Status macro mapping for claim types
  const statusColors = {
    risk: "red",
    constraint: "red",
    recommendation: "green",
    factual: "blue",
    estimate: "purple",
    feedback: "yellow",
  };

  // Per-type sections
  for (const t of sortedTypes) {
    const group = byType[t];
    content.push(heading(2, `${capitalize(t)}s (${group.length})`));

    // Add info/warning panels for risks and constraints
    if (t === "risk" && group.length > 0) {
      content.push(
        panel(
          "warning",
          group.length + " risk(s) identified -- review before proceeding",
        ),
      );
    } else if (t === "constraint" && group.length > 0) {
      content.push(
        panel(
          "error",
          group.length + " hard constraint(s) -- these are non-negotiable",
        ),
      );
    }

    // Claims table
    content.push(
      table(
        [
          tableRow([
            tableHeader("ID"),
            tableHeader("Content"),
            tableHeader("Evidence"),
            tableHeader("Confidence"),
            tableHeader("Status"),
          ]),
        ],
        group.map((c) => {
          const body = c.content || c.text || "";
          const tier =
            typeof c.evidence === "string"
              ? c.evidence
              : c.evidence?.tier || c.evidence_tier || "";
          const conf =
            c.confidence != null ? Math.round(c.confidence * 100) + "%" : "--";
          const status = c.status || "active";
          return tableRow([
            tableCell(c.id || ""),
            tableCell(body),
            tableCell(tier),
            tableCell(conf),
            tableCellWithStatus(status, statusColors[t] || "neutral"),
          ]);
        }),
      ),
    );

    // Tags as labels
    const allTags = new Set();
    for (const c of group) {
      if (Array.isArray(c.tags)) c.tags.forEach((tag) => allTags.add(tag));
    }
    if (allTags.size > 0) {
      content.push(
        paragraph([
          text("Tags: ", [mark("strong")]),
          text([...allTags].join(", ")),
        ]),
      );
    }

    // Wrap large sections in expand macro
    if (group.length > 10) {
      content.push(
        paragraph([
          text(
            `Showing all ${group.length} ${t} claims. Consider using Confluence page filtering for large datasets.`,
            [mark("em")],
          ),
        ]),
      );
    }
  }

  // Conflicts section
  if (conflicts.length > 0) {
    content.push(heading(2, `Conflicts (${conflicts.length})`));
    const items = conflicts.map((c) => {
      const ids = Array.isArray(c.ids)
        ? c.ids.join(" vs ")
        : c.between || "unknown";
      const desc = c.description || c.reason || "";
      const resolved = c.resolution ? ` [resolved: ${c.resolution}]` : "";
      return bulletItem(`${ids}: ${desc}${resolved}`);
    });
    content.push(bulletList(items));
  }

  // Certificate footer
  content.push(rule());
  content.push(
    paragraph([
      text(
        `Certificate: ${certificate.claim_count || claims.length} claims | sha256:${(certificate.sha256 || "unknown").slice(0, 16)}`,
        [mark("code")],
      ),
    ]),
  );

  const doc = {
    version: 1,
    type: "doc",
    content,
  };

  return JSON.stringify(doc, null, 2) + "\n";
}

// --- ADF node builders ---

function heading(level, text_) {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text: text_ }],
  };
}

function paragraph(inlines) {
  return { type: "paragraph", content: inlines };
}

function text(value, marks_) {
  const node = { type: "text", text: value };
  if (marks_ && marks_.length > 0) node.marks = marks_;
  return node;
}

function mark(type) {
  return { type };
}

function blockquote(text_) {
  return {
    type: "blockquote",
    content: [paragraph([text(text_)])],
  };
}

function bulletList(items) {
  return { type: "bulletList", content: items };
}

function bulletItem(text_) {
  return {
    type: "listItem",
    content: [paragraph([text(text_)])],
  };
}

function panel(panelType, text_) {
  return {
    type: "panel",
    attrs: { panelType },
    content: [paragraph([text(text_)])],
  };
}

function rule() {
  return { type: "rule" };
}

function table(headerRows, bodyRows) {
  return {
    type: "table",
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    content: [...headerRows, ...bodyRows],
  };
}

function tableRow(cells) {
  return { type: "tableRow", content: cells };
}

function tableHeader(text_) {
  return {
    type: "tableHeader",
    attrs: {},
    content: [paragraph([text(text_, [mark("strong")])])],
  };
}

function tableCell(text_) {
  return {
    type: "tableCell",
    attrs: {},
    content: [paragraph([text(text_)])],
  };
}

function tableCellWithStatus(statusText, color) {
  return {
    type: "tableCell",
    attrs: {},
    content: [
      paragraph([
        {
          type: "status",
          attrs: { text: statusText, color, localId: "", style: "" },
        },
      ]),
    ],
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
