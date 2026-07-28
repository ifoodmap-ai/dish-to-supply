#!/usr/bin/env python3
"""
展場 demo 短片的畫面擷取。

用 Playwright 開系統 Chrome(channel="chrome",不下載任何瀏覽器),
登入三個身分把要入鏡的畫面逐張截圖到 demo-video-out/frames/。

刻意不用 Playwright 的錄影功能 —— 那需要另外下載它自帶的 ffmpeg,
而且錄下來的節奏是「當下網路多慢」決定的。截圖序列 + ffmpeg 運鏡
節奏完全可控,任何一張畫面不滿意重截那一張就好。

用法:
    python3 scripts/demo-video/capture.py            # 全部
    python3 scripts/demo-video/capture.py --cards    # 只重產字幕/卡片
    python3 scripts/demo-video/capture.py --app      # 只重截 app 畫面
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "demo-video-out" / "frames"
CARDS_HTML = Path(__file__).resolve().parent / "cards.html"

MAIN = os.environ.get("DEMO_MAIN_URL", "https://dish-to-supply.vercel.app")
ADMIN = os.environ.get("DEMO_ADMIN_URL", "https://ifoodmap-admin.vercel.app")

ACCOUNTS = {
    "restaurant": (os.environ.get("DEMO_REST_EMAIL", "restaurant@ifoodmap.ai"),
                   os.environ.get("DEMO_REST_PW", "000000")),
    "supplier":   (os.environ.get("DEMO_SUPP_EMAIL", "supplier@ifoodmap.ai"),
                   os.environ.get("DEMO_SUPP_PW", "000000")),
    "admin":      (os.environ.get("DEMO_ADMIN_EMAIL", "admin@ifoodmap.ai"),
                   os.environ.get("DEMO_ADMIN_PW", "000000")),
}

W, H = 1920, 1080


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def shot(page: Page, name: str, *, settle: float = 1.2) -> None:
    """截一張圖。settle 是等版面/動畫定下來的時間。"""
    time.sleep(settle)
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path))
    log(f"✓ {name}.png")


def dismiss_toasts(page: Page) -> None:
    """把 sonner 的提示訊息移掉 —— 入鏡很醜,而且會擋住右下角。"""
    page.evaluate("""() => {
      document.querySelectorAll('[data-sonner-toast]').forEach(n => n.remove());
    }""")


def wait_past_challenge(page: Page, timeout: float = 45.0) -> None:
    """
    等 Vercel 的 bot 驗證頁過去。

    正式站開著 Vercel 的攻擊挑戰模式,headless 一律過不了(所以本腳本預設跑
    headed)。就算 headed,第一次進站也會先閃一下「Vercel Security Checkpoint」,
    固定 sleep 會截到那張白畫面,所以改成等到它消失為止。
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        blocked = page.evaluate("""() => {
          const t = document.body ? document.body.innerText : '';
          return t.includes('Security Checkpoint')
              || t.includes('安全檢查點') || t.includes('安全检查点')
              || t.includes('无法验证您的浏览器') || t.includes('無法驗證您的瀏覽器');
        }""")
        if not blocked:
            return
        time.sleep(1.5)
    raise RuntimeError("Vercel 驗證頁一直沒過 —— 檢查是不是被擋了,或改用非 headless")


# ---------------------------------------------------------------- 卡片與字幕

def capture_cards(page: Page) -> None:
    log("字幕與卡片…")
    page.goto(CARDS_HTML.as_uri())
    page.wait_for_timeout(600)  # 等字型載入,不然會截到 fallback 字型

    ids = page.evaluate("() => window.CARD_IDS")
    for cid in ids:
        page.evaluate("(id) => window.showOnly(id)", cid)
        page.wait_for_timeout(120)
        # 字幕條要透明底才能疊圖;滿版卡片自己有不透明背景,一起用 omit 也沒差
        page.screenshot(path=str(OUT / f"card-{cid}.png"), omit_background=True)
        log(f"✓ card-{cid}.png")


# ---------------------------------------------------------------- 登入

def logout(page: Page) -> None:
    page.evaluate("""() => {
      Object.keys(localStorage)
        .filter(k => k.includes('auth-token'))
        .forEach(k => localStorage.removeItem(k));
    }""")


