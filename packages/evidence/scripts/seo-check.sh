#!/usr/bin/env bash
# seo-check.sh — Layer 1 regression guard for SEO/AI-visibility site assets.
# Zero deps (Bash + standard Unix). Runs in well under 30s.
# Exits non-zero with a clear message on any failed check.

set -u
FAIL=0
HTML="site/index.html"
PRINT_CSS="site/grainulation-print.css"
LLMS="site/llms.txt"
FAVICON_SVG="site/favicon.svg"

err() {
  echo "FAIL: $1" >&2
  FAIL=1
}

ok() {
  echo "ok: $1"
}

if [ ! -f "$HTML" ]; then
  err "$HTML does not exist"
  exit 1
fi

# 1. <link rel="icon" href="/favicon.svg" ...> present in index.html
if grep -qE '<link[[:space:]]+rel="icon"[^>]*href="/favicon\.svg"' "$HTML"; then
  ok "icon <link> points to /favicon.svg"
else
  err "missing or drifted: <link rel=\"icon\" href=\"/favicon.svg\" ...> in $HTML"
fi

# 2. site/favicon.svg exists
if [ -f "$FAVICON_SVG" ]; then
  ok "$FAVICON_SVG present"
else
  err "$FAVICON_SVG does not exist"
fi

# 3. <link rel="stylesheet" media="print" ...> present
if grep -qE '<link[[:space:]]+rel="stylesheet"[^>]*media="print"' "$HTML"; then
  ok "print stylesheet <link> present"
else
  err "missing: <link rel=\"stylesheet\" media=\"print\" ...> in $HTML"
fi

# 4. site/grainulation-print.css exists
if [ -f "$PRINT_CSS" ]; then
  ok "$PRINT_CSS present (sync-assets vendored it)"
else
  err "$PRINT_CSS does not exist (sync-assets drift)"
fi

# 5. <meta name="description"> content <= 160 chars
DESC=$(grep -oE '<meta[[:space:]]+name="description"[[:space:]]+content="[^"]*"' "$HTML" | head -1 | sed -E 's/.*content="([^"]*)".*/\1/')
if [ -z "$DESC" ]; then
  err "<meta name=\"description\"> missing from $HTML"
else
  DESC_LEN=${#DESC}
  if [ "$DESC_LEN" -le 160 ]; then
    ok "meta description length $DESC_LEN <= 160"
  else
    err "meta description length $DESC_LEN > 160"
  fi
fi

# 6. site/llms.txt exists + zero {{...}} placeholders
if [ ! -f "$LLMS" ]; then
  err "$LLMS does not exist"
else
  if grep -qE '\{\{[^}]*\}\}' "$LLMS"; then
    err "$LLMS contains unrendered {{...}} placeholders"
  else
    ok "$LLMS present and placeholder-free"
  fi
fi

# 7. No data:image/svg+xml strings in site/index.html
if grep -qE 'data:image/svg\+xml' "$HTML"; then
  err "$HTML contains data:image/svg+xml (regressed to inline SVG)"
else
  ok "no data:image/svg+xml in $HTML"
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "SEO regression check: FAILED" >&2
  exit 1
fi
echo ""
echo "SEO regression check: passed"
