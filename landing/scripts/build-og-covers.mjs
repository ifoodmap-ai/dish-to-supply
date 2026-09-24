#!/usr/bin/env node
// 從每篇文章的封面產一張 1200×630 的分享圖(og:image),寫到 assets/news/og/。
//
// 為什麼不直接拿封面當 og:image:17 張封面比例從 1.00 到 2.00 不等(OG 建議 1.91),
// 其中 4 張小於 Facebook 大卡門檻 600×315 —— 直接用的話分享出去會從大圖卡片降級成
// 左邊一個小縮圖,比原本那張全站橫幅還差;3 張正方形會被 FB 上下各裁掉約一半。
//
// 做法:整張封面「完整」放在中間(不裁切任何內容),背後墊同一張圖放大、模糊、刷淡當底。
// 小圖最多放大 1.5 倍,再大就會糊。成品一律 1200×630,prerender 會逐張驗尺寸。
//
// 需要 ImageMagick 7(`magick`)。產出的圖會 commit 進 repo,CI 不跑這支 ——
// 新增文章或換封面後在本機跑一次再 commit 即可。
//
// 用法:node scripts/build-og-covers.mjs [--force]   (預設只產缺少的)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ogPathForCover } from './seo-head.mjs';   // 路徑規則只有一份,prerender 也用它

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets/news/og');
const W = 1200, H = 630, MAX_UPSCALE = 1.5;
const force = process.argv.includes('--force');


function main() {
  try { execFileSync('magick', ['-version'], { stdio: 'ignore' }); }
  catch { console.error('找不到 ImageMagick 7(magick 指令)。macOS:brew install imagemagick'); process.exit(1); }
  const news = createRequire(import.meta.url)(path.join(ROOT, 'news.js'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ifm-og-'));
  const seen = new Set();
  let made = 0, skipped = 0;
  try {
    for (const a of news.all('zh')) {
      if (!a.cover || seen.has(a.cover)) continue;      // 中英共用同一張封面
      seen.add(a.cover);
      const src = path.join(ROOT, a.cover);
      const out = path.join(ROOT, ogPathForCover(a.cover));
      if (!fs.existsSync(src)) throw new Error(`${a.slug}:封面不存在 ${a.cover}`);
      if (!force && fs.existsSync(out)) { skipped++; continue; }
      const w = a.coverW, h = a.coverH;
      if (!w || !h) throw new Error(`${a.slug}:news.js 沒有封面尺寸(coverW/coverH)`);
      const s = Math.min(W / w, H / h, MAX_UPSCALE);
      const fw = Math.round(w * s), fh = Math.round(h * s);
      const bg = path.join(tmp, 'bg.png'), fg = path.join(tmp, 'fg.png');
      execFileSync('magick', [src, '-resize', `${W}x${H}^`, '-gravity', 'center', '-extent', `${W}x${H}`,
        '-blur', '0x32', '-fill', 'white', '-colorize', '18%', bg]);
      execFileSync('magick', [src, '-resize', `${fw}x${fh}!`, fg]);
      execFileSync('magick', [bg, '(', fg, '(', '+clone', '-background', '#0E1A14', '-shadow', '38x14+0+8', ')',
        '+swap', '-background', 'none', '-layers', 'merge', '+repage', ')',
        '-gravity', 'center', '-composite', '-strip', '-interlace', 'JPEG', '-quality', '84', out]);
      const dim = execFileSync('magick', ['identify', '-format', '%wx%h', out]).toString().trim();
      if (dim !== `${W}x${H}`) throw new Error(`${out} 產出 ${dim},不是 ${W}x${H}`);
      made++;
      console.log(`  ${path.basename(out).padEnd(20)} ← ${w}×${h}  前景 ${fw}×${fh}(×${s.toFixed(2)})  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(`產出 ${made} 張、略過(已存在)${skipped} 張 → ${path.relative(ROOT, OUT_DIR)}/`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
