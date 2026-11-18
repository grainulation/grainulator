/**
 * Smart defaults and environment detection for evidence CLI.
 * Central location for all process.env reads — other modules import from here.
 * Zero dependencies — Node built-ins only.
 */

export const DEFAULTS = {
	audience: ["engineers"],
	constraints: [],
	doneCriteria: "Decision-ready brief with evidence",
};

/**
 * Centralized environment variable reads.
 * Every process.env reference in the evidence codebase should go through this object.
 */
export const env = {
	/** True if running in any CI environment */
	get CI() {
		return Boolean(
			process.env.CI ||
				process.env.GITHUB_ACTIONS ||
				process.env.GITLAB_CI ||
				process.env.CIRCLECI ||
				process.env.JENKINS_URL ||
				process.env.BUILDKITE,
		);
	},
	/** Enable debug stack traces in CLI error output */
	get GRAINULATOR_DEBUG() {
		return process.env.GRAINULATOR_DEBUG || "";
	},
	/** Pre-computed sprint data JSON to avoid re-running detectSprints */
	get GRAINULATOR_SPRINTS_CACHE() {
		return process.env.GRAINULATOR_SPRINTS_CACHE || "";
	},
	/** Set when running inside Grainulation plugin — skips .mcp.json generation */
	get CLAUDE_PLUGIN_ROOT() {
		return process.env.CLAUDE_PLUGIN_ROOT || "";
	},
};

export function isTTY() {
	return Boolean(process.stdout.isTTY) && !isCI();
}

export function isCI() {
	return env.CI;
}

export function outputMode() {
	if (process.argv.includes("--quiet")) return "quiet";
	if (process.argv.includes("--json")) return "json";
	if (!isTTY()) return "json";
	return "tty";
}
