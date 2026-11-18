import config from '../../shared/lib/project-config.cjs';
let selection={};
export function setPortfolioSelection(options={}) {selection=options;}
export const loadPortfolio = root => config.readSection(root,'orchestration',selection).value;
export const updatePortfolio = (root,operation,options={}) => config.updateSection(root,'orchestration',operation,{...selection,...options});
