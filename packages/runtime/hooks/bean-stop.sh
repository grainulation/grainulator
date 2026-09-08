#!/usr/bin/env bash
# bean Stop-hook shim (marketplace path). Locates the bean-hook binary and execs it (passing
# the Stop payload through on stdin). If the binary isn't present yet — e.g. a marketplace
# install where you haven't run ./install.sh or dropped a prebuilt binary — it exits 0 (allow
# the stop) so the hook degrades gracefully instead of erroring on every turn.
bin="$(command -v bean-hook 2>/dev/null || true)"
if [ -z "$bin" ] && [ -x "${CLAUDE_PLUGIN_ROOT:-}/bin/bean-hook" ]; then
	bin="${CLAUDE_PLUGIN_ROOT}/bin/bean-hook"
fi
[ -z "$bin" ] && exit 0
exec "$bin"
