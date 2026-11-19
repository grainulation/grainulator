# shared usage

The shared component provides sprint discovery, report assets, and template-loading utilities. Browser interfaces and website asset vendoring are retired; use the CLI tools below.

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

Report templates are self-contained. The product no longer exports a website token stylesheet or site-vendoring utility.

## Links

- Homepage: https://grainulator.dev
- Repository: https://github.com/grainulation/grainulator
- Issues: https://github.com/grainulation/grainulator/issues