def login(page: Page, base: str, role: str) -> None:
    """登入。role=admin 的站沒有角色卡,直接填表。"""
    email, pw = ACCOUNTS[role]
    page.goto(base, wait_until="domcontentloaded")
    wait_past_challenge(page)
    page.wait_for_timeout(1500)
    logout(page)
    page.goto(base, wait_until="domcontentloaded")
    wait_past_challenge(page)
    page.wait_for_timeout(1800)

    if role in ("restaurant", "supplier"):
        label = "我是餐廳" if role == "restaurant" else "我是供應商"
        page.evaluate("""(label) => {
          const all = Array.from(document.querySelectorAll('button,[role=button],div[class*=cursor]'));
          const c = all.find(b => b.innerText && b.innerText.includes(label));
          if (c) c.click();
        }""", label)
        page.wait_for_timeout(700)

    page.wait_for_selector("#email", timeout=15000)
    page.fill("#email", email)
    page.fill("#password", pw)
    page.click("button[type=submit]")
    page.wait_for_timeout(4000)
    dismiss_toasts(page)
    log(f"登入 {role} → {page.url}")


def goto(page: Page, url: str, wait: float = 2.6) -> None:
    page.goto(url, wait_until="domcontentloaded")
    wait_past_challenge(page)
    time.sleep(wait)
    dismiss_toasts(page)
    # 有些頁面(例如 AI 菜單分析裡的聊天元件)掛載時會把自己 scrollIntoView,
    # 連帶把整頁往下捲 —— 不重設就會截到標題被切掉的畫面。
    page.evaluate("() => window.scrollTo(0, 0)")
    time.sleep(0.5)


# ---------------------------------------------------------------- 各段畫面

def capture_login_screen(page: Page) -> None:
    log("登入頁…")
    page.goto(MAIN, wait_until="domcontentloaded")
    wait_past_challenge(page)
    page.wait_for_timeout(1200)
    logout(page)
    page.goto(MAIN, wait_until="domcontentloaded")
    wait_past_challenge(page)
    page.wait_for_timeout(2200)
    shot(page, "01-login")


