#!/usr/bin/env bash
set -euo pipefail

# Mirror official Claude Code docs into docs/claude-code-upstream/.
# Source of truth: https://code.claude.com/docs/llms.txt
# Run from repo root:  bash scripts/mirror-claude-docs.sh

ROOT_URL="https://code.claude.com/docs"
DEST="docs/claude-code-upstream"
INDEX="$DEST/llms.txt"

mkdir -p "$DEST"
echo "Fetching index..."
curl -sSLf "$ROOT_URL/llms.txt" -o "$INDEX"

URLS=$(grep -oE "https://code\.claude\.com/docs/[^)]+\.md" "$INDEX" | sort -u)
TOTAL=$(printf "%s\n" "$URLS" | wc -l | tr -d ' ')
echo "Mirroring $TOTAL pages → $DEST/"

printf "%s\n" "$URLS" | xargs -P 8 -I {} bash -c '
  url="$1"
  rel="${url#https://code.claude.com/docs/}"
  out="'"$DEST"'/$rel"
  mkdir -p "$(dirname "$out")"
  if curl -sSLf "$url" -o "$out.tmp"; then
    mv "$out.tmp" "$out"
  else
    rm -f "$out.tmp"
    echo "FAIL $url" >&2
  fi
' _ {}

echo "Done. Mirrored to $DEST/"
ls "$DEST" | head
