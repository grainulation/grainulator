/**
 * Cross-sprint claim analysis.
 *
 * Looks across multiple sprints to find:
 * - Claim type distribution (what kinds of findings dominate?)
 * - Evidence tier distribution (how well-supported are claims?)
 * - Cross-sprint themes (recurring topics or concerns)
 * - Claim density per sprint (productivity signal)
 */

export function analyze(sprints) {
  const allClaims = sprints.flatMap((s) =>
    s.claims.map((c) => ({ ...c, _sprint: s.name })),
  );

  const typeDistribution = countBy(allClaims, "type");
  const evidenceDistribution = countBy(allClaims, "evidence");
  const statusDistribution = countBy(allClaims, "status");

  // Per-sprint density
  const perSprint = sprints.map((s) => ({
    name: s.name,
    claimCount: s.claims.length,
    types: countBy(s.claims, "type"),
    evidence: countBy(s.claims, "evidence"),
    statuses: countBy(s.claims, "status"),
  }));

  // Find cross-sprint themes by looking at tags
  const tagFrequency = {};
  for (const claim of allClaims) {
    const tags = claim.tags || [];
    for (const tag of tags) {
      tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
    }
  }

  // Identify weak spots: claims with low evidence tiers
  const weakClaims = allClaims.filter(
    (c) => c.evidence === "stated" || c.evidence === "web",
  );

  // Type monoculture detection: sprints dominated by a single claim type
  const monocultures = perSprint
    .filter((s) => {
      const types = Object.entries(s.types);
      if (types.length === 0) return false;
      const max = Math.max(...types.map(([, v]) => v));
      return max / s.claimCount > 0.7 && s.claimCount > 3;
    })
    .map((s) => ({
      sprint: s.name,
      dominantType: Object.entries(s.types).sort((a, b) => b[1] - a[1])[0][0],
      ratio: Math.round(
        (Math.max(...Object.values(s.types)) / s.claimCount) * 100,
      ),
    }));

  return {
    summary: {
      totalSprints: sprints.length,
      totalClaims: allClaims.length,
      averageClaimsPerSprint:
        sprints.length > 0
          ? Math.round((allClaims.length / sprints.length) * 10) / 10
          : 0,
    },
    typeDistribution,
    evidenceDistribution,
    statusDistribution,
    tagFrequency,
    weakClaims: weakClaims.map((c) => ({
      id: c.id,
      sprint: c._sprint,
      type: c.type,
      evidence: c.evidence,
      text: c.text || c.claim || c.description,
    })),
    monocultures,
    perSprint,
  };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const val = item[key] || "unknown";
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}
