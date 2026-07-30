#!/usr/bin/env python3
"""
量三個後台每一頁在手機寬度下有沒有橫向溢出。

判斷 RWD 不看 Tailwind class 猜,直接量 documentElement.scrollWidth ——
超過視窗寬度就是會出現橫向捲軸,使用者得左右拖才看得完,那就是壞的。
順便把「誰造成溢出」的元素抓出來,不然只知道壞了不知道改哪裡。

    python3 scripts/rwd-audit.py                  # 390 / 768 兩種寬度
    python3 scripts/rwd-audit.py --width 390      # 只測手機
    python3 scripts/rwd-audit.py --portal supplier

(登入流程跟 scripts/demo-video/capture.py 是同一套 —— 那支是產影片用的,
 這支是驗收用的,刻意各自獨立,免得改壞一邊連累另一邊。)
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, Page

ROOT = Path(__file__).resolve().parents[1]
MAIN = os.environ.get("DEMO_MAIN_URL", "https://dish-to-supply.vercel.app")
ADMIN = os.environ.get("DEMO_ADMIN_URL", "https://ifoodmap-admin.vercel.app")

ACCOUNTS = {
    "restaurant": ("restaurant@ifoodmap.ai", "000000"),
    "supplier": ("supplier@ifoodmap.ai", "000000"),
    "admin": ("admin@ifoodmap.ai", "000000"),
}

ROUTES = {
    "restaurant": ["", "/analyze", "/menu", "/purchase", "/orders", "/costs",
                   "/suppliers", "/lab", "/team", "/settings"],
    "supplier": ["", "/leads", "/orders", "/quotes", "/catalog", "/pricing",
                 "/forecast", "/customers", "/logistics", "/shipments", "/reviews"],
    "admin": ["", "/pipeline", "/analyses", "/orders", "/matching", "/forecast",
              "/restaurants", "/suppliers", "/applications", "/accounts",
              "/ingredients", "/dishes", "/substitutes", "/prices",
              "/match-quality", "/ai-ops", "/disputes", "/revenue", "/billing",
              "/growth", "/campaigns", "/notifications", "/roadmap"],
}

# 量到的 scrollWidth 比視窗大幾 px 以內算沒事(捲軸、次像素誤差)
TOLERANCE = 2

PROBE = """
() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const over = de.scrollWidth - vw;

  // 只量溢出會漏掉一整類壞法:固定寬的側邊欄不會讓頁面溢出,
  // 它是把主內容「壓扁」—— flex 子元素會縮,所以 scrollWidth 完全正常,
  // 但內容只剩一條 150px 的縫。所以同時量主內容佔了視窗多少。
  const mainEl = document.querySelector('main');
  const mainW = mainEl ? Math.round(mainEl.getBoundingClientRect().width) : null;
  const mainRatio = mainW == null ? null : +(mainW / vw).toFixed(3);

  // 找出真正超出右邊界的元素,只留最外層的(不然一個寬 table 會回報幾十個子節點)
  const culprits = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 2) continue;
    if (culprits.some(c => c.el.contains(el))) continue;
    culprits.push({
      el,
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 110),
      right: Math.round(r.right),
      w: Math.round(r.width),
    });
    if (culprits.length >= 6) break;
  }
  return { vw, over, mainW, mainRatio, culprits: culprits.map(({el, ...rest}) => rest) };
}
"""

# 主內容至少要佔視窗這個比例。手機上留 8% 給 padding 已經很寬鬆了,
# 低於這個數字就是被某個固定寬度的東西擠掉。
MIN_MAIN_RATIO = 0.80


def wait_past_challenge(page: Page, timeout: float = 45.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not page.evaluate("""() => {
              const t = document.body ? document.body.innerText : '';
              return t.includes('Security Checkpoint') || t.includes('无法验证您的浏览器')
                  || t.includes('無法驗證您的瀏覽器');
            }"""):
            return
        time.sleep(1.5)
    raise RuntimeError("Vercel 驗證頁沒過")


def login(page: Page, portal: str) -> None:
    base = ADMIN if portal == "admin" else MAIN
    email, pw = ACCOUNTS[portal]
    page.goto(base, wait_until="domcontentloaded")
    wait_past_challenge(page)
    page.wait_for_timeout(1200)
    page.evaluate("""() => Object.keys(localStorage)
        .filter(k => k.includes('auth-token')).forEach(k => localStorage.removeItem(k))""")
    page.goto(base, wait_until="domcontentloaded")
    wait_past_challenge(page)
    page.wait_for_timeout(1800)

    if portal != "admin":
        label = "我是餐廳" if portal == "restaurant" else "我是供應商"
        page.evaluate("""(label) => {
          const all = Array.from(document.querySelectorAll('button,[role=button],div[class*=cursor]'));
          const c = all.find(b => b.innerText && b.innerText.includes(label));
          if (c) c.click();
        }""", label)
        page.wait_for_timeout(700)

    page.wait_for_selector("#email", timeout=20000)
    page.fill("#email", email)
    page.fill("#password", pw)
    page.click("button[type=submit]")
    page.wait_for_timeout(4200)


def audit(portal: str, widths: list[int]) -> list[dict]:
    base = ADMIN if portal == "admin" else MAIN
    prefix = "/admin" if portal == "admin" else f"/{portal}"
    rows = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome", headless=False,
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )
        for width in widths:
            ctx = browser.new_context(
                viewport={"width": width, "height": 844},
                device_scale_factor=1, locale="zh-TW",
                is_mobile=width < 500, has_touch=width < 500,
            )
            page = ctx.new_page()
            page.set_default_timeout(30000)
            login(page, portal)

            for route in ROUTES[portal]:
                url = f"{base}{prefix}{route}"
                try:
                    page.goto(url, wait_until="domcontentloaded")
                    wait_past_challenge(page)
                    time.sleep(2.4)
                    page.evaluate("() => window.scrollTo(0,0)")
                    time.sleep(0.3)
                    r = page.evaluate(PROBE)
                except Exception as e:  # noqa: BLE001
                    rows.append({"portal": portal, "width": width, "route": route or "/",
                                 "over": -1, "error": str(e)[:120], "culprits": []})
                    continue

                squeezed = (r["mainRatio"] is not None
                            and width < 900
                            and r["mainRatio"] < MIN_MAIN_RATIO)
                rows.append({
                    "portal": portal, "width": width, "route": route or "/",
                    "over": r["over"], "mainW": r["mainW"], "mainRatio": r["mainRatio"],
                    "squeezed": squeezed, "culprits": r["culprits"],
                })

                bits = []
                if r["over"] > TOLERANCE:
                    bits.append(f"溢出 {r['over']}px")
                if squeezed:
                    bits.append(f"內容被壓成 {r['mainW']}px / {r['vw']}px")
                mark = "✓" if not bits else "✗ " + "、".join(bits)
                print(f"  [{width}] {prefix}{route or '/':<16} {mark}", flush=True)

            ctx.close()
        browser.close()
    return rows


def main() -> int:
    args = sys.argv[1:]
    widths = [int(a.split("=", 1)[1] if "=" in a else args[args.index(a) + 1])
              for a in args if a.startswith("--width")] or [390, 768]
    only = next((a.split("=", 1)[1] for a in args if a.startswith("--portal=")), None)
    portals = [only] if only else ["restaurant", "supplier", "admin"]

    allrows = []
    for p in portals:
        print(f"\n=== {p} ===")
        allrows += audit(p, widths)

    out = ROOT / "demo-video-out" / "rwd-audit.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(allrows, ensure_ascii=False, indent=2))

    bad = [r for r in allrows
           if r["over"] > TOLERANCE or r.get("squeezed") or r["over"] < 0]
    print(f"\n{'─' * 60}")
    print(f"共 {len(allrows)} 次量測,{len(bad)} 頁有問題")
    for r in sorted(bad, key=lambda x: -x["over"]):
        why = []
        if r["over"] > TOLERANCE:
            why.append(f"溢出 +{r['over']}px")
        if r.get("squeezed"):
            why.append(f"內容 {r['mainW']}px")
        if r["over"] < 0:
            why.append(f"抓取失敗 {r.get('error', '')}")
        print(f"  {r['portal']}{r['route']:<18} @{r['width']}  {'、'.join(why)}")
        for c in r["culprits"][:2]:
            print(f"      <{c['tag']}> w={c['w']} {c['cls'][:80]}")
    print(f"\n明細 → {out}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
