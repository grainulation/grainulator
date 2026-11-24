// Generated from typescript/packages/orchestration/lib/project-config.ts; edit that source and run npm run build:types.
import config from "../../shared/lib/project-config.cjs";
let selection = {};
export function setPortfolioSelection(options = {}) {
	selection = options;
}
export const loadPortfolio = (root) =>
	config.readSection(root, "orchestration", selection).value;
// The shared config layer rejects absent sections before invoking an updater unless
// create is selected; create-mode updaters retain their existing null handling.
export const updatePortfolio = (root, operation, options = {}) =>
	config.updateSection(root, "orchestration", operation, {
		...selection,
		...options,
	});
