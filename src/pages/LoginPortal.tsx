// 登入首頁 —— 前台站的 `/`。
//
// 使用者登出後看到的第一個畫面:先選身分(餐廳 / 供應商),再登入。
// 管理員不在這裡 —— 平台營運後台是獨立網域。

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  UtensilsCrossed, Truck, Shield, Eye, EyeOff, Loader2, ArrowLeft, Check, Globe,
} from "lucide-react";
import {
  getUserPortals, defaultPortal, hasPortal, portalHref,
  ADMIN_SITE_URL, IS_ADMIN_BUILD, PORTAL_LABEL, type PortalKey,
} from "@/lib/portal";

interface RoleCard {
  key: PortalKey;
  title: string;
  icon: typeof UtensilsCrossed;
  bullets: string[];
  accent: string;
  /** 項目符號的底色。不可由 accent 用 replace 推導 —— Tailwind 掃不到 runtime 字串 */
  dot: string;
  ring: string;
  footer: { text: string; linkText: string; to: string } | null;
}

const ROLE_CARDS: RoleCard[] = [
  {
    key: "restaurant",
    title: "我是餐廳",
    icon: UtensilsCrossed,
    bullets: ["智慧採購與自動補貨提醒", "菜單成本與毛利分析", "收貨確認與拍照對帳"],
    accent: "text-emerald-600",
    dot: "bg-emerald-600",
    ring: "ring-emerald-500 border-emerald-500 bg-emerald-50/60",
    footer: { text: "還沒有帳號?", linkText: "免費建立餐廳帳號", to: "/register/restaurant" },
  },
  {
    key: "supplier",
    title: "我是供應商",
    icon: Truck,
    bullets: ["接單、線上報價與出貨管理", "商機雷達:誰在找你的品項", "定價助手與需求預測"],
    accent: "text-blue-600",
    dot: "bg-blue-600",
    ring: "ring-blue-500 border-blue-500 bg-blue-50/60",
    footer: { text: "想成為供應商?", linkText: "免費上架申請", to: "/join" },
  },
];

// 管理員站只顯示這一張,不出現餐廳/供應商
const ADMIN_CARD: RoleCard = {
  key: "admin",
  title: "平台營運後台",
  icon: Shield,
  bullets: ["交易全流程看板與訂單履歷", "會員、食材主檔與資料維護", "成長數據與媒合品質監控"],
  accent: "text-slate-700",
  dot: "bg-slate-700",
  ring: "ring-slate-700 border-slate-700 bg-slate-100",
  footer: null,
};

const CARDS = IS_ADMIN_BUILD ? [ADMIN_CARD] : ROLE_CARDS;

const REMEMBERED_EMAIL_KEY = "ifm_remembered_email";

