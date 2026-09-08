# barn usage

Barn is the template browser and sprint toolkit for the grainulation ecosystem. It serves a two-column UI for browsing templates and detecting active sprints, with zero npm dependencies.

## Installation

```
npm install -g @grainulation/barn
```

Or run without installing:

```
npx @grainulation/barn <command>
```

Requires Node 20+.

## Commands

### barn serve

Start the template browser UI.

```
barn serve [--port 9093] [--root /path/to/repo] [--cors <origin>] [--verbose]
```

### barn detect-sprints

Find sprint directories in a repository.

```
barn detect-sprints [--json] [--active]
```

### barn generate-manifest

Build a `wheat-manifest.json` topic map from the current repo.

```
barn generate-manifest [--root /path/to/repo]
```

### barn build-pdf

Convert a markdown file to PDF (delegates to `npx md-to-pdf`).

```
barn build-pdf <file.md>
```

## CLI flags

| Flag              | Default | Description                   |
| ----------------- | ------- | ----------------------------- |
| `--port`          | `9093`  | HTTP server port              |
| `--root`          | `cwd`   | Repository root path          |
| `--cors`          | none    | Allowed CORS origin           |
| `--verbose`, `-v` | off     | Log to stderr with timestamps |

## API endpoints

All endpoints are served by `barn serve`.

| Method | Path                        | Description                                                   |
| ------ | --------------------------- | ------------------------------------------------------------- |
| GET    | `/events`                   | SSE event stream for live updates                             |
| GET    | `/api/state`                | Current state (templates, sprints, manifest)                  |
| GET    | `/api/template?name=<name>` | Template content by name                                      |
| GET    | `/api/search?q=<query>`     | Search templates by name, description, placeholders, features |
| POST   | `/api/refresh`              | Refresh state from disk                                       |
| GET    | `/api/docs`                 | API documentation page                                        |

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

Barn hosts the shared design token stylesheet for the grainulation ecosystem. Import it in any HTML template:

```html
<link rel="stylesheet" href="grainulation-tokens.css" />
```

Activate a tool-specific accent scale with the `data-tool` attribute:

```html
<html data-tool="wheat"></html>
```

Three-layer token architecture:

1. **Base** -- backgrounds, foregrounds, borders, spacing, type, radii
2. **Semantic** -- accent (mapped to active tool), status colors, feedback colors
3. **Tool scales** -- per-tool 5-weight accent ramp (50/200/400/600/800)

Available tool accents: `barn` (rose), `wheat` (amber), `grainulation` (neutral).

## Links

- Homepage: https://barn.grainulation.com
- Repository: https://github.com/grainulation/barn
- Issues: https://github.com/grainulation/barn/issues
