# shared usage

The shared component provides sprint discovery, report assets, and template-loading utilities. Its browser UI is retired; use the CLI tools below or `grainulator preview` for the research playground.

## Installation

```
npm install -g @grainulation/grainulator-shared
```

Or run without installing:

```
grainulator utils <command>
```

Requires Node 20+.

## Commands

### shared detect-sprints

Find sprint directories in a repository.

```
shared detect-sprints [--json] [--active]
```

### shared generate-manifest

Build a `.grainulator/evidence/manifest.json` topic map from the current repo.

```
shared generate-manifest [--root /path/to/repo]
```

### shared build-pdf

Convert a markdown file to PDF (delegates to `npx md-to-pdf`).

```
shared build-pdf <file.md>
```

## CLI flags

`--verbose` logs command activity to stderr. Repository tools accept `--root`
where documented. Browser-server flags and HTTP endpoints have been retired.

## Template metadata

Each template is an HTML file in `templates/`. An optional JSON sidecar provides metadata. For a template named `dark-scroll.html`, place metadata in `templates/dark-scroll.html.json`:

```json
{
  "title": "Dark Scroll",
  "description": "Snap-scrolling dark presentation template",
  "tags": ["presentation", "dark"],
  "author": "grainulation contributors",
  "version": "1.0.0",
  "exportPresets": ["pdf", "png"],
  "seedPacks": ["sprint-status", "comparison-table"],
  "scaffoldConfig": {
    "sections": 5,
    "layout": "scroll-snap"
  }
}
```

All fields are optional. Auto-detected features (CSS grid, charts, cards, slides) are merged from the HTML content regardless of the sidecar.

## Design tokens

Grainulator shared hosts the shared design token stylesheet for the grainulation ecosystem. Import it in any HTML template:

```html
<link rel="stylesheet" href="grainulation-tokens.css" />
```

Activate a tool-specific accent scale with the `data-tool` attribute:

```html
<html data-tool="evidence"></html>
```

Three-layer token architecture:

1. **Base** -- backgrounds, foregrounds, borders, spacing, type, radii
2. **Semantic** -- accent (mapped to active tool), status colors, feedback colors
3. **Tool scales** -- per-tool 5-weight accent ramp (50/200/400/600/800)

Available tool accents: `shared` (rose), `evidence` (amber), `grainulation` (neutral).

## Links

- Homepage: https://grainulator.dev
- Repository: https://github.com/grainulation/grainulator
- Issues: https://github.com/grainulation/grainulator/issues
