# 展場循環 Demo 短片

64 秒、1920×1080、有背景音樂、結尾接回開頭可以整天循環播的短片。
攤位上不用人顧,路過的人不聽聲音也看得懂。

```bash
bash scripts/demo-video/make.sh          # 全部重做
```

成品在 `demo-video-out/ifoodmap-demo-loop.mp4`(這個目錄不進 git)。

## 三個步驟

| 步驟 | 指令 | 做什麼 |
|---|---|---|
| 擷取 | `python3 scripts/demo-video/capture.py` | 開系統 Chrome 登入三個身分,把要入鏡的畫面截圖 |
| 音樂 | `bash scripts/demo-video/music.sh` | 用 ffmpeg 合成 64 秒和弦襯底 |
| 合成 | `bash scripts/demo-video/build.sh` | Ken Burns 運鏡 + 字幕 + 交叉溶接 + 混音 |

只想重做其中一段:

```bash
python3 scripts/demo-video/capture.py --cards              # 只重產字幕/卡片
python3 scripts/demo-video/capture.py --app --only=supplier # 只重截供應商那幾頁
```

## 改字幕

全部集中在 `cards.html` 最下面的 `CAPTIONS` 陣列。改完跑 `--cards` 再 `build.sh`。
分鏡順序與每段秒數在 `build.sh` 的 `SEGMENTS`。

## 換成真正的音樂

`music.sh` 產的是合成襯底,不是製作過的配樂。有授權的音樂就直接指過去:

```bash
MUSIC=~/Music/your-track.wav bash scripts/demo-video/build.sh
```

## 踩過的雷(改之前先看)

**Vercel 擋機器人。** 正式站開著攻擊挑戰模式,headless 一律拿到「無法驗證您的瀏覽器
(代碼 21)」。所以 `capture.py` 預設跑 headed,而且要關掉 `AutomationControlled`
這個 blink feature,不然挑戰頁看 `navigator.webdriver` 還是判定是機器人。

**ffmpeg 沒有 drawtext。** 這台的 build 不含這個濾鏡,字幕不能用 ffmpeg 畫,
所以走 `cards.html` 用瀏覽器排版 → 透明 PNG → `overlay` 疊上去。
反而比較好看,中文字距行距都是 CSS 控制的。

**zoompan 的 d 是「每張輸入畫格產生幾張輸出」。** 搭 `-loop 1` 會變成
輸入幾百張 × 每張又生幾百張 = 幾萬張,單一段落算四分鐘、檔案 220MB。
要用 `d=1`,靠 `zoom` 變數跨畫格累加來推近。

**AI 菜單分析要按「開始分析」。** `set_input_files` 只是選檔案,不會自己送出。

## 素材怎麼來的

`menu-source.html` 渲染出一張好味小館的菜單當「上傳的菜單照片」——
不用外部素材,而且每次跑都一樣。影片裡那段辨識結果是**真的呼叫 AI 跑出來的**,
不是先錄好的畫面。