const LoginPortal = () => {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const [selected, setSelected] = useState<PortalKey | null>(
    CARDS.length === 1 ? CARDS[0].key : null
  );
  // 「記住我」只記 email。密碼不進 localStorage —— 那是純文字、任何 XSS 都讀得到,
  // 而這把密碼進得去平台所有資料。密碼交給瀏覽器/系統的密碼管理員(加密儲存)處理,
  // 表單的 autoComplete 屬性已經讓它能正常運作。
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ""; } catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => {
    try { return !!localStorage.getItem(REMEMBERED_EMAIL_KEY); } catch { return false; }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // 已登入就直接送進他的後台(登出後回到這頁才會停留)
  useEffect(() => {
    let cancelled = false;

    const route = async (session: Parameters<typeof getUserPortals>[0]) => {
      if (!session) { if (!cancelled) setChecking(false); return; }
      const portals = await getUserPortals(session);
      const dest = defaultPortal(portals);
      if (cancelled) return;
      if (dest && !dest.external) navigate(dest.path, { replace: true });
      else setChecking(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => route(session));

    // 不要在 callback 內查 DB(supabase-js v2 auth lock 會死鎖)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setTimeout(() => { if (!cancelled) route(session); }, 0);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      try {
        if (remember) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch { /* 無痕模式寫不進去,不影響登入 */ }

      const portals = await getUserPortals(data.session);

      if (portals.length === 0) {
        await supabase.auth.signOut();
        toast.error("這個帳號還沒有開通任何後台", {
          description: "請聯絡 iFoodmap 服務窗口協助開通餐廳或供應商身分",
        });
        return;
      }

      // 選的角色跟實際身分不符 → 帶去他真正有的後台,並說清楚原因
      if (!hasPortal(portals, selected)) {
        const dest = defaultPortal(portals)!;
        toast.info(`這個帳號不是${PORTAL_LABEL[selected].replace("後台", "")}帳號`, {
          description: `已帶您前往「${dest.label}」${dest.orgName ? ` · ${dest.orgName}` : ""}`,
        });
        window.location.href = portalHref(dest);
        return;
      }

      const dest = portals.find((p) => p.key === selected)!;
      toast.success("登入成功", { description: dest.orgName ?? dest.label });
      window.location.href = portalHref(dest);
    } catch (err) {
      toast.error("登入失敗", {
        description: err instanceof Error ? err.message : "請確認帳號密碼是否正確",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const active = CARDS.find((c) => c.key === selected) ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col">
      <div className="flex justify-end px-4 pt-4">
        <button
          type="button"
          onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
        >
          <Globe className="h-4 w-4" />
          {language === "zh" ? "English" : "繁體中文"}
        </button>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <img src="/logo.png" alt="iFoodmap" className="h-10 mx-auto mb-4"
                 onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
              {IS_ADMIN_BUILD ? "iFoodmap 平台營運後台" : "登入 iFoodmap"}
            </h1>
            <p className="text-slate-500 mt-2">
              {IS_ADMIN_BUILD
                ? "僅限平台管理員使用"
                : "AI 食材媒合平台 —— 請先選擇您的身分"}
            </p>
          </div>

          {/* 角色卡 */}
          <div className={`grid gap-4 mb-8 ${CARDS.length > 1 ? "md:grid-cols-2" : "max-w-md mx-auto"}`}>
            {CARDS.map((card) => {
              const Icon = card.icon;
              const isOn = selected === card.key;
              return (
                <Card
                  key={card.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(card.key)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(card.key); }}
                  className={`p-6 cursor-pointer transition-all border-2 ${
                    isOn ? `ring-2 ${card.ring}` : "border-slate-200 hover:border-slate-300 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <Icon className={`h-8 w-8 ${card.accent}`} />
                    {isOn && <Check className={`h-5 w-5 ${card.accent}`} />}
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-3">{card.title}</h2>
                  <ul className="space-y-1.5">
                    {card.bullets.map((b) => (
                      <li key={b} className="text-sm text-slate-600 flex gap-2">
                        <span className={`mt-1.5 h-1 w-1 rounded-full shrink-0 ${card.dot}`} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>

          {/* 登入表單 */}
          {active && (
            <Card className="p-6 md:p-8 max-w-md mx-auto">
              {CARDS.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  換一個身分
                </button>
              )}

              <p className="font-semibold text-slate-900 mb-5">
                {active.title === "我是餐廳" ? "餐廳登入" : active.title === "我是供應商" ? "供應商登入" : "管理員登入"}
              </p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">電子郵件</Label>
                  <Input
                    id="email" type="email" autoComplete="username" required
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">密碼</Label>
                  <div className="relative">
                    <Input
                      id="password" type={showPassword ? "text" : "password"}
                      autoComplete="current-password" required
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                  />
                  <Label htmlFor="remember" className="text-sm font-normal text-slate-600 cursor-pointer">
                    記住我的帳號
                  </Label>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  登入
                </Button>
              </form>

              {active.footer && (
                <p className="text-sm text-slate-500 text-center mt-5">
                  {active.footer.text}{" "}
                  <Link to={active.footer.to} className="text-emerald-600 hover:underline font-medium">
                    {active.footer.linkText}
                  </Link>
                </p>
              )}
            </Card>
          )}

          {!active && (
            <p className="text-center text-sm text-slate-400">請點選上方卡片以繼續</p>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 py-6 px-4">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          {IS_ADMIN_BUILD ? (
            <a href="https://dish-to-supply.vercel.app" className="hover:text-slate-800">
              ← 回餐廳／供應商入口
            </a>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center">
              <Link to="/suppliers" className="hover:text-slate-800">合作供應商</Link>
              <Link to="/price-index" className="hover:text-slate-800">食材價格指數</Link>
              <Link to="/join" className="hover:text-slate-800">供應商入駐</Link>
            </div>
          )}
          {!IS_ADMIN_BUILD && (
            <a href={ADMIN_SITE_URL} className="hover:text-slate-800 whitespace-nowrap">
              平台管理員入口 →
            </a>
          )}
        </div>
      </footer>
    </div>
  );
};

export default LoginPortal;
