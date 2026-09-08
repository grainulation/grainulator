import fs from "node:fs";
import path from "node:path";

/**
 * Hackathon coordinator mode.
 *
 * Uses existing orchard infrastructure to run time-boxed research hackathons.
 * Teams get assigned sprints, a timer tracks the event, and a leaderboard
 * ranks teams by claim count, evidence quality, and compilation status.
 */

const HACKATHON_FILE = "hackathon.json";

/**
 * Default hackathon configuration schema for orchard.json.
 * Users can add a "hackathon" section to orchard.json to preconfigure defaults.
 *
 *   {
 *     "sprints": [...],
 *     "hackathon": {
 *       "time_limit": 120,
 *       "categories": ["research-depth", "evidence-quality", "presentation"],
 *       "judging_weights": {
 *         "claim_count": 1,
 *         "evidence_quality": 2,
 *         "compilation_bonus": 10,
 *         "category_bonus": 5
 *       }
 *     }
 *   }
 */
export const DEFAULT_HACKATHON_CONFIG = {
  time_limit: 120,
  categories: [],
  judging_weights: {
    claim_count: 1,
    evidence_quality: 1,
    compilation_bonus: 10,
    category_bonus: 5,
  },
};

/**
 * Load hackathon configuration from orchard.json.
 * Merges with defaults for any missing fields.
 */
export function loadHackathonConfig(root) {
  const orchardPath = path.join(root, "orchard.json");
  if (!fs.existsSync(orchardPath)) return { ...DEFAULT_HACKATHON_CONFIG };

  try {
    const config = JSON.parse(fs.readFileSync(orchardPath, "utf8"));
    const hackConfig = config.hackathon || {};
    return {
      time_limit: hackConfig.time_limit || DEFAULT_HACKATHON_CONFIG.time_limit,
      categories: hackConfig.categories || DEFAULT_HACKATHON_CONFIG.categories,
      judging_weights: {
        ...DEFAULT_HACKATHON_CONFIG.judging_weights,
        ...(hackConfig.judging_weights || {}),
      },
    };
  } catch {
    return { ...DEFAULT_HACKATHON_CONFIG };
  }
}

/**
 * Initialize a hackathon event.
 * Creates hackathon.json alongside orchard.json.
 * Reads default config from orchard.json "hackathon" section if present.
 */
export function initHackathon(root, opts = {}) {
  const hackPath = path.join(root, HACKATHON_FILE);
  if (fs.existsSync(hackPath)) {
    throw new Error(
      "hackathon.json already exists — end the current hackathon first",
    );
  }

  // Load preconfigured defaults from orchard.json hackathon section
  const hackConfig = loadHackathonConfig(root);

  const durationMinutes = opts.duration || hackConfig.time_limit;
  const now = new Date();
  const endTime = new Date(now.getTime() + durationMinutes * 60 * 1000);

  const hackathon = {
    name: opts.name || "Research Hackathon",
    startTime: now.toISOString(),
    endTime: endTime.toISOString(),
    durationMinutes,
    categories: hackConfig.categories,
    judging_weights: hackConfig.judging_weights,
    teams: [],
    status: "active",
  };

  fs.writeFileSync(hackPath, JSON.stringify(hackathon, null, 2) + "\n", "utf8");
  return hackathon;
}

/**
 * Load hackathon state.
 */
export function loadHackathon(root) {
  const hackPath = path.join(root, HACKATHON_FILE);
  if (!fs.existsSync(hackPath)) return null;
  return JSON.parse(fs.readFileSync(hackPath, "utf8"));
}

/**
 * Add a team to the hackathon. Each team gets a sprint directory.
 */
export function addTeam(root, teamName, question) {
  const hack = loadHackathon(root);
  if (!hack)
    throw new Error("No active hackathon — run orchard hackathon init first");
  if (hack.status !== "active") throw new Error("Hackathon is not active");

  const sprintPath = path.join(
    "sprints",
    `hackathon-${teamName.toLowerCase().replace(/\s+/g, "-")}`,
  );
  const absPath = path.join(root, sprintPath);

  // Create sprint directory with initial claims.json
  fs.mkdirSync(absPath, { recursive: true });
  const initialClaims = {
    schema_version: "1.0",
    meta: {
      question: question || `${teamName}'s hackathon research`,
      initiated: new Date().toISOString().split("T")[0],
      audience: ["hackathon"],
      phase: "define",
      connectors: [],
    },
    claims: [],
  };
  fs.writeFileSync(
    path.join(absPath, "claims.json"),
    JSON.stringify(initialClaims, null, 2) + "\n",
    "utf8",
  );

  hack.teams.push({
    name: teamName,
    sprintPath,
    joinedAt: new Date().toISOString(),
  });

  const hackPath = path.join(root, HACKATHON_FILE);
  fs.writeFileSync(hackPath, JSON.stringify(hack, null, 2) + "\n", "utf8");

  // Also add to orchard.json if it exists
  const orchardPath = path.join(root, "orchard.json");
  if (fs.existsSync(orchardPath)) {
    const config = JSON.parse(fs.readFileSync(orchardPath, "utf8"));
    const exists = (config.sprints || []).some((s) => s.path === sprintPath);
    if (!exists) {
      config.sprints = config.sprints || [];
      config.sprints.push({
        path: sprintPath,
        name: `hackathon-${teamName}`,
        question: question || `${teamName}'s hackathon research`,
        assigned_to: teamName,
      });
      fs.writeFileSync(
        orchardPath,
        JSON.stringify(config, null, 2) + "\n",
        "utf8",
      );
    }
  }

  return { teamName, sprintPath };
}

