// 忘記密碼 / 設定密碼 —— 一頁處理四種情境:
//
//   A. 從登入頁點「忘記密碼」進來(沒有 session)
//      → 輸入 email,寄出重設連結
//
//   B. 從重設信裡點連結回來(Supabase 已把 recovery token 換成 session)
//      → 直接設定新密碼。餐廳成員邀請信的連結帶 ?type=recovery,也走這條。
//
//   C. 從供應商開通的邀請信點連結回來(?type=invite)
//      → 「設定密碼以啟用供應商帳號」
//
//   D. 連結過期 / 無效 / 已經用過(GoTrue 在網址帶 error_code=otp_expired 之類)
//      → 說清楚原因,並提供「重新寄送設定密碼連結」
//
// 判斷方式:見 src/lib/auth-link.ts。recovery 仍以 hash 的 type=recovery 與
// PASSWORD_RECOVERY 事件為準(兩者都聽,避免時序問題漏掉)。

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { parseAuthLink } from "@/lib/auth-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import PublicHeader from "@/components/PublicHeader";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Loader2, MailCheck, KeyRound } from "lucide-react";

type Mode = "request" | "sent" | "set-new" | "checking" | "expired";
type Flow = "recovery" | "invite";

const MIN_PASSWORD = 6;

const hasSession = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return Boolean(session);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("checking");
  const [flow, setFlow] = useState<Flow>("recovery");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // supabase-js 換到 session 後會清掉 hash,所以一掛上就先讀
    const link = parseAuthLink(window.location.href);
    const isInvite = link.type === "invite";
    setFlow(isInvite ? "invite" : "recovery");

    const settle = async () => {
      // D. 連結過期 / 無效 / 已用過
      if (link.error) {
        if (!cancelled) setMode("expired");
        return;
      }

      // C. 供應商邀請:getSession() 會等 supabase-js 處理完網址;換不到 session 就是連結失效
      if (isInvite) {
        let ok = await hasSession();
        for (let i = 0; !ok && i < 2; i += 1) {
          await sleep(300);
          ok = await hasSession();
        }
        if (!cancelled) setMode((m) => (m === "set-new" ? m : ok ? "set-new" : "expired"));
        return;
      }

      // B. 從重設信裡點回來時,網址會帶 #access_token=...&type=recovery
      //    (餐廳成員邀請:?type=recovery#access_token=...&type=invite,也當成 recovery)
      const looksLikeRecovery = link.hashType === "recovery" || (link.type === "recovery" && link.hasAccessToken);
      if (looksLikeRecovery) {
        // 等 supabase client 把 fragment 換成 session
        for (let i = 0; i < 12; i += 1) {
          if (await hasSession()) break;
          await sleep(300);
        }
        if (!cancelled) setMode("set-new");
        return;
      }

      // A. 一般的忘記密碼(事件先到的話不要蓋掉)
      if (!cancelled) setMode((m) => (m === "checking" ? "request" : m));
    };

    settle();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || link.error) return;
      if (event === "PASSWORD_RECOVERY") setMode("set-new");
      // 邀請連結換到 session 時 supabase-js 發的是 SIGNED_IN
      if (isInvite && event === "SIGNED_IN" && session) setMode("set-new");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const requestLink = async (redirectTo: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      if (error) throw error;
      setMode("sent");
    } catch (err) {
      // 刻意不區分「這個信箱不存在」—— 避免被用來探測有哪些帳號
      toast.error("寄送失敗", {
        description: err instanceof Error ? err.message : "請稍後再試",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendLink = (e: React.FormEvent) => {
    e.preventDefault();
    requestLink(`${window.location.origin}/reset-password`);
  };

  // 連結失效時重寄:邀請流程帶回 ?type=invite,點開一樣是「設定密碼以啟用供應商帳號」
  const resendLink = (e: React.FormEvent) => {
    e.preventDefault();
    requestLink(`${window.location.origin}/reset-password${flow === "invite" ? "?type=invite" : ""}`);
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      toast.error(`密碼至少要 ${MIN_PASSWORD} 個字`);
      return;
    }
    if (password !== confirm) {
      toast.error("兩次輸入的密碼不一致");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (flow === "invite") {
        toast.success("密碼已設定,帳號已啟用", { description: "正在帶你進入供應商後台…" });
      } else {
        toast.success("密碼已更新", { description: "正在帶你進入系統…" });
      }
      // 連結本身已經給了 session,直接進登入頁讓它依身分導向
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      toast.error("更新失敗", {
        description: err instanceof Error ? err.message : "連結可能已過期,請重新申請一次",
      });
    } finally {
      setLoading(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col px-4 sm:px-6">
      <PublicHeader className="pt-3" />
      <main className="flex flex-1 items-center justify-center py-12">
        <Card className="p-6 md:p-8 w-full max-w-md">{children}</Card>
      </main>
    </div>
  );

  if (mode === "checking") {
    return shell(
      <div className="text-center py-6">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto" />
      </div>
    );
  }

  if (mode === "sent") {
    return shell(
      <div className="text-center">
        <MailCheck className="h-10 w-10 text-emerald-600 mx-auto mb-4" />
        {flow === "invite" ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">設定密碼的信已寄出</h1>
            <p className="text-sm text-slate-500 mt-2 mb-1">
              如果 <span className="font-medium text-slate-700">{email}</span> 是已開通的供應商帳號,
              你會收到一封重設密碼的信,點信裡的按鈕就能設定密碼。
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">重設信已寄出</h1>
            <p className="text-sm text-slate-500 mt-2 mb-1">
              如果 <span className="font-medium text-slate-700">{email}</span> 是已註冊的帳號,
              你會收到一封重設密碼的信。
            </p>
          </>
        )}
        <p className="text-xs text-slate-400 mb-6">
          沒收到的話,記得看看垃圾郵件匣。連結一小時內有效。
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/">回登入頁</Link>
        </Button>
      </div>
    );
  }

  if (mode === "expired") {
    return shell(
      <>
        <div className="text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-slate-900">
            {flow === "invite" ? "設定密碼的連結已失效" : "這個連結已失效"}
          </h1>
        </div>
        <p className="text-sm text-slate-500 mt-2">
          信裡的連結只能使用一次,而且寄出後 1 小時內有效。這個連結可能已經過期、已經用過,或是網址不完整。
        </p>
        <p className="text-sm text-slate-500 mt-2 mb-6">
          輸入{flow === "invite" ? "申請時填寫" : "你註冊時用"}的 Email,我們會重新寄一封設定密碼的信給你。
        </p>

        <form onSubmit={resendLink} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resend-email">電子郵件</Label>
            <Input
              id="resend-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            重新寄送設定密碼連結
          </Button>
        </form>

        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 mt-5">
          <ArrowLeft className="h-3.5 w-3.5" />
          回登入頁
        </Link>
      </>
    );
  }

  if (mode === "set-new") {
    const isInvite = flow === "invite";
    return shell(
      <>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-5 w-5 text-emerald-600" />
          <h1 className="text-lg font-semibold text-slate-900">
            {isInvite ? "設定密碼以啟用供應商帳號" : "設定新密碼"}
          </h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          {isInvite
            ? "你的供應商申請已通過。設定好密碼就能登入供應商後台,之後用這個 Email 與密碼登入。"
            : "設定完成後會自動帶你進入系統"}
        </p>

        <form onSubmit={savePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">{isInvite ? "密碼" : "新密碼"}</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                placeholder={`至少 ${MIN_PASSWORD} 個字`}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={show ? "隱藏密碼" : "顯示密碼"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">再輸入一次</Label>
            <Input
              id="confirm-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isInvite ? "設定密碼並啟用帳號" : "更新密碼"}
          </Button>
        </form>
      </>
    );
  }

  // mode === "request"
  return shell(
    <>
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" />
        回登入頁
      </Link>

      <h1 className="text-lg font-semibold text-slate-900">忘記密碼</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        輸入你註冊時用的信箱,我們會寄一封重設連結給你。
      </p>

      <form onSubmit={sendLink} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-email">電子郵件</Label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          寄送重設連結
        </Button>
      </form>
    </>
  );
};

export default ResetPasswordPage;
