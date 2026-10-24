#!/bin/sh
# Download a source ref, then use the same installer as the local/npm entry.
# DEST defaults to PWD. LOOPKIT_REPO=syxc/loopkit, LOOPKIT_REF=main.
# FORCE=1 explicitly overwrites files; BACKUP=1 snapshots .claude first.
set -eu
REPO=${LOOPKIT_REPO:-syxc/loopkit}
REF=${LOOPKIT_REF:-main}
DEST=${DEST:-$PWD}
for cmd in node curl tar mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || { printf 'Required command missing: %s\n' "$cmd" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' || { printf 'Node >=18 required\n' >&2; exit 1; }
[ -d "$DEST" ] || { printf 'DEST must exist\n' >&2; exit 1; }
DEST=$(CDPATH= cd -P "$DEST" && pwd)
TMP=$(mktemp -d)
# Only the new disposable download directory is removed.
trap 'rm -rf "$TMP"' EXIT
trap 'exit 2' INT TERM
printf 'Downloading %s@%s\n' "$REPO" "$REF"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" > "$TMP/source.tar.gz"
mkdir "$TMP/source"
tar -xzf "$TMP/source.tar.gz" --strip-components=1 -C "$TMP/source"
if [ "${BACKUP:-0}" = 1 ] && [ -e "$DEST/.claude" ]; then
  cp -R "$DEST/.claude" "$DEST/.claude.bak-$(date +%Y%m%d-%H%M%S)-$$"
fi
cd "$DEST"
if [ "${FORCE:-0}" = 1 ]; then
  node "$TMP/source/bin/loopkit.js" init --force
else
  node "$TMP/source/bin/loopkit.js" init
fi
