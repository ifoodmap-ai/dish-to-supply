#!/usr/bin/env bash
# 把截圖 + 字幕 + 音樂合成展場循環短片。
#
# 流程:
#   1. 每張截圖 → 加極緩慢的 Ken Burns 運鏡 → 疊上該段字幕 → 一支小片段
#   2. 片段之間用 xfade 交叉溶接串起來
#   3. 混入 music.sh 產生的襯底
#
# 為什麼字幕是 PNG 疊上去而不是 ffmpeg 畫的:這台的 ffmpeg 沒有 drawtext 濾鏡。
# 反而因禍得福 —— 字幕排版是瀏覽器渲染的,中文字型與行距都比 drawtext 好看。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
F="$ROOT/demo-video-out/frames"
WORK="$ROOT/demo-video-out/work"
OUT="$ROOT/demo-video-out/ifoodmap-demo-loop.mp4"
MUSIC="${MUSIC:-$ROOT/demo-video-out/audio/bed.wav}"

FPS=30
XF=0.5            # 交叉溶接長度
W=1920; H=1080

mkdir -p "$WORK"
rm -f "$WORK"/seg*.mp4

# 分鏡:frame|秒數|字幕(- 表示不加)|運鏡焦點(center/top)
SEGMENTS=(
  "card-intro|5.0|-|still"
  "01-login|5.0|cap1|center"
  "02-analyze|5.0|cap2|top"
  "02b-analyze-result|6.5|cap2b|top"
  "03-menu|6.0|cap3|top"
  "04-orders|6.0|cap4|center"
  "05-receive|6.5|cap4b|center"
  "06-leads|6.5|cap5|top"
  "07-supplier-dash|5.0|cap5b|top"
  "08-pipeline|6.0|cap6|top"
  "09-timeline|6.0|cap6b|top"
  "card-outro|6.0|-|still"
)

echo "1/3 產生片段…"
i=0
for spec in "${SEGMENTS[@]}"; do
  IFS='|' read -r name dur cap focus <<< "$spec"
  src="$F/$name.png"
  [[ -f "$src" ]] || { echo "✗ 缺少 $src"; exit 1; }

  frames=$(python3 -c "print(int($dur * $FPS))")

  if [[ "$focus" == "still" ]]; then
    # 開場/結尾卡不要運鏡 —— 卡片本身是排版好的,推近反而糊
    vf="scale=${W}:${H},format=yuv420p"
  else
    # Ken Burns。這裡有個 zoompan 的經典地雷:
    #   -loop 1 會餵進「一整串」相同的畫格,而 zoompan 的 d=N 是「每一張輸入畫格
    #   產生 N 張輸出」—— 兩個乘起來會變成幾萬張,檔案爆到幾百 MB、算好幾分鐘。
    # 正解是 d=1(一進一出),靠 zoom 變數自己跨畫格累加來推近。
    #
    # 放大倍率也從 2 倍降到 1.3 倍 —— 只推到 1.10,1.3 倍的畫素已經綽綽有餘。
    if [[ "$focus" == "top" ]]; then
      yexpr="0"          # 內容集中在上半部的頁面,鏡頭咬住頂端
    else
      yexpr="ih/2-(ih/zoom/2)"
    fi
    zstep=$(python3 -c "print(f'{0.10 / $frames:.8f}')")   # 整段剛好推到 1.10
    vf="scale=$((W * 13 / 10)):-2,zoompan=z='min(zoom+${zstep},1.10)':x='iw/2-(iw/zoom/2)':y='${yexpr}':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p"
  fi

  if [[ "$cap" == "-" ]]; then
    ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate "$FPS" -t "$dur" -i "$src" \
      -vf "$vf" -r "$FPS" -c:v libx264 -crf 19 -preset veryfast -pix_fmt yuv420p \
      "$WORK/seg$(printf '%02d' $i).mp4"
  else
    # 字幕在段落開始 0.4 秒後淡入,結束前 0.5 秒淡出
    capout=$(python3 -c "print(f'{$dur - 0.9:.2f}')")
    ffmpeg -hide_banner -loglevel error -y \
      -loop 1 -framerate "$FPS" -t "$dur" -i "$src" \
      -loop 1 -framerate "$FPS" -t "$dur" -i "$F/card-$cap.png" \
      -filter_complex "[0:v]${vf}[bg];\
[1:v]format=rgba,fade=t=in:st=0.4:d=0.45:alpha=1,fade=t=out:st=${capout}:d=0.45:alpha=1[cap];\
[bg][cap]overlay=0:0:format=auto,format=yuv420p[v]" \
      -map "[v]" -r "$FPS" -c:v libx264 -crf 19 -preset veryfast -pix_fmt yuv420p \
      "$WORK/seg$(printf '%02d' $i).mp4"
  fi

  echo "   ✓ $(printf '%02d' $i) $name (${dur}s${cap:+, $cap})"
  i=$((i + 1))
done

echo "2/3 交叉溶接…"
# xfade 要一段一段接:每接一次,下一段的 offset = 已累積長度 - 溶接長度
inputs=(); filt=""; prev="[0:v]"; acc=0
n=${#SEGMENTS[@]}
for ((k = 0; k < n; k++)); do
  inputs+=(-i "$WORK/seg$(printf '%02d' $k).mp4")
done

for ((k = 0; k < n; k++)); do
  IFS='|' read -r _ dur _ _ <<< "${SEGMENTS[$k]}"
  if [[ $k -eq 0 ]]; then
    acc=$(python3 -c "print(f'{$dur:.3f}')")
    continue
  fi
  off=$(python3 -c "print(f'{$acc - $XF:.3f}')")
  label="[x$k]"
  [[ $k -eq $((n - 1)) ]] && label="[vout]"
  filt+="${prev}[${k}:v]xfade=transition=fade:duration=${XF}:offset=${off}${label};"
  prev="$label"
  acc=$(python3 -c "print(f'{$acc + $dur - $XF:.3f}')")
done
filt="${filt%;}"

ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" \
  -filter_complex "$filt" -map "[vout]" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r "$FPS" \
  "$WORK/silent.mp4"

VDUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$WORK/silent.mp4")
echo "   影像長度 ${VDUR}s"

echo "3/3 混音輸出…"
[[ -f "$MUSIC" ]] || { echo "✗ 找不到音樂 $MUSIC(先跑 music.sh)"; exit 1; }

# 音樂比影片長就裁掉、短就補靜音,結尾再淡出 1.5 秒
ffmpeg -hide_banner -loglevel error -y \
  -i "$WORK/silent.mp4" -i "$MUSIC" \
  -filter_complex "[1:a]apad,atrim=0:${VDUR},afade=t=out:st=$(python3 -c "print(f'{float('$VDUR') - 1.5:.2f}')"):d=1.5[a]" \
  -map 0:v -map "[a]" \
  -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest \
  "$OUT"

echo
ffprobe -hide_banner -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,nb_frames \
  -show_entries format=duration,size -of default=nw=1 "$OUT"
echo "→ $OUT"
