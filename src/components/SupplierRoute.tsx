import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SupplierAccount {
  id: string;
  supplier_id: string;
}

export default function SupplierRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [supplierAccount, setSupplierAccount] = useState<SupplierAccount | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setAuthenticated(false); return; }
        setAuthenticated(true);
        const { data } = await (supabase as any)
          .from("supplier_accounts")
          .select("id, supplier_id")
          .eq("user_id", session.user.id)
          .eq("is_active", true)
          .maybeSingle();
        setSupplierAccount(data ?? null);
      } catch {
        setSupplierAccount(null);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }

  if (!authenticated) return <Navigate to="/auth" replace />;

  if (!supplierAccount) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500">
        <ShieldX size={48} className="text-red-400" />
        <p className="text-lg font-medium">無供應商帳號</p>
        <p className="text-sm">此帳號尚未綁定供應商，請聯絡管理員。</p>
      </div>
    );
  }

  return <>{children}</>;
}
