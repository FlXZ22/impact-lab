#!/usr/bin/env bash
# Fast before/after + wallpaper/color/prototype screenshots via headless chromium.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/screenshots"; mkdir -p "$OUT"

shoot() { # name query
  chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --window-size=1440,900 --virtual-time-budget=2600 \
    --screenshot="$OUT/$1.png" \
    "file://$DIR/index.html$2" 2>/dev/null
  echo "  $1.png"
}

echo "wallpapers:"
for w in mono aurora sunset ocean midnight; do
  shoot "wp-$w" "?wp=$w"
done

echo "colors (on aurora):"
for c in clear blue pink mint amber ink; do
  shoot "color-$c" "?wp=aurora&color=$c"
done

echo "states + prototypes:"
shoot before  "?wp=mono"
shoot after   "?wp=mono&state=pressed"
shoot protos  "?state=protos&wp=aurora&color=blue"
shoot protos-mono "?state=protos&wp=mono"

echo "building contact sheets..."
ffmpeg -v error -y \
  -i "$OUT/wp-mono.png" -i "$OUT/wp-aurora.png" -i "$OUT/wp-sunset.png" -i "$OUT/wp-ocean.png" -i "$OUT/wp-midnight.png" \
  -filter_complex "[0]scale=560:350[a];[1]scale=560:350[b];[2]scale=560:350[c];[3]scale=560:350[d];[4]scale=560:350[e];[a][b][c][d][e]hstack=5" \
  "$OUT/sheet-wallpapers.png"
ffmpeg -v error -y \
  -i "$OUT/color-clear.png" -i "$OUT/color-blue.png" -i "$OUT/color-pink.png" \
  -i "$OUT/color-mint.png" -i "$OUT/color-amber.png" -i "$OUT/color-ink.png" \
  -filter_complex "[0]scale=560:350[a];[1]scale=560:350[b];[2]scale=560:350[c];[3]scale=560:350[d];[4]scale=560:350[e];[5]scale=560:350[f];[a][b][c][d][e][f]hstack=6" \
  "$OUT/sheet-colors.png"
ffmpeg -v error -y -i "$OUT/before.png" -i "$OUT/after.png" \
  -filter_complex "[0]scale=720:450[a];[1]scale=720:450[b];[a][b]hstack" \
  "$OUT/comparison.png"
echo "done"
