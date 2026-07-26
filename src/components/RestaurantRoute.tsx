import { useEffect, useState, createContext, useContext } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type RestaurantRole = "owner" | "manager" | "purchaser";

export interface RestaurantAccount {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  role: RestaurantRole;
  restaurant_name: string;
}

const RestaurantContext = createContext<RestaurantAccount | null>(null);

/** 目前登入者的餐廳身分。只能在 /restaurant/* 底下使用。 */
export const useRestaurant = (): RestaurantAccount => {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurant 必須在 RestaurantRoute 底下使用");
  return ctx;
};

/** 成本與毛利只對 owner / manager 開放 —— 採購員看不到 */
export const canSeeCost = (role: RestaurantRole): boolean =>
  role === "owner" || role === "manager";

/** 採購單需要簽核才能送出的角色 */
export const needsApproval = (role: RestaurantRole): boolean => role === "purchaser";

interface Props {
  children: React.ReactNode;
}

const RestaurantRoute = ({ children }: Props) => {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<RestaurantAccount | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 注意:絕對不要在 onAuthStateChange 的 callback 裡呼叫 supabase.auth.getSession()
    // —— supabase-js v2 在 callback 期間持有 auth lock,會直接鎖死(頁面永遠停在 loading)。
    // 一律用 callback 帶進來的 session。
    const load = async (session: { user: { id: string } } | null) => {
      if (!session) {
        if (!cancelled) { setAccount(null); setLoading(false); }
        return;
      }

      const { data } = (await (supabase as never as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: string) => {
              eq: (col: string, v: boolean) => {
                limit: (n: number) => Promise<{ data: unknown[] | null }>;
              };
            };
          };
        };
      })
        .from("restaurant_accounts")
        .select("id, restaurant_id, branch_id, role, restaurants(name)")
        .eq("user_id", session.user.id)
        .eq("is_active", true)
        .limit(1)) as { data: unknown[] | null };

      const row = data?.[0] as {
        id: string; restaurant_id: string; branch_id: string | null;
        role: RestaurantRole; restaurants?: { name?: string } | null;
      } | undefined;

      if (!cancelled) {
        setAccount(row
          ? {
              id: row.id,
              restaurant_id: row.restaurant_id,
              branch_id: row.branch_id,
              role: row.role,
              restaurant_name: row.restaurants?.name ?? "我的餐廳",
            }
          : null);
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => load(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // 跳出 callback 的 lock 之後才查 DB
      setTimeout(() => { if (!cancelled) load(session); }, 0);
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!account) return <Navigate to="/" replace />;

  return (
    <RestaurantContext.Provider value={account}>
      {children}
    </RestaurantContext.Provider>
  );
};

export default RestaurantRoute;
