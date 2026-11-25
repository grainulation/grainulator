# Shared utilities

This private workspace supplies sprint discovery, filesystem safety and manifest
utilities to the Grainulator product. Use the root CLI with Node.js 24 or later.

```sh
grainulator utils detect-sprints --json
grainulator utils detect-sprints --active
grainulator utils generate-manifest --root /path/to/repo
```

`--verbose` logs command activity to stderr. Repository tools accept `--root`
where documented. Evidence can be exported as JSON, Markdown, CSV and other data
formats through `grainulator export`; presentation and PDF rendering belong to
consumer tools. Browser servers, HTML templates and built-in PDF rendering are
retired.
