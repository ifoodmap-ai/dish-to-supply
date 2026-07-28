#!/usr/bin/env bash
# 合成展場循環片的背景音樂。
#
# 全部用 ffmpeg 的 sine 產生器疊出來 —— 原創、無版權問題,不需要任何外部素材。
# 老實說:這就是個和弦襯底,不是製作過的配樂。要換成真正的音樂,
# 把 build.sh 的 MUSIC 指到你的檔案就好。
#
# 進行:Cmaj7 → Am7 → Fmaj7 → G7,各 8 秒,跑兩輪 = 64 秒。
# 每個和弦自己淡入淡出,所以和弦之間不會有接縫,首尾也接得起來(循環播放不爆音)。

set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")/../.." && pwd)/demo-video-out/audio"
mkdir -p "$OUT_DIR"
TMP="$OUT_DIR/tmp"
mkdir -p "$TMP"

SR=44100
CHORD_SEC=8
FADE=1.6          # 進出各 1.6 秒 —— 夠長才聽不出切換
DETUNE=1.004      # 每個和弦第二層微幅升高,製造厚度(純正弦太死)

# 和弦(Hz)。根音放在 C3 附近,再低會在展場喇叭變成嗡嗡聲。
CHORDS=(
  "130.81 164.81 196.00 246.94"   # Cmaj7  C3 E3 G3 B3
  "110.00 130.81 164.81 196.00"   # Am7    A2 C3 E3 G3
  " 87.31 110.00 130.81 164.81"   # Fmaj7  F2 A2 C3 E3
  " 98.00 123.47 146.83 174.61"   # G7     G2 B2 D3 F3
)

echo "合成和弦…"
i=0
for chord in "${CHORDS[@]}"; do
  read -r -a f <<< "$chord"

  # 每個音兩層(原音 + 微幅 detune),八個 sine 疊成一個和弦
  inputs=()
  filters=()
  n=0
  for freq in "${f[@]}"; do
    for mult in 1 "$DETUNE"; do
      hz=$(python3 -c "print(f'{$freq * $mult:.4f}')")
      inputs+=(-f lavfi -t "$CHORD_SEC" -i "sine=frequency=${hz}:sample_rate=${SR}")
      # 低音給大一點、高音收小一點,不然高頻會刺
      vol=$(python3 -c "print(f'{0.16 / (1 + $n * 0.22):.4f}')")
      filters+=("[${n}:a]volume=${vol}[v${n}]")
      n=$((n + 1))
    done
  done

  mixin=""
  for ((k = 0; k < n; k++)); do mixin+="[v${k}]"; done

  ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" \
    -filter_complex "$(IFS=';'; echo "${filters[*]}");${mixin}amix=inputs=${n}:normalize=0[mix];[mix]afade=t=in:st=0:d=${FADE},afade=t=out:st=$(python3 -c "print($CHORD_SEC - $FADE)"):d=${FADE}[out]" \
    -map "[out]" -c:a pcm_s16le "$TMP/chord$i.wav"

  i=$((i + 1))
done

echo "串成 64 秒…"
# 跑兩輪
: > "$TMP/list.txt"
for _ in 1 2; do
  for ((k = 0; k < ${#CHORDS[@]}; k++)); do
    echo "file '$TMP/chord$k.wav'" >> "$TMP/list.txt"
  done
done

ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$TMP/list.txt" \
  -c:a pcm_s16le "$TMP/raw.wav"

echo "柔化 + 空間感 + 壓到 -18dB…"
# lowpass 把正弦的硬邊磨掉;aecho 做一點空間;最後 loudnorm 統一到 -18 LUFS
ffmpeg -hide_banner -loglevel error -y -i "$TMP/raw.wav" \
  -af "lowpass=f=1600,aecho=0.8:0.9:180|320:0.28|0.18,loudnorm=I=-18:TP=-3:LRA=7,afade=t=in:st=0:d=2,afade=t=out:st=62:d=2" \
  -c:a pcm_s16le "$OUT_DIR/bed.wav"

rm -rf "$TMP"

echo
ffprobe -hide_banner -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT_DIR/bed.wav" \
  | xargs printf "長度 %.2f 秒\n"
ffmpeg -hide_banner -v error -i "$OUT_DIR/bed.wav" -af astats=measure_overall=Peak_level:measure_perchannel=0 -f null - 2>&1 \
  | grep -i "peak level" | head -1
echo "→ $OUT_DIR/bed.wav"
