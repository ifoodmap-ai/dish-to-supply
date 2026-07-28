#!/usr/bin/env bash
# 一次做完:擷取畫面 → 合成音樂 → 合成影片。
# 個別重跑看 README.md。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "═══ 1/3 擷取畫面 ═══"
python3 "$HERE/capture.py"

echo
echo "═══ 2/3 合成音樂 ═══"
bash "$HERE/music.sh"

echo
echo "═══ 3/3 合成影片 ═══"
bash "$HERE/build.sh"
