// 註冊完成頁 —— 使用者點確認信之後會落在這裡(signUp 的 emailRedirectTo)。
//
// 為什麼需要這一頁:signUp() 當下還沒有 session,所以 create_restaurant_onboarding
// 不能在那時候呼叫。餐廳資料先寄放在 user_metadata,等信箱確認、拿到 session 之後,
// 由這一頁把它撈出來完成建檔 —— 使用者不用回去把表單重填一次。

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Phase = "working" | "done" | "no-session" | "failed";

interface PendingMeta {
  pending_restaurant_name?: string;
  pending_contact_name?: string;
  pending_contact_phone?: string;
}

const RegisterCompletePage = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("working");
  const [detail, setDetail] = useState<string>("");
  // 確認信可能被點兩次(或 React 18 StrictMode 重跑 effect),onboarding 只能跑一次
  const ranRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      if (ranRef.current) return;
      ranRef.current = true;

      // Supabase 會把 token 放在 URL fragment,client 需要一點時間交換成 session
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; !session && i < 10; i += 1) {
        await new Promise((r) => setTimeout(r, 400));
        session = (await supabase.auth.getSession()).data.session;
      }

      if (cancelled) return;
      if (!session) { setPhase("no-session"); return; }

      // 已經有餐廳身分就直接進後台(重複點確認信會走到這)
      const { data: existing } = (await (supabase as never as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => {
              limit: (n: number) => Promise<{ data: unknown[] | null }>;
            };
          };
        };
      })
        .from("restaurant_accounts")
        .select("id")
        .eq("user_id", session.user.id)
        .limit(1)) as { data: unknown[] | null };

      if (existing?.length) {
        if (!cancelled) { setPhase("done"); setTimeout(() => navigate("/restaurant", { replace: true }), 1200); }
        return;
      }

      const meta = (session.user.user_metadata ?? {}) as PendingMeta;
      const name = meta.pending_restaurant_name?.trim();

      if (!name) {
        // 沒有暫存資料(例如舊帳號),請他回註冊頁補
        if (!cancelled) {
          setPhase("failed");
          setDetail("找不到註冊時填寫的餐廳資料,請回註冊頁重新填一次(信箱已完成驗證,不會重複建立帳號)。");
        }
        return;
      }

      const { data, error } = await (supabase as never as {
        rpc: (fn: string, args: Record<string, unknown>) =>
          Promise<{ data: string | null; error: { message: string } | null }>;
      }).rpc("create_restaurant_onboarding", {
        p_name: name,
        p_contact_name: meta.pending_contact_name?.trim() ?? null,
        p_contact_phone: meta.pending_contact_phone?.trim() ?? null,
      });

      if (cancelled) return;

      if (error || !data) {
        setPhase("failed");
        setDetail(error?.message ?? "餐廳資料建立失敗,請稍後再試或聯絡我們。");
        return;
      }

      setPhase("done");
      setTimeout(() => navigate("/restaurant", { replace: true }), 1200);
    };

    finish();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
      <Card className="p-8 max-w-md w-full text-center">
        {phase === "working" && (
          <>
            <Loader2 className="h-9 w-9 animate-spin text-emerald-600 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-slate-900">正在完成註冊</h1>
            <p className="text-sm text-slate-500 mt-2">信箱已驗證,正在為你建立餐廳資料…</p>
          </>
        )}

        {phase === "done" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-slate-900">註冊完成</h1>
            <p className="text-sm text-slate-500 mt-2">正在帶你進入餐廳後台…</p>
          </>
        )}

        {phase === "no-session" && (
          <>
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-slate-900">連結已失效</h1>
            <p className="text-sm text-slate-500 mt-2 mb-5">
              確認連結可能已經過期或被使用過。請直接用你註冊的帳號密碼登入。
            </p>
            <Button asChild className="w-full"><Link to="/">前往登入</Link></Button>
          </>
        )}

        {phase === "failed" && (
          <>
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-slate-900">還差一步</h1>
            <p className="text-sm text-slate-500 mt-2 mb-5">{detail}</p>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link to="/">回登入頁</Link>
              </Button>
              <Button asChild className="flex-1">
                <Link to="/register/restaurant">回註冊頁</Link>
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default RegisterCompletePage;
