// 未登入公開頁共用的頁首列:左邊 logo、右邊「← 回首頁」,兩個都回形象站首頁。
//
// 為什麼不用 react-router 的 <Link to="/">:產品站的 `/` 是登入頁,訪客心中的
// 「首頁」是形象站(另一個網域),所以一律是一般的 <a href>、同分頁開啟。
// 網址與語言對應都在 lib/site.ts。
//
// 管理員站(VITE_PORTAL=admin)是內部人員用的,不需要回形象站:
// logo 只是圖片、不是連結,也不顯示「回首頁」。

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { IS_ADMIN_BUILD } from "@/lib/portal";
import { landingHomeUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2";

interface PublicHeaderProps {
  /** 排在「回首頁」左邊的其他控制項,例如登入頁的語言切換 */
  actions?: ReactNode;
  /** 外距與寬度,讓頁首跟該頁內容對齊(預設 max-w-6xl) */
  className?: string;
}

const PublicHeader = ({ actions, className }: PublicHeaderProps) => {
  const { language, t } = useLanguage();
  const homeHref = landingHomeUrl(language);

  const logo = (
    <img
      src="/logo.png"
      alt="iFoodmap"
      width={192}
      height={56}
      className="h-8 w-auto sm:h-10"
    />
  );

  return (
    <header
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1",
        className,
      )}
    >
      {IS_ADMIN_BUILD ? (
        <span className="inline-flex min-h-11 items-center">{logo}</span>
      ) : (
        // -ml-2 抵掉 px-2,讓 logo 圖本身貼齊內容左緣
        <a
          href={homeHref}
          aria-label={t("public.homeAria")}
          className={cn(
            "-ml-2 inline-flex min-h-11 items-center rounded-md px-2 transition-opacity hover:opacity-75",
            FOCUS_RING,
          )}
        >
          {logo}
        </a>
      )}

      {(actions || !IS_ADMIN_BUILD) && (
        // -mr-3 抵掉最右邊那顆的 px-3,文字貼齊內容右緣;
        // 極窄螢幕放不下而換行時,ml-auto 讓這組仍靠右
        <div className="-mr-3 ml-auto flex items-center gap-1">
          {actions}
          {!IS_ADMIN_BUILD && (
            <a
              href={homeHref}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900",
                FOCUS_RING,
              )}
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("public.backHome")}
            </a>
          )}
        </div>
      )}
    </header>
  );
};

export default PublicHeader;
