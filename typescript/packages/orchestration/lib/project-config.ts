import config from "../../shared/lib/project-config.cjs";
import type { Portfolio } from "./orchestration-types.js";
export interface PortfolioSelection {
	workspace?: string | undefined;
	configFile?: string | undefined;
	ascend?: boolean | undefined;
	create?: boolean | undefined;
}
let selection: PortfolioSelection = {};
export function setPortfolioSelection(options: PortfolioSelection = {}) {
	selection = options;
}
export const loadPortfolio = (root: string): Portfolio | undefined =>
	config.readSection<Portfolio>(root, "orchestration", selection).value;
// The shared config layer rejects absent sections before invoking an updater unless
// create is selected; create-mode updaters retain their existing null handling.
export const updatePortfolio = (
	root: string,
	operation: (current: Portfolio) => Portfolio,
	options: PortfolioSelection = {},
) =>
	config.updateSection<Portfolio>(
		root,
		"orchestration",
		operation as (current: Portfolio | undefined) => Portfolio,
		{ ...selection, ...options },
	);