def capture_restaurant(page: Page) -> None:
    login(page, MAIN, "restaurant")

    log("餐廳:AI 菜單分析…")
    goto(page, f"{MAIN}/restaurant/analyze")
    shot(page, "02-analyze")

    # 真的跑一次 AI —— 影片裡光有「上傳區」說服力不夠,要看到辨識結果。
    # 菜單圖是自己用 menu-source.html 渲染出來的,不靠外部素材。
    menu_png = OUT.parent / "menu.png"
    if not menu_png.exists():
        log("  產生菜單圖…")
        mp = page.context.new_page()
        mp.set_viewport_size({"width": 900, "height": 1200})
        mp.goto((Path(__file__).resolve().parent / "menu-source.html").as_uri())
        mp.wait_for_timeout(700)
        mp.screenshot(path=str(menu_png))
        mp.close()

    try:
        page.set_input_files("input[type=file]", str(menu_png))
        page.wait_for_timeout(1200)
        # 選檔案只是選檔案 —— 還要按「開始分析」才會真的送出
        page.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('button'))
            .find(x => x.innerText.trim().startsWith('開始分析'));
          if (b) b.click();
        }""")
        log("  已送出,等 AI 回結果(最多 90 秒)…")
        # 結果區的標題是「已識別食材」(analysis.title)。實測約 19 秒。
        page.wait_for_function(
            """() => {
                 const t = document.body.innerText;
                 return t.includes('已識別食材') || t.includes('尋找供應商');
               }""",
            timeout=90000,
        )
        page.evaluate("() => window.scrollTo(0, 0)")
        dismiss_toasts(page)
        shot(page, "02b-analyze-result", settle=2.0)
    except PWTimeout:
        log("⚠ AI 沒有在 60 秒內回覆 —— 這段用上傳畫面頂著")

    log("餐廳:我的菜單…")
    goto(page, f"{MAIN}/restaurant/menu")
    shot(page, "03-menu")

    log("餐廳:訂單與收貨…")
    goto(page, f"{MAIN}/restaurant/orders", wait=3.2)
    # 捲到那張「待收貨」的單,它才是主秀
    page.evaluate("""() => {
      const cards = Array.from(document.querySelectorAll('*'));
      const t = cards.find(n => n.children.length === 0 && n.textContent.trim() === '待收貨'
                                && n.closest('[class*=rounded]'));
      if (t) t.closest('[class*=rounded]').scrollIntoView({block: 'center'});
    }""")
    shot(page, "04-orders")

    log("餐廳:收貨對帳視窗…")
    opened = page.evaluate("""() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find(x => x.innerText.trim() === '已收到貨');
      if (!b) return false;
      b.click();
      return true;
    }""")
    if opened:
        shot(page, "05-receive", settle=2.0)
    else:
        log("⚠ 找不到「已收到貨」按鈕 —— 這段跳過(訂單可能已被點掉)")


def capture_supplier(page: Page) -> None:
    login(page, MAIN, "supplier")

    log("供應商:商機雷達…")
    goto(page, f"{MAIN}/supplier/leads", wait=3.0)
    shot(page, "06-leads")

    log("供應商:營運總覽…")
    goto(page, f"{MAIN}/supplier", wait=3.0)
    shot(page, "07-supplier-dash")


def capture_admin(page: Page) -> None:
    login(page, ADMIN, "admin")

    log("平台:交易全流程看板…")
    goto(page, f"{ADMIN}/admin/pipeline", wait=3.4)
    shot(page, "08-pipeline")

    log("平台:訂單履歷…")
    # 點看板上任一張卡就會進履歷頁
    page.evaluate("""() => {
      const b = Array.from(document.querySelectorAll('button'))
        .find(x => /^#[0-9a-f]{8}/i.test(x.innerText.trim()));
      if (b) b.click();
    }""")
    time.sleep(3.2)
    dismiss_toasts(page)
    shot(page, "09-timeline")


# ---------------------------------------------------------------- main

def main() -> int:
    args = set(sys.argv[1:])
    do_cards = "--app" not in args
    do_app = "--cards" not in args

    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        # 預設 headed —— 正式站的 Vercel 攻擊挑戰模式擋 headless(代碼 21)。
        # 會跳出一個 Chrome 視窗,截完自己關掉。
        #
        # 光是 headed 還不夠:挑戰頁會看 navigator.webdriver,被 Playwright 開起來
        # 的瀏覽器一律是 true。關掉 AutomationControlled 這個 blink feature 才不會
        # 被判成機器人。(擋不掉的話就改跑本機 preview server,見 README)
        headless = os.environ.get("DEMO_HEADLESS") == "1"
        browser = pw.chromium.launch(
            channel="chrome",
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
            ],
            ignore_default_args=["--enable-automation"],
        )
        ctx = browser.new_context(
            viewport={"width": W, "height": H},
            device_scale_factor=1,
            locale="zh-TW",
            timezone_id="Asia/Taipei",
            reduced_motion="no-preference",
        )
        page = ctx.new_page()
        page.set_default_timeout(30000)

        try:
            if do_cards:
                capture_cards(page)

            if do_app:
                # --only=restaurant 之類可以只重跑其中一段,不用整輪重截
                only = next((a.split("=", 1)[1] for a in args if a.startswith("--only=")), None)
                sections = {
                    "login": capture_login_screen,
                    "restaurant": capture_restaurant,
                    "supplier": capture_supplier,
                    "admin": capture_admin,
                }
                if only:
                    if only not in sections:
                        print(f"✗ --only 只能是 {'/'.join(sections)}", file=sys.stderr)
                        return 2
                    sections[only](page)
                else:
                    for fn in sections.values():
                        fn(page)
        except PWTimeout as e:
            print(f"\n✗ 逾時:{e}", file=sys.stderr)
            return 1
        finally:
            ctx.close()
            browser.close()

    pngs = sorted(OUT.glob("*.png"))
    print(f"\n共 {len(pngs)} 張 → {OUT}")
    for p in pngs:
        kb = p.stat().st_size / 1024
        flag = "  ⚠ 疑似空白" if kb < 12 else ""
        print(f"  {p.name:24s} {kb:8.0f} KB{flag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
