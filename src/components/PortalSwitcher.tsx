// 多重身分切換器 —— 掛在三個後台的側邊欄。
//
// 一個人可能同時是平台管理員、某家供應商、某家餐廳(demo 帳號就是),
// 這個元件讓他不用登出就能在後台之間跳。
//
// ⚠️ 管理員站是獨立網域,Supabase session 依 origin 隔離在 localStorage,
//    所以跨到管理員站(或從管理員站跳回來)必須重新登入一次 —— UI 上要標清楚。

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDown, Check, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getUserPortals, portalHref, type PortalInfo, type PortalKey } from "@/lib/portal";

interface Props {
  /** 目前所在的後台 */
  current: PortalKey;
  /** 深色側邊欄(admin / 餐廳)或淺色(供應商) */
  tone?: "dark" | "light";
}

const PortalSwitcher = ({ current, tone = "dark" }: Props) => {
  const navigate = useNavigate();
  const [portals, setPortals] = useState<PortalInfo[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async (session: Parameters<typeof getUserPortals>[0]) => {
      const list = await getUserPortals(session);
      if (!cancelled) setPortals(list);
    };

    supabase.auth.getSession().then(({ data: { session } }) => load(session));

    // 不要在 callback 內查 DB(auth lock 死鎖)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setTimeout(() => { if (!cancelled) load(session); }, 0);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  // 只有一種身分就不用切換器
  if (portals.length < 2) return null;

  const active = portals.find((p) => p.key === current);
  const dark = tone === "dark";

  const go = (p: PortalInfo) => {
    if (p.key === current) return;
    if (p.external) window.location.href = portalHref(p);
    else navigate(p.path);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
            dark
              ? "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
          }`}
        >
          <span className="flex flex-col items-start min-w-0">
            <span className="font-medium truncate w-full text-left">
              {active?.label ?? "切換後台"}
            </span>
            {active?.orgName && (
              <span className={`text-[11px] truncate w-full text-left ${dark ? "text-slate-400" : "text-slate-500"}`}>
                {active.orgName}
              </span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-slate-500 font-normal">
          你有 {portals.length} 個後台的存取權
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {portals.map((p) => (
          <DropdownMenuItem
            key={p.key}
            onSelect={() => go(p)}
            className="flex items-start gap-2 py-2 cursor-pointer"
          >
            <div className="w-4 shrink-0 pt-0.5">
              {p.key === current && <Check className="h-4 w-4 text-emerald-600" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{p.label}</span>
                {p.external && <ExternalLink className="h-3 w-3 text-slate-400 shrink-0" />}
              </div>
              {p.orgName && <div className="text-xs text-slate-500 truncate">{p.orgName}</div>}
              {p.external && (
                <div className="text-[11px] text-amber-600 mt-0.5">另開新站,需重新登入</div>
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PortalSwitcher;
