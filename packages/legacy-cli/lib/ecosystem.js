/**
 * The grainulation ecosystem registry.
 *
 * Seven tools. Each grows from the same soil:
 * question -> evidence -> decision.
 */

const TOOLS = [
  {
    name: 'wheat',
    package: '@grainulation/wheat',
    icon: 'W',
    role: 'Grows evidence',
    description: 'Research sprint engine. Ask a question, grow claims, compile a brief.',
    category: 'core',
    port: 9091,
    entryPoint: true,
  },
  {
    name: 'barn',
    package: '@grainulation/barn',
    icon: 'B',
    role: 'Shared tools',
    description: 'Public utilities. Claim schemas, HTML templates, shared validators.',
    category: 'foundation',
    port: 9093,
    entryPoint: false,
  },
  {
    name: 'mill',
    package: '@grainulation/mill',
    icon: 'M',
    role: 'Processes output',
    description: 'Export and publish. Turn compiled research into PDFs, slides, wikis.',
    category: 'output',
    port: 9094,
    entryPoint: false,
  },
  {
    name: 'silo',
    package: '@grainulation/silo',
    icon: 'S',
    role: 'Stores knowledge',
    description: 'Reusable claim libraries. Share vetted claims across sprints and teams.',
    category: 'storage',
    port: 9095,
    entryPoint: false,
  },
  {
    name: 'harvest',
    package: '@grainulation/harvest',
    icon: 'H',
    role: 'Analytics & retrospectives',
    description: 'Cross-sprint learning. Track prediction accuracy, find blind spots over time.',
    category: 'analytics',
    port: 9096,
    entryPoint: false,
  },
  {
    name: 'orchard',
    package: '@grainulation/orchard',
    icon: 'O',
    role: 'Orchestration',
    description: 'Multi-sprint coordination. Run parallel research tracks, merge results.',
    category: 'orchestration',
    port: 9097,
    entryPoint: false,
  },
  {
    name: 'grainulation',
    package: '@grainulation/grainulation',
    icon: 'G',
    role: 'The machine',
    description: 'Compatibility CLI and cleanup for previously launched component processes.',
    category: 'meta',
    port: 9098,
    entryPoint: false,
  },
];

function getAll() {
  return TOOLS;
}

function getByName(name) {
  return TOOLS.find((t) => t.name === name);
}

function getInstallable() {
  return TOOLS.filter((t) => t.name !== 'grainulation');
}

function getCategories() {
  const cats = {};
  for (const tool of TOOLS) {
    if (!cats[tool.category]) cats[tool.category] = [];
    cats[tool.category].push(tool);
  }
  return cats;
}

module.exports = { TOOLS, getAll, getByName, getInstallable, getCategories };
