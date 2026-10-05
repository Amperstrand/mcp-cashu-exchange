#!/usr/bin/env bash
# shot.sh — render each mockup screen to a PNG with system Chrome (no Playwright).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/screens"
mkdir -p "$OUT"
PAGE="file://$HERE/mockups.html"
CHROME=/usr/bin/google-chrome-stable
for n in 1 2 3 4 5 6 7 8; do
  "$CHROME" --headless=old --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --virtual-time-budget=2500 \
    --window-size=420,880 \
    --screenshot="$OUT/screen-$n.png" "$PAGE?s=$n" >/dev/null 2>&1
  printf 'screen-%s: %s\n' "$n" "$(stat -c%s "$OUT/screen-$n.png" 2>/dev/null || echo MISSING)"
done
echo "--- dimensions ---"
for f in "$OUT"/*.png; do printf '%s %s\n' "$(basename "$f")" "$(ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$f" 2>/dev/null)"; done