/**
 * Build leaderboard from current sprint states.
 * Ranks teams by configurable judging_weights from orchard.json hackathon section.
 * Default: compilation (10pts), claim count (1pt each), evidence quality (1pt each).
 */
export function leaderboard(root) {
  const hack = loadHackathon(root);
  if (!hack) return [];

  const weights =
    hack.judging_weights || DEFAULT_HACKATHON_CONFIG.judging_weights;
  const categories = hack.categories || [];
  const evidenceScore = { tested: 4, web: 3, documented: 2, stated: 1 };

  const board = hack.teams.map((team) => {
    const absPath = path.join(root, team.sprintPath);
    const claimsPath = path.join(absPath, "claims.json");
    const compilationPath = path.join(absPath, "compilation.json");

    let claimCount = 0;
    let totalEvidence = 0;
    let types = {};
    let categoryMatches = 0;

    if (fs.existsSync(claimsPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
        const claims = Array.isArray(raw) ? raw : raw.claims || [];
        claimCount = claims.length;
        for (const c of claims) {
          totalEvidence += evidenceScore[c.evidence] || 0;
          const t = c.type || "unknown";
          types[t] = (types[t] || 0) + 1;

          // Check if claim tags match any hackathon categories
          if (categories.length > 0 && Array.isArray(c.tags)) {
            for (const tag of c.tags) {
              if (categories.includes(tag)) categoryMatches++;
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    const hasCompilation = fs.existsSync(compilationPath);
    const compilationBonus = hasCompilation
      ? weights.compilation_bonus || 10
      : 0;
    const claimScore = claimCount * (weights.claim_count || 1);
    const evidenceWeighted = totalEvidence * (weights.evidence_quality || 1);
    const categoryScore = categoryMatches * (weights.category_bonus || 0);
    const score =
      claimScore + evidenceWeighted + compilationBonus + categoryScore;

    return {
      team: team.name,
      sprintPath: team.sprintPath,
      claimCount,
      evidenceScore: totalEvidence,
      hasCompilation,
      types,
      categoryMatches,
      score,
    };
  });

  board.sort((a, b) => b.score - a.score);
  return board;
}

/**
 * Get hackathon timer status.
 */
export function timerStatus(root) {
  const hack = loadHackathon(root);
  if (!hack) return null;

  const now = new Date();
  const end = new Date(hack.endTime);
  const start = new Date(hack.startTime);
  const totalMs = end - start;
  const elapsedMs = now - start;
  const remainingMs = Math.max(0, end - now);

  return {
    name: hack.name,
    status: remainingMs > 0 ? "active" : "ended",
    elapsed: Math.floor(elapsedMs / 60000),
    remaining: Math.ceil(remainingMs / 60000),
    total: Math.floor(totalMs / 60000),
    progress: Math.min(1, elapsedMs / totalMs),
    teamCount: hack.teams.length,
  };
}

/**
 * End the hackathon and print final results.
 */
export function endHackathon(root) {
  const hack = loadHackathon(root);
  if (!hack) throw new Error("No active hackathon");

  hack.status = "ended";
  hack.endedAt = new Date().toISOString();

  const hackPath = path.join(root, HACKATHON_FILE);
  fs.writeFileSync(hackPath, JSON.stringify(hack, null, 2) + "\n", "utf8");

  return leaderboard(root);
}

/**
 * Print hackathon status to stdout.
 */
export function printHackathon(root) {
  const timer = timerStatus(root);
  if (!timer) {
    console.log("");
    console.log(
      "  No active hackathon. Start one with: orchard hackathon init",
    );
    console.log("");
    return;
  }

  const board = leaderboard(root);

  console.log("");
  console.log(`  ${timer.name}`);
  console.log("  " + "=".repeat(50));
  console.log(`  Status: ${timer.status}`);
  console.log(
    `  Time: ${timer.elapsed}m elapsed / ${timer.remaining}m remaining (${timer.total}m total)`,
  );
  console.log(
    `  Progress: ${"#".repeat(Math.floor(timer.progress * 30))}${"·".repeat(30 - Math.floor(timer.progress * 30))} ${Math.floor(timer.progress * 100)}%`,
  );
  console.log(`  Teams: ${timer.teamCount}`);

  if (board.length > 0) {
    console.log("");
    console.log("  Leaderboard:");
    console.log("  " + "-".repeat(50));
    for (let i = 0; i < board.length; i++) {
      const t = board[i];
      const medal =
        i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`;
      const compiled = t.hasCompilation ? " [compiled]" : "";
      console.log(
        `    ${medal}  ${t.team} — ${t.score}pts (${t.claimCount} claims, evidence: ${t.evidenceScore})${compiled}`,
      );
    }
  }

  console.log("");
}
