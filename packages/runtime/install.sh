#!/usr/bin/env bash
# Explicit offline installation only. The root CLI verifies a separately pinned
# release manifest and matching target archive; it never builds or edits host settings.
set -euo pipefail
RUNTIME_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$RUNTIME_SCRIPT_DIR/../../bin/grainulator.js" runtime install "$@"
