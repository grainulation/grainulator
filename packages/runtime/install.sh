#!/usr/bin/env bash
#
# bean installer — builds the Rust runtime and wires it into Claude Code (and Codex).
#
# What you get after this:
#   - the bean runtime binaries (bean-check, bean-verify, bean-run, bean-hook, bean-lessons) built into ./bin
#   - the /bean skill installed
#   - a native Stop hook registered so bean COUPLES to execution: an agent can't finish a
#     bean-tracked task (one with a .bean/ ledger) until the loop converges. Inert otherwise.
#
# Usage:
#   ./install.sh                         # build + install for the current user
#   CLAUDE_CONFIG_DIR=... ./install.sh   # custom Claude config dir
#
# Requires: Rust (cargo). No runtime dependencies — the binaries are self-contained.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_CONFIG_DIR:-$HOME/.codex}"

build_runtime() {
	command -v cargo >/dev/null 2>&1 || {
		echo "  ERROR: cargo (Rust) is required to build the bean runtime." >&2
		echo "         Install from https://rustup.rs and re-run." >&2
		exit 1
	}
	echo "  building the Rust runtime (release)..."
	cargo build --release --quiet --manifest-path "$REPO_DIR/rs/Cargo.toml"
	mkdir -p "$REPO_DIR/bin"
	for b in bean-check bean-verify bean-run bean-hook bean-lessons; do
		cp "$REPO_DIR/rs/target/release/$b" "$REPO_DIR/bin/$b"
	done
	echo "  binaries -> $REPO_DIR/bin (bean-check, bean-verify, bean-run, bean-hook, bean-lessons)"
}

install_claude() {
	mkdir -p "$CLAUDE_DIR/skills"
	rm -rf "$CLAUDE_DIR/skills/bean"
	cp -R "$REPO_DIR/skills/bean" "$CLAUDE_DIR/skills/bean"
	echo "  skill -> $CLAUDE_DIR/skills/bean (provides /bean)"
	# register the native Stop hook (idempotent JSON merge into settings.json)
	"$REPO_DIR/bin/bean-hook" --register "$CLAUDE_DIR" | sed 's/^/  /'
}

install_codex() {
	if [ -d "$CODEX_DIR" ]; then
		mkdir -p "$CODEX_DIR/skills"
		rm -rf "$CODEX_DIR/skills/bean"
		cp -R "$REPO_DIR/skills/bean" "$CODEX_DIR/skills/bean"
		echo "  skill -> $CODEX_DIR/skills/bean"
		# Codex's Stop hook uses the SAME contract as Claude's; register into hooks.json
		"$REPO_DIR/bin/bean-hook" --register "$CODEX_DIR" hooks.json | sed 's/^/  /'
	else
		echo "  (Codex config dir $CODEX_DIR not found — skipping Codex install)"
	fi
}

echo "Installing bean..."
build_runtime
install_claude
install_codex
echo "Done. Restart Claude Code. In a project, run /bean; the Stop hook keeps the loop honest."
