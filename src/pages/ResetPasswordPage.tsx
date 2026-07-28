// 忘記密碼 —— 一頁處理兩種情境:
//
//   A. 從登入頁點「忘記密碼」進來(沒有 session)
//      → 輸入 email,寄出重設連結
//
//   B. 從重設信裡點連結回來(Supabase 已把 recovery token 換成 session)
//      → 直接設定新密碼
//
// 判斷方式:Supabase 會在 URL fragment 帶 type=recovery,並觸發
// PASSWORD_RECOVERY 事件。兩者都聽,避免時序問題漏掉。

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck, KeyRound } from "lucide-react";

type Mode = "request" | "sent" | "set-new" | "checking";

const MIN_PASSWORD = 6;

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // 從信裡點回來時,網址會帶 #access_token=...&type=recovery
    const hash = window.location.hash ?? "";
    const looksLikeRecovery = hash.includes("type=recovery");

    const settle = async () => {
      if (looksLikeRecovery) {
        // 等 supabase client 把 fragment 換成 session
        for (let i = 0; i < 12; i += 1) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) break;
          await new Promise((r) => setTimeout(r, 300));
        }
        if (!cancelled) setMode("set-new");
        return;
      }
      if (!cancelled) setMode("request");
    };

    settle();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) setMode("set-new");
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
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
      toast.success("密碼已更新", { description: "正在帶你進入系統…" });
      // 重設連結本身已經給了 session,直接進登入頁讓它依身分導向
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4 py-12">
      <Card className="p-6 md:p-8 w-full max-w-md">{children}</Card>
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
        <h1 className="text-lg font-semibold text-slate-900">重設信已寄出</h1>
        <p className="text-sm text-slate-500 mt-2 mb-1">
          如果 <span className="font-medium text-slate-700">{email}</span> 是已註冊的帳號,
          你會收到一封重設密碼的信。
        </p>
        <p className="text-xs text-slate-400 mb-6">
          沒收到的話,記得看看垃圾郵件匣。連結一小時內有效。
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/">回登入頁</Link>
        </Button>
      </div>
    );
  }

  if (mode === "set-new") {
    return shell(
      <>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-5 w-5 text-emerald-600" />
          <h1 className="text-lg font-semibold text-slate-900">設定新密碼</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">設定完成後會自動帶你進入系統</p>

        <form onSubmit={savePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">新密碼</Label>
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
            更新密碼
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
