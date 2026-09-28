// 右下角「AI 小助手」浮動泡泡。掛在後台的共用版面,每一頁都看得到:
//   · 餐廳後台 RestaurantLayout:<AIAssistantBubble />(= variant="restaurant")
//   · 管理員後台 AdminLayout:<AIAssistantBubble variant="admin" />
//   · 供應商後台與公開頁不掛(公開的舊首頁 Index.tsx 有自己內嵌的 Chatbot)。
//
// 兩種模式:
//   · restaurant:小標「找食材嗎？」(業主指定)。對話送出需求後收起面板,導去 /restaurant/analyze,
//     需求放在 router state(ChatRequirementsLocationState),由分析頁接手;已經在分析頁也照樣導
//     (同一路由、新的 location.key)。傳了 onRequirementsSubmit 就改交給它,不導頁。
//   · admin:管理員後台是另一個網站(VITE_PORTAL=admin),沒有 /restaurant/* 路由 —— 所以不交接、
//     不導頁:不把 onRequirementsSubmit 傳給 Chatbot,它就只會回話,不會擷取需求(也不會在後台建待審分析)。
//
// 外觀照形象站的 AI 泡泡做,同一個品牌(ifoodmap-landing/ifoodmap_deploy/index.html 的
// .ai-fab / .ai-fab-tip / .ai-panel):
//   · 泡泡是 logo 的地圖大頭針:正方形只圓三個角再轉 45°,尖角朝下;漸層取自 icon.png
//     (上黃綠 #c3d543 → 尖端深綠 #3b8a3b),中間一顆會呼吸的白點(呼應 logo 中間的白圈)。
//   · 泡泡上方的小標籤讓人一眼看出這顆泡泡是做什麼的(業主要求)。面板打開、或捲過第一個畫面
//     之後就收起來 —— 固定定位的標籤不收,在手機上會一路壓在內文右下角。
//   · 面板:深綠標題列 +「食」字標,裡面放既有的 <Chatbot variant="panel">,對話邏輯不重寫。
//
// 行為:
//   · 桌機(≥640px,跟 Tailwind sm: 同一條線):右下角浮動面板,非強制回應,頁面照常可以操作。
//   · 手機(<640px):從底部升起的全寬面板 —— aria-modal、背景遮罩、焦點鎖在面板裡、鎖住背景捲動。
//   · 打開時焦點移進輸入框;Esc / × / 點遮罩關閉,焦點還給泡泡。換頁時自動收起。
//   · 面板收起時 Chatbot 不卸載:對話紀錄留著(換頁也留著),進行中的 AI 請求也不會被丟掉。
//
// 疊放:整組包在 z-30 的疊放環境裡 —— 高於頁面內容,低於手機側欄(z-40 / z-50)、shadcn Dialog /
// Sheet(z-50)與 toast(z-[100] / sonner)。用 portal 掛到 body,不受掛載位置的 transform / overflow 影響。
// toast 讓位:sonner 與 shadcn toast 也在右下角。右下角有 toast 時,整組泡泡(小標、泡泡、面板)往上
// 挪到 toast 上方,toast 消失再回來 —— 不動全站的 Toaster 設定(App.tsx 不在這次範圍)。

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import Chatbot from "@/components/Chatbot";
import type { AnalysisMeta } from "@/components/MenuUpload";
import { cn } from "@/lib/utils";

/**
 * 餐廳版對話送出需求後,導去 /restaurant/analyze 時帶的 router state。
 * 會存進 history.state,所以只放可序列化的東西(字串陣列、字串 / null),不放函式或 File。
 */
export interface ChatRequirementsLocationState {
  /** 整理好的採購需求,例如 ["牛肉 5kg", "洋蔥 3kg", "青蔥"](= onRequirementsSubmit 的第一個參數) */
  chatRequirements: string[];
  /** = AnalysisMeta:analysisId 是這次對話在後台建立的待審分析 id(沒建成是 null),names 是食材原名 */
  chatMeta: { analysisId: string | null; names: string[] };
}

type AIAssistantBubbleProps =
  | {
      /** 餐廳後台(預設) */
      variant?: "restaurant";
      /** 選用的覆寫:有傳就把需求交給它,不導頁 */
      onRequirementsSubmit?: (requirements: string[], meta: AnalysisMeta) => void;
    }
  | {
      /** 管理員後台:純對話,不交接 */
      variant: "admin";
      onRequirementsSubmit?: never;
    };

const COPY = {
  restaurant: {
    tip: "找食材嗎？",
    fabName: "找食材嗎？AI 採購助手",
    dialogLabel: "AI 採購助手",
    title: "iFoodmap AI 採購助手",
    subtitle: "描述食材需求，AI 幫你整理採購清單",
    // 不傳:沿用 Chatbot 原本的開場白(字典 chat.welcome)
    greeting: undefined,
  },
  admin: {
    tip: "AI 助手",
    fabName: "AI 助手",
    dialogLabel: "AI 助手",
    title: "iFoodmap AI 助手",
    subtitle: "純對話模式，不會建立分析紀錄",
    // 管理員版不交接,不能說「幫您找到合適的供應商」。後端 chat 的 prompt 是採購需求訪談
    // (問品項 → 數量頻率 → 配送區域),也被要求不准報價,所以只照實說它會做的事。
    greeting: "我是 AI 助手，會像跟餐廳對話時一樣，陪你把食材的品項、數量和配送需求一步步問清楚。",
  },
} as const;

const DESKTOP_QUERY = "(min-width: 640px)";

const subscribeDesktop = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

// 沒有 matchMedia 的環境(jsdom)當桌機:非強制回應是比較不會卡住人的那一邊
const getIsDesktop = () =>
  typeof window.matchMedia !== "function" || window.matchMedia(DESKTOP_QUERY).matches;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 泡泡白點的呼吸動畫(形象站的 pulseDot)。keyframes 不在共用的 tailwind 設定裡,跟著元件走。
const DOT_KEYFRAMES =
  "@keyframes ifm-ai-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.75)}}";

/** 捲過第一個畫面的 60% 之後收起小標籤(跟形象站同一個門檻) */
const isPastFold = () => window.scrollY > window.innerHeight * 0.6;

// sonner 的 toast,與 shadcn(Radix)toast —— 只有 Radix Toast 的 li 帶 data-swipe-direction
const TOAST_ITEM = "li[data-sonner-toast], li[data-swipe-direction]";
const VISIBLE_TOAST =
  'li[data-sonner-toast]:not([data-removed="true"]), li[data-swipe-direction][data-state="open"]';

/**
 * 右下角有 toast 時,泡泡要往上讓多少(px)。
 * 只算跟泡泡同一欄、在畫面下半部的 toast(手機上 shadcn toast 在頂端,不用讓)。
 */
function useToastLift(fabRef: RefObject<HTMLElement>): number {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((cb: () => void) => window.setTimeout(cb, 16));
    const cancel = window.cancelAnimationFrame?.bind(window) ?? window.clearTimeout.bind(window);
    let frame = 0;

    const measure = () => {
      frame = 0;
      const toasts = document.querySelectorAll<HTMLElement>(VISIBLE_TOAST);
      const fab = fabRef.current;
      let top = Infinity;
      // 沒有 toast 就不量版面,很便宜
      if (toasts.length > 0 && fab) {
        const column = fab.getBoundingClientRect();
        toasts.forEach((toast) => {
          const r = toast.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.right <= column.left || r.left >= column.right) return;
          if (r.top < window.innerHeight / 2) return;
          top = Math.min(top, r.top);
        });
      }
      const next = top === Infinity ? 0 : Math.max(0, Math.round(window.innerHeight - top));
      setLift((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = raf(measure);
    };
    // toast 進場、疊起來、滑鼠移上去展開都是 CSS 動畫(sonner 用 transition,shadcn toast 用 keyframes),
    // 跑完才是最後的位置,再量一次
    const onMotionEnd = (e: Event) => {
      if (e.target instanceof Element && e.target.matches(TOAST_ITEM)) schedule();
    };

    // toast 是別的元件插進 body 的,只能用 MutationObserver 看
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-removed", "data-state", "data-expanded", "data-mounted"],
    });
    document.addEventListener("transitionend", onMotionEnd, true);
    document.addEventListener("animationend", onMotionEnd, true);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      document.removeEventListener("transitionend", onMotionEnd, true);
      document.removeEventListener("animationend", onMotionEnd, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancel(frame);
    };
  }, [fabRef]);

  return lift;
}

export default function AIAssistantBubble(props: AIAssistantBubbleProps): JSX.Element {
  const mode = props.variant ?? "restaurant";
  const copy = COPY[mode];

  const [open, setOpen] = useState(false);
  const [pastFold, setPastFold] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const isDesktop = useSyncExternalStore(subscribeDesktop, getIsDesktop, () => true);
  const isModal = open && !isDesktop;

  const navigate = useNavigate();
  const { key: locationKey } = useLocation();

  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const toastLift = useToastLift(fabRef);

  // AI 回來才會呼叫到送出需求,那時候要用最新的覆寫回呼
  const overrideRef = useRef(props.variant === "admin" ? undefined : props.onRequirementsSubmit);
  useEffect(() => {
    overrideRef.current = props.variant === "admin" ? undefined : props.onRequirementsSubmit;
  });

  const openPanel = useCallback(() => {
    setAnnouncement("");
    setOpen(true);
  }, []);

  const hidePanel = useCallback((returnFocus: boolean) => {
    // 焦點要在藏起面板「之前」還給泡泡 —— 反過來的話焦點會短暫留在 aria-hidden 的面板裡
    if (returnFocus) fabRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }, []);

  /** 焦點還在面板裡嗎?(自動收起時只有這種情況才把焦點還給泡泡,不去搶使用者放在頁面上的焦點) */
  const focusIsInPanel = () => {
    const panel = panelRef.current;
    return !!panel && panel.contains(document.activeElement);
  };

  // 使用者自己關的(Esc / × / 遮罩 / 泡泡):焦點一律回泡泡
  const closePanel = useCallback(() => hidePanel(true), [hidePanel]);

  // 餐廳版:需求交給覆寫回呼,沒有覆寫就導去分析頁
  const handleRequirementsSubmit = useCallback(
    (requirements: string[], meta: AnalysisMeta) => {
      hidePanel(focusIsInPanel());
      const override = overrideRef.current;
      if (override) {
        setAnnouncement(`AI 已整理出 ${requirements.length} 項採購需求，結果顯示在頁面上。`);
        override(requirements, meta);
        return;
      }
      setAnnouncement(`AI 已整理出 ${requirements.length} 項採購需求，已帶到 AI 菜單分析頁。`);
      // 只挑分析頁用得到的欄位,確定能放進 history.state
      const state: ChatRequirementsLocationState = {
        chatRequirements: requirements.map(String),
        chatMeta: { analysisId: meta.analysisId ?? null, names: (meta.names ?? []).map(String) },
      };
      navigate("/restaurant/analyze", { state });
    },
    [hidePanel, navigate],
  );

  // 換頁就收起,不要在新頁面上還開著蓋住內容。useLayoutEffect:在畫面畫出來之前就收,不會閃一下
  const lastLocationKey = useRef(locationKey);
  useLayoutEffect(() => {
    if (lastLocationKey.current === locationKey) return;
    lastLocationKey.current = locationKey;
    hidePanel(focusIsInPanel());
  }, [locationKey, hidePanel]);

  // inert 讓收起的面板完全碰不到;打開時把焦點移進輸入框
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!open) {
      panel.setAttribute("inert", "");
      return;
    }
    panel.removeAttribute("inert");
    const target = panel.querySelector<HTMLElement>("input, textarea") ?? panel;
    target.focus({ preventScroll: true });
  }, [open]);

  // 手機全螢幕時鎖住背後的頁面,不然在面板上滑會捲到底下的內容
  useEffect(() => {
    if (!isModal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isModal]);

  useEffect(() => {
    const sync = () => setPastFold(isPastFold());
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;

    if (e.key === "Escape") {
      // 注音 / 拼音選字中按 Esc 是取消選字,不是關面板
      if (e.nativeEvent.isComposing || e.defaultPrevented) return;
      e.preventDefault();
      closePanel();
      return;
    }

    // 手機全螢幕(aria-modal)時焦點不能跑出面板
    if (e.key === "Tab" && isModal) {
      const panel = panelRef.current;
      if (!panel) return;
      const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const tipHidden = open || pastFold;

  return createPortal(
    <div
      className="relative z-30 print:hidden"
      data-ai-assistant={mode}
      // 右下角有 toast 時整組往上讓位的距離,下面的 bottom / 高度都加上它
      style={{ "--ai-lift": `${toastLift}px` } as CSSProperties}
      onKeyDown={handleKeyDown}
    >
      <style>{DOT_KEYFRAMES}</style>

      {/* 手機的背景遮罩。桌機不遮:面板是非強制回應,頁面上的內容照樣可以看、可以點 */}
      <div
        aria-hidden="true"
        data-testid="ai-assistant-backdrop"
        onClick={closePanel}
        className={cn(
          "fixed inset-0 bg-[rgba(8,18,12,.4)] transition-opacity duration-200 motion-reduce:transition-none sm:hidden",
          isModal ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* 小標籤跟泡泡是同一個動作:aria-hidden + 不進 Tab 序列,鍵盤與螢幕閱讀器走泡泡那一顆 */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="ai-assistant-tip"
        data-hidden={tipHidden ? "" : undefined}
        onClick={openPanel}
        className={cn(
          "fixed bottom-[calc(100px+env(safe-area-inset-bottom)+var(--ai-lift,0px))] right-[calc(28px+env(safe-area-inset-right))]",
          "inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-[#DCE7DE] bg-white px-3.5 text-[13px] font-bold leading-tight text-[#0B6B40] shadow-[0_8px_20px_rgba(18,138,84,.18)] sm:px-4 sm:text-sm",
          // 指向泡泡的小尖角
          "after:absolute after:-bottom-[5px] after:right-5 after:h-2 after:w-2 after:rotate-45 after:border-b after:border-r after:border-[#DCE7DE] after:bg-white after:content-['']",
          "transition-[opacity,transform,bottom] duration-200 motion-reduce:transition-none",
          tipHidden
            ? "pointer-events-none translate-y-2 opacity-0"
            : "hover:-translate-y-px hover:border-[#0B6B40] motion-reduce:hover:translate-y-0",
        )}
      >
        {copy.tip}
      </button>

      <div className="fixed bottom-[calc(30px+env(safe-area-inset-bottom)+var(--ai-lift,0px))] right-[calc(28px+env(safe-area-inset-right))] h-[58px] w-[58px] transition-[bottom] duration-200 motion-reduce:transition-none">
        <button
          ref={fabRef}
          type="button"
          onClick={open ? closePanel : openPanel}
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="dialog"
          className={cn(
            "flex h-full w-full rotate-45 items-center justify-center rounded-[50%_50%_0_50%] border-[2.5px] border-white/[.85]",
            "bg-gradient-to-br from-[#c3d543] via-[#8db83c] via-[48%] to-[#3b8a3b]",
            "shadow-[0_12px_26px_rgba(18,138,84,.34)] transition-[transform,box-shadow] duration-200 ease-out motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0B6B40] focus-visible:ring-offset-2",
            open
              ? "scale-90 motion-reduce:scale-100"
              : "hover:scale-[1.06] hover:shadow-[0_16px_32px_rgba(18,138,84,.42)] motion-reduce:hover:scale-100",
          )}
        >
          <span className="sr-only">{copy.fabName}</span>
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full bg-white animate-[ifm-ai-dot_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
          />
        </button>
      </div>

      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-label={copy.dialogLabel}
        aria-modal={isModal ? true : undefined}
        aria-hidden={open ? undefined : true}
        tabIndex={-1}
        data-state={open ? "open" : "closed"}
        className={cn(
          // 手機:從底部升起的全寬面板,留出 iPhone 底部橫條的安全區
          "fixed inset-x-0 bottom-[var(--ai-lift,0px)] flex h-[min(86vh,calc(100vh-var(--ai-lift,0px)-1rem))] flex-col overflow-hidden rounded-t-[20px] border border-[#e8efe6] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_30px_70px_rgba(20,60,30,.28)] outline-none supports-[height:1dvh]:h-[min(86dvh,calc(100dvh-var(--ai-lift,0px)-1rem))]",
          // 桌機:右下角浮動面板,約 380×564;視窗矮或窄時縮小,不超出畫面
          "sm:inset-x-auto sm:bottom-[calc(92px+var(--ai-lift,0px))] sm:right-5 sm:h-[min(564px,calc(100vh-7.5rem-var(--ai-lift,0px)))] sm:w-[380px] sm:max-w-[calc(100vw-2rem)] sm:rounded-[22px] sm:pb-0",
          // 開:visibility 立刻切換,焦點才移得進去;關:等淡出跑完才藏(delay 對應 visibility)。
          // 時間與延遲用「任意屬性」寫法:Tailwind 的 duration / delay / ease 任意值會跟 tailwindcss-animate
          // 的同名工具撞名,被判定成模稜兩可就整條不產生(註解裡也別寫出那種 class,掃描器一樣會警告)。
          "transition-[opacity,transform,visibility,bottom] [transition-duration:260ms,260ms,0s,200ms] [transition-timing-function:cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
          open
            ? "visible translate-y-0 scale-100 opacity-100"
            : "pointer-events-none invisible translate-y-full opacity-0 [transition-delay:0s,0s,260ms,0s] sm:translate-y-4 sm:scale-95",
        )}
      >
        <div className="flex shrink-0 items-center gap-3 bg-gradient-to-br from-[#0f2417] to-[#0a1510] px-4 py-3 text-white">
          {/* 「食」是品牌字標 */}
          <div
            aria-hidden="true"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#46c138] to-[#1f9e4e] text-[17px] font-black"
          >
            食
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-extrabold leading-tight">{copy.title}</h2>
            <p className="mt-0.5 truncate text-[11.5px] leading-snug text-[#9fb6a3]">{copy.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={closePanel}
            aria-label="關閉"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[.12] text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <Chatbot
            variant="panel"
            greeting={copy.greeting}
            // admin 不傳:Chatbot 只有拿到 onRequirementsSubmit 才會擷取需求並交接,不傳就是純對話
            onRequirementsSubmit={mode === "admin" ? undefined : handleRequirementsSubmit}
          />
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>,
    document.body,
  );
}
